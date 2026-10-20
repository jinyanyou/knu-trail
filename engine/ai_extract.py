"""사진·PDF·복잡한 텍스트에서 Claude로 수강 과목을 추출한다.

Claude는 '문서에 적힌 그대로' 과목명·코드·성적·학기를 옮기기만 하고, 교육과정 과목으로 인정할지는
engine.importer 의 규칙 매칭이 정한다. 그래서 AI가 없는 과목을 지어내도 교육과정 과목으로 들어가지 않는다.

ANTHROPIC_API_KEY (또는 ANTHROPIC_AUTH_TOKEN) 가 있을 때만 켜진다. 전송한 자료는 저장하지 않는다.
"""
import base64
import json
import os

import anthropic

from engine import importer

MODEL = "claude-opus-5"
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
PDF_TYPE = "application/pdf"

SYSTEM = """You read material from a Kyungpook National University (경북대학교) student — a transcript (성적표, 성적 조회 화면), a class timetable (시간표), or a list of courses — and list the courses in it.

- Copy course names and codes exactly as they appear (codes look like CAIB0227). Don't translate, expand, or correct names; the app matches them against the official catalog afterwards, and an unmatched name is shown to the student for review.
- A timetable repeats each course across days and rooms; list each course once. Timetables have no grades.
- Take year and semester from headers such as "2025학년도 1학기" or "2025-2". Summer and winter sessions are 여름계절 and 겨울계절. When the material doesn't show them, use 0 and "".
- grade is exactly as shown (A+, A0, B+, P, F, ...), or "" when there is none. credits is 0 when not shown.
- Skip totals, GPA rows, professor names, rooms, and times."""

SCHEMA = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": ["transcript", "timetable", "list", "unknown"]},
        "courses": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "code": {"type": "string"},
                    "year": {"type": "integer"},
                    "semester": {"type": "string", "enum": ["1학기", "2학기", "여름계절", "겨울계절", ""]},
                    "grade": {"type": "string"},
                    "credits": {"type": "integer"},
                },
                "required": ["name", "code", "year", "semester", "grade", "credits"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["kind", "courses"],
    "additionalProperties": False,
}


class AIExtractError(Exception):
    """사용자에게 그대로 보여줄 수 있는 메시지를 담는다."""


def enabled():
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def file_block(data: bytes, media_type: str):
    b64 = base64.standard_b64encode(data).decode("ascii")
    if media_type in IMAGE_TYPES:
        return {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}}
    if media_type == PDF_TYPE:
        return {"type": "document", "source": {"type": "base64", "media_type": PDF_TYPE, "data": b64}}
    raise AIExtractError(f"지원하지 않는 파일 형식입니다: {media_type} (PNG·JPG·WEBP·PDF만 가능)")


def _call_claude(content, client=None):
    client = client or anthropic.Anthropic()
    try:
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=SYSTEM,
            output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
            messages=[{"role": "user", "content": content}],
        )
    except anthropic.AuthenticationError as e:
        raise AIExtractError("AI 인식용 API 키가 올바르지 않습니다. 서버의 ANTHROPIC_API_KEY를 확인하세요.") from e
    except anthropic.RateLimitError as e:
        raise AIExtractError("AI 요청이 잠시 몰렸습니다. 조금 뒤에 다시 시도해 주세요.") from e
    except anthropic.BadRequestError as e:
        raise AIExtractError(f"AI가 이 자료를 읽지 못했습니다: {e.message}") from e
    except anthropic.APIStatusError as e:
        raise AIExtractError(f"AI 서버 오류({e.status_code})입니다. 잠시 뒤 다시 시도해 주세요.") from e
    except anthropic.APIConnectionError as e:
        raise AIExtractError("AI 서버에 연결하지 못했습니다. 네트워크를 확인하세요.") from e

    if response.stop_reason == "refusal":
        raise AIExtractError("AI가 이 자료의 처리를 거절했습니다. 텍스트로 붙여넣어 주세요.")
    if response.stop_reason == "max_tokens":
        raise AIExtractError("자료가 너무 길어 끝까지 읽지 못했습니다. 학기별로 나눠서 올려 주세요.")
    text = next((b.text for b in response.content if b.type == "text"), None)
    if not text:
        raise AIExtractError("AI 응답이 비어 있습니다. 다시 시도해 주세요.")
    return json.loads(text)


def extract(entry_year, *, file_bytes=None, media_type=None, text=None,
            default_year=None, default_semester=None, programs=(), client=None):
    content = []
    if file_bytes is not None:
        content.append(file_block(file_bytes, media_type))
    if text:
        content.append({"type": "text", "text": f"<material>\n{text}\n</material>"})
    content.append({"type": "text", "text": "이 자료에 있는 수강 과목을 모두 추출해 주세요."})

    data = _call_claude(content, client)
    cands = []
    for item in data["courses"]:
        course, method = importer.match_course(entry_year, item["name"], item["code"] or None, tuple(programs))
        year = item["year"] or default_year
        semester = item["semester"] or default_semester
        grade = importer.GRADE_ALIAS.get(item["grade"], item["grade"]) or None
        extra = {"name": item["name"], "credits": item["credits"] or None}
        cands.append(importer.candidate(course, f"ai+{method}" if method else "ai", year, semester, grade,
                                        f"{item['code']} {item['name']} {item['grade']}".strip(), extra))
        if course:
            cands[-1]["confidence"] = importer.CONFIDENCE[method]
    cands = importer.dedupe(cands)
    return {
        "kind": data["kind"],
        "candidates": cands,
        "unmatched_lines": [],
        "needs_term": any(c["year"] is None or c["semester"] is None for c in cands),
    }

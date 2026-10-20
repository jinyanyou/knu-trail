import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.app import app
from engine import ai_extract
from engine.importer import normalize, parse_text

TRANSCRIPT = """2025학년도 1학기
CAIB0227\t인공지능수학1\t3\t전필\tA+
CAIB0229\t프로그래밍 기초와 실습\t4\t전필\tB+
CLTR0041\t한국사\t3\t교양\tP
2025학년도 2학기
이산수학\t3\tA0
C/C++프로그래밍기초\t3\tA+
물리학Ⅰ\t3\tF
평점평균 3.85"""


def by_name(result):
    return {c["name"]: c for c in result["candidates"]}


def test_transcript_with_codes_terms_and_grades():
    r = by_name(parse_text(TRANSCRIPT, 2025))
    assert (r["인공지능수학1"]["year"], r["인공지능수학1"]["semester"], r["인공지능수학1"]["grade"]) == (2025, "1학기", "A+")
    assert r["인공지능수학1"]["method"] == "code"
    assert r["이산수학"]["semester"] == "2학기" and r["이산수학"]["method"] == "name_exact"
    assert r["물리학 I"]["grade"] == "F"


def test_grade_is_not_confused_with_letters_in_course_name():
    r = by_name(parse_text("C/C++프로그래밍기초\t3\tA+", 2025, 2025, "1학기"))
    assert r["C/C++프로그래밍기초"]["grade"] == "A+"


def test_comma_separated_list_without_term_needs_term():
    r = parse_text("기계학습입문, 신경망개론, 알고리즘", 2025)
    assert {c["name"] for c in r["candidates"]} == {"기계학습입문", "신경망개론", "알고리즘"}
    assert r["needs_term"]


def test_timetable_repeats_are_deduped_and_use_default_term():
    text = "월\t화\t수\n기계학습입문\t\t기계학습입문\nIT5-345\t신경망개론\t김교수\n\t신경망개론"
    r = parse_text(text, 2026, 2026, "2학기")
    assert sorted(c["name"] for c in r["candidates"]) == ["기계학습입문", "신경망개론"]
    assert all(c["grade"] is None and c["year"] == 2026 for c in r["candidates"])


def test_typos_match_with_low_confidence_and_keep_grade():
    r = by_name(parse_text("기게학습입문 B+", 2025, 2025, "1학기"))
    c = r["기계학습입문"]
    assert (c["method"], c["confidence"], c["grade"]) == ("name_fuzzy", "low", "B+")


def test_longest_name_wins_over_contained_shorter_name():
    r = parse_text("문제해결과 알고리즘 A0", 2025, 2025, "1학기")
    assert [c["name"] for c in r["candidates"]] == ["문제해결과 알고리즘"]


def test_unrecognized_lines_are_reported_not_invented():
    r = parse_text("점심 먹기\n동아리 회의", 2025)
    assert r["candidates"] == []
    assert r["unmatched_lines"] == ["점심 먹기", "동아리 회의"]


def test_normalize_roman_numerals():
    assert normalize("물리학Ⅰ") == normalize("물리학 I") == "물리학1"


# ── AI 경로 (가짜 Claude 응답) ────────────────────────────────────
class FakeClient:
    def __init__(self, payload, stop_reason="end_turn"):
        self.calls = []
        self.payload, self.stop_reason = payload, stop_reason
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(stop_reason=self.stop_reason,
                               content=[SimpleNamespace(type="text", text=json.dumps(self.payload, ensure_ascii=False))])


AI_PAYLOAD = {"kind": "timetable", "courses": [
    {"name": "기계학습입문", "code": "", "year": 0, "semester": "", "grade": "", "credits": 0},
    {"name": "신경망 개론", "code": "", "year": 0, "semester": "", "grade": "", "credits": 3},
    {"name": "없는과목 세미나", "code": "", "year": 0, "semester": "", "grade": "", "credits": 2},
]}


def test_ai_items_go_through_catalog_matching():
    fake = FakeClient(AI_PAYLOAD)
    r = ai_extract.extract(2026, file_bytes=b"\x89PNG", media_type="image/png",
                           default_year=2026, default_semester="2학기", client=fake)
    names = {c["name"]: c for c in r["candidates"]}
    assert names["기계학습입문"]["matched"] and names["기계학습입문"]["code"] == "CAIB0207"
    assert names["신경망개론"]["method"] == "ai+name_exact"
    assert not names["없는과목 세미나"]["matched"], "카탈로그에 없는 과목은 매칭되지 않은 채로 표시"
    assert all(c["year"] == 2026 and c["semester"] == "2학기" for c in r["candidates"])

    req = fake.calls[0]
    assert req["model"] == "claude-opus-5"
    assert req["fallbacks"] == "default" and req["betas"] == ["server-side-fallback-2026-07-01"]
    assert req["output_config"]["format"]["type"] == "json_schema"
    assert req["messages"][0]["content"][0]["type"] == "image"


def test_ai_refusal_becomes_friendly_error():
    with pytest.raises(ai_extract.AIExtractError, match="거절"):
        ai_extract.extract(2026, text="...", client=FakeClient(AI_PAYLOAD, stop_reason="refusal"))


def test_unsupported_file_type_for_ai():
    with pytest.raises(ai_extract.AIExtractError):
        ai_extract.file_block(b"x", "text/html")


# ── API ───────────────────────────────────────────────────────────
client = TestClient(app)


def test_import_text_endpoint():
    res = client.post("/api/import/text", json={"entry_year": 2025, "text": TRANSCRIPT})
    assert res.status_code == 200
    body = res.json()
    assert body["engine"] == "rules" and len(body["candidates"]) == 6


def test_image_upload_without_ai_key_is_400(monkeypatch):
    monkeypatch.setattr(ai_extract, "enabled", lambda: False)
    res = client.post("/api/import/file", data={"entry_year": "2026"},
                      files={"file": ("tt.png", b"\x89PNG", "image/png")})
    assert res.status_code == 400 and "AI 인식이 꺼져" in res.json()["detail"]


def test_image_upload_with_ai(monkeypatch):
    monkeypatch.setattr(ai_extract, "enabled", lambda: True)
    fake = FakeClient(AI_PAYLOAD)
    monkeypatch.setattr(ai_extract.anthropic, "Anthropic", lambda: fake)
    res = client.post("/api/import/file", data={"entry_year": "2026", "default_year": "2026", "default_semester": "2학기"},
                      files={"file": ("tt.png", b"\x89PNG", "image/png")})
    assert res.status_code == 200
    assert res.json()["engine"] == "ai" and len(res.json()["candidates"]) == 3


def test_other_file_types_are_415():
    res = client.post("/api/import/file", data={"entry_year": "2026"},
                      files={"file": ("a.txt", b"hello", "text/plain")})
    assert res.status_code == 415

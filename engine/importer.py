"""시간표·성적 목록 텍스트에서 수강 과목을 인식한다 (AI 없이 동작하는 규칙 기반).

지원하는 입력 예
- 포털 성적 조회 화면을 복사한 표 (탭 구분, 학기 제목 줄 포함)
    2025학년도 1학기
    CAIB0227	인공지능수학1	3	A+
- 과목명 나열:  기계학습입문, 신경망개론, 알고리즘 B+
- 시간표 복사본: 같은 과목이 요일마다 반복돼도 한 번만 인식

매칭 순서: 과목 코드 → 과목명 정확 일치 → 줄 안에 과목명 포함 → 비슷한 이름(오타)
AI(engine.ai_extract)가 사진·PDF에서 뽑은 과목도 같은 매칭을 거쳐야만 교육과정 과목으로 인정된다.
"""
import difflib
import re
import unicodedata
from functools import lru_cache

from engine import catalog

CODE_RE = re.compile(r"(?<![A-Z0-9])([A-Z]{4}\d{4})(?:-\d{1,3})?(?!\d)")
GRADE_RE = re.compile(r"(?<![A-Za-z0-9+])(A\+|A0|B\+|B0|C\+|C0|D\+|D0|NP|A|B|C|D|F|P|S|U|W)(?![A-Za-z0-9+/])")
TERM_RE = re.compile(
    r"(20\d{2})\s*(?:학년도|년)?\s*[-./]?\s*(?:(1|2)\s*학기|(여름|하계|겨울|동계)\s*(?:계절)?(?:학기)?|(?<=[-./])\s*(1|2)(?!\d))"
)
SEGMENT_SPLIT = re.compile(r"\t|\s{2,}|[,|;·]|\n")
ROMAN = {"Ⅰ": "1", "Ⅱ": "2", "Ⅲ": "3", "Ⅳ": "4"}
SEASON = {"여름": "여름계절", "하계": "여름계절", "겨울": "겨울계절", "동계": "겨울계절"}
GRADE_ALIAS = {"A": "A0", "B": "B0", "C": "C0", "D": "D0"}
MIN_NAME_LEN = 3  # 이보다 짧은 과목명은 '포함' 매칭에서 제외 (오인식 방지)


def normalize(text):
    """비교용 정규화: 전각→반각, 로마숫자→아라비아, 공백·기호 제거, 소문자."""
    text = "".join(ROMAN.get(ch, ch) for ch in text)
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"(?<=[\s가-힣])(III|II|I)(?![A-Za-z])", lambda m: str(len(m.group(1))), text)
    return re.sub(r"[^0-9a-z가-힣+#]", "", text.lower())


@lru_cache(maxsize=64)
def _name_index(entry_year, programs=()):
    index = {}
    for c in catalog.recognizable(entry_year, programs).values():
        index.setdefault(normalize(c["name"]), []).append(c)
    return index


def _pick(candidates, entry_year):
    """같은 이름의 과목이 여러 개면 입학연도 교육과정 과목 → 최근 연도 순으로 고른다."""
    major_codes = {c["code"] for c in catalog.curriculum(entry_year)["courses"]}
    return sorted(candidates, key=lambda c: (c["code"] not in major_codes, -c["year"]))[0]


def _match_names(line, entry_year, programs=()):
    """줄에서 과목명을 찾아 [(course, method, 줄에서 차지한 원문)] 반환."""
    index = _name_index(entry_year, programs)
    found = []

    # 1) 구분자로 나뉜 조각이 과목명과 정확히 같음
    for seg in SEGMENT_SPLIT.split(line):
        key = normalize(seg)
        if key in index:
            found.append((_pick(index[key], entry_year), "name_exact", seg))
    if found:
        return found

    # 2) 줄 안에 과목명이 포함됨 (긴 이름 우선, 겹치지 않게)
    norm_line = normalize(line)
    taken_spans = []
    for key in sorted((k for k in index if len(k) >= MIN_NAME_LEN and k in norm_line), key=len, reverse=True):
        start = norm_line.find(key)
        while start != -1:
            span = (start, start + len(key))
            if not any(s < span[1] and span[0] < e for s, e in taken_spans):
                taken_spans.append(span)
                found.append((_pick(index[key], entry_year), "name_contains", key))
                break
            start = norm_line.find(key, start + 1)
    if found:
        return found

    # 3) 오타 허용 (조각 단위, 성적·학점 숫자는 떼고 비교)
    keys = list(index)
    for seg in SEGMENT_SPLIT.split(line):
        cleaned = GRADE_RE.sub(" ", seg)
        cleaned = re.sub(r"(?<![가-힣A-Za-z0-9])\d+(?![가-힣A-Za-z0-9])", " ", cleaned)
        key = normalize(cleaned)
        if len(key) < MIN_NAME_LEN:
            continue
        close = difflib.get_close_matches(key, keys, n=1, cutoff=0.8)
        if close:
            found.append((_pick(index[close[0]], entry_year), "name_fuzzy", cleaned.strip()))
    return found


def _term(line):
    m = TERM_RE.search(line)
    if not m:
        return None
    year = int(m.group(1))
    if m.group(3):
        return year, SEASON[m.group(3)]
    sem = m.group(2) or m.group(4)
    return year, f"{sem}학기"


def _grade(line, consumed):
    rest = line
    for text in consumed:
        rest = rest.replace(text, " ")
    rest = CODE_RE.sub(" ", rest)
    grades = GRADE_RE.findall(rest)
    if not grades:
        return None
    g = grades[-1]
    return GRADE_ALIAS.get(g, g)


def match_course(entry_year, name=None, code=None, programs=()):
    """단일 과목(예: AI가 추출한 항목)을 교육과정 과목에 매칭. (course, method) 또는 (None, None)."""
    courses = catalog.recognizable(entry_year, programs)
    if code and code.upper() in courses:
        return courses[code.upper()], "code"
    if name:
        hits = _match_names(name, entry_year, programs)
        if len(hits) == 1:
            return hits[0][0], hits[0][1]
        if hits:  # 한 항목에서 여러 과목이 나오면 가장 긴 이름
            best = max(hits, key=lambda h: len(normalize(h[0]["name"])))
            return best[0], best[1]
    return None, None


CONFIDENCE = {"code": "high", "name_exact": "high", "name_contains": "medium", "name_fuzzy": "low"}


def candidate(course, method, year, semester, grade, source, extra=None):
    return {
        "code": course["code"] if course else None,
        "name": course["name"] if course else (extra or {}).get("name"),
        "credits": course["credits"] if course else (extra or {}).get("credits"),
        "category": course["category"] if course else None,
        "area": course.get("area") if course else None,
        "sub_area": course.get("sub_area") if course else None,
        "program": course.get("program") if course else None,
        "year": year,
        "semester": semester,
        "grade": grade,
        "method": method,
        "confidence": CONFIDENCE.get(method, "none") if course else "none",
        "matched": course is not None,
        "source": source.strip()[:200],
    }


def dedupe(cands):
    """시간표처럼 같은 과목이 반복되면 (코드, 연도, 학기)당 하나만. 성적이 있는 쪽을 남긴다."""
    seen = {}
    for c in cands:
        key = (c["code"] or c["name"], c["year"], c["semester"])
        if key not in seen or (c["grade"] and not seen[key]["grade"]):
            seen[key] = c
    return list(seen.values())


def parse_text(text, entry_year, default_year=None, default_semester=None, programs=()):
    """programs: 학생이 고른 다전공 학과 코드 — 그 학과 과목도 인식한다."""
    programs = tuple(programs)
    courses = catalog.recognizable(entry_year, programs)
    cur_term = (default_year, default_semester) if default_year or default_semester else None
    cands, unmatched = [], []

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        term = _term(line)
        if term:
            cur_term = term
        year, semester = cur_term or (None, None)

        hits = []
        for code in CODE_RE.findall(line):
            if code in courses:
                hits.append((courses[code], "code", code))
        if not hits:
            hits = _match_names(line, entry_year, programs)

        if not hits:
            leftover = TERM_RE.sub("", line)
            if re.search(r"[가-힣]{2,}", leftover) and not term:
                unmatched.append(line[:200])
            continue

        # 한 줄에 과목이 하나일 때만 성적을 그 과목의 것으로 본다
        grade = _grade(line, [h[2] for h in hits] + [h[0]["name"] for h in hits]) if len(hits) == 1 else None
        for course, method, _ in hits:
            cands.append(candidate(course, method, year, semester, grade, line))

    cands = dedupe(cands)
    return {
        "candidates": cands,
        "unmatched_lines": unmatched[:50],
        "needs_term": any(c["year"] is None or c["semester"] is None for c in cands),
    }

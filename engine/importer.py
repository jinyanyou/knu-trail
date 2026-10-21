"""시간표·성적 목록 텍스트에서 수강 과목을 인식한다 (AI 없이 동작하는 규칙 기반).

지원하는 입력 예
- 포털 성적 조회 화면을 복사한 표 (탭 구분, 학기 제목 줄 포함)
    2025학년도 1학기
    CAIB0227	인공지능수학1	3	A+
- 과목명 나열:  기계학습입문, 신경망개론, 알고리즘 B+
- 시간표 복사본: 같은 과목이 요일마다 반복돼도 한 번만 인식
- 성적증명서 PDF(써드피아 발급): <<2024학년도 1학기>> 아래에 '구분 과목명 학점 성적'이 한 줄에 여러 개 붙어 나옴

매칭 순서: 과목 코드 → 과목명 정확 일치 → 줄 안에 과목명 포함 → 비슷한 이름(오타)
AI(engine.ai_extract)가 사진·PDF에서 뽑은 과목도 같은 매칭을 거쳐야만 교육과정 과목으로 인정된다.
"""
import difflib
import re
import unicodedata
from functools import lru_cache

from engine import catalog

CODE_RE = re.compile(r"(?<![A-Z0-9])([A-Z]{4}\d{4})(?:-\d{1,3})?(?!\d)")
GRADE_RE = re.compile(r"(?<![A-Za-z0-9+])(A\+|A0|A-|B\+|B0|B-|C\+|C0|C-|D\+|D0|D-|NP|A|B|C|D|F|P|S|U|W)(?![A-Za-z0-9+/-])")
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


CONFIDENCE = {"code": "high", "name_exact": "high", "name_contains": "medium", "name_fuzzy": "low", "other_school": "none"}


# ── 성적증명서(써드피아) ──
CERT_TERM_RE = re.compile(r"<<\s*(20\d{2})\s*학년도\s*(?:(1|2)\s*학기|계절\s*학기\s*\(\s*(하계|동계|여름|겨울)\s*\))\s*>>")
CERT_KINDS = "전필|전선|전공|전기|전심|전교|전반|교양|일선|자선|공학|교직|선수|기공|융합|복수|부전|연계|마크"
CERT_GRADES = r"A\+|A0|A-|B\+|B0|B-|C\+|C0|C-|D\+|D0|D-|NP|F|P|S|U|W"
CERT_ROW_RE = re.compile(
    rf"({CERT_KINDS})\s+(.+?)\s+(\d{{1,2}})\s+({CERT_GRADES})(?=\s*(?:{CERT_KINDS})\s|\s*취득학점|\s*$)"
)
OTHER_SCHOOL_RE = re.compile(r"\(([^()]*대학교?)\)\s*$")
ENTRY_RE = re.compile(r"입학일자\s*:\s*(20\d{2})\s*년")


def entry_year_hint(text):
    """성적증명서의 입학일자로 학번(입학연도)을 짐작한다. 없으면 None."""
    m = ENTRY_RE.search(text)
    return int(m.group(1)) if m else None


def program_hints(text, entry_year, chosen=()):
    """증명서 머리말(소속·다전공 칸)에 적힌 융합·연계전공 → [{code, name, kind}]. 이미 고른 것은 뺀다.

    복수·부전공은 머리말에 소속 학과 이름도 함께 있어 헷갈리므로 융합·연계전공만 찾는다.
    """
    header = normalize(text.split("<<", 1)[0])
    hints = []
    for code, p in catalog.programs(entry_year).items():
        if code in chosen or p["kind"] not in ("convergence", "convergence_unlisted", "linked"):
            continue
        if normalize(p["name"]) in header:
            hints.append({"code": code, "name": p["name"],
                          "kind": "linked" if p["kind"] == "linked" else "convergence"})
    return hints


def parse_certificate(text, entry_year, programs=()):
    """써드피아 성적증명서 텍스트 → 후보 목록. 이 형식이 아니면 None.

    학기 제목(<<2024학년도 계절학기(하계)>>) 사이의 줄을 이어 붙인 뒤 '구분 과목명 학점 성적'을 차례로 뽑는다.
    과목명이 줄바꿈으로 잘려도('…(서울시립' / '대학교) 3 B+') 이어 붙이면 복원된다.
    """
    heads = list(CERT_TERM_RE.finditer(text))
    if not heads:
        return None
    cands = []
    for i, h in enumerate(heads):
        year = int(h.group(1))
        semester = f"{h.group(2)}학기" if h.group(2) else SEASON[h.group(3)]
        end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
        block = "".join(text[h.end():end].splitlines())
        for kind, name, credits, grade in CERT_ROW_RE.findall(block):
            name = name.strip()
            source = f"{kind} {name} {credits} {grade}"
            extra = {"name": name, "credits": int(credits)}
            # 다른 대학교에서 들은 학점교류 과목은 우리 학교 과목에 억지로 맞추지 않는다
            if OTHER_SCHOOL_RE.search(name):
                cands.append(candidate(None, "other_school", year, semester, grade, source, extra))
                continue
            course, method = match_course(entry_year, name=re.sub(r"\(\*[^)]*\)\s*$", "", name), programs=programs)
            cands.append(candidate(course, method, year, semester, grade, source, extra))
    return {"candidates": dedupe(cands), "unmatched_lines": [], "format": "certificate",
            "needs_term": False, "entry_year_hint": entry_year_hint(text),
            "program_hints": program_hints(text, entry_year, programs)}


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
    cert = parse_certificate(text, entry_year, programs)
    if cert is not None:
        return cert
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
        "entry_year_hint": entry_year_hint(text),
    }

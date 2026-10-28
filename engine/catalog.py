"""수집된 교육과정·교양 데이터를 읽고, 과목 코드를 이수구분(전공필수/전공/교양/일반선택)으로 분류한다.

분류 원칙 (교육과정 운영 및 이수에 관한 지침)
- 전공 여부는 '입학연도' 교육과정 기준
- 교양 영역은 '이수할 당시' 교양 교육과정 기준 → 수강 연도의 교양 데이터로 판정
- 교육과정에 없는 타학과 과목은 일반선택
"""
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"

MAJOR_REQUIRED = "전공필수"
MAJOR = "전공"
LIBERAL_ARTS = "교양"
GENERAL_ELECTIVE = "일반선택"


@dataclass(frozen=True)
class CourseInfo:
    code: str
    name: str
    credits: int | None
    category: str                 # 전공필수 / 전공 / 교양 / 일반선택
    area: str | None = None       # 교양: 첨성인기초 / 첨성인핵심 / 첨성인소양
    sub_area: str | None = None   # 교양: 글쓰기, 수리, 소프트웨어, 인문.사회 ...
    detail_area: str | None = None
    sdg: bool = False
    known: bool = True            # 데이터에서 찾았는지
    lookup_year: int | None = None


def _available(kind):
    return sorted(int(p.stem) for p in (DATA / kind).glob("*.json"))


def _nearest(kind, year):
    years = _available(kind)
    if not years:
        raise FileNotFoundError(f"data/{kind} 가 비어 있음 — scripts/fetch_*.py 를 먼저 실행")
    return min(years, key=lambda y: (abs(y - year), -y))


@lru_cache(maxsize=None)
def curriculum(entry_year):
    path = DATA / "curriculum" / f"{entry_year}.json"
    if not path.exists():
        raise FileNotFoundError(f"{entry_year}학번 교육과정 데이터 없음 (있는 학번: {_available('curriculum')})")
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def liberal_arts(year):
    """(실제 사용한 연도, {code: course}) — 해당 연도 데이터가 없으면 가장 가까운 연도."""
    used = _nearest("liberal_arts", year)
    doc = json.loads((DATA / "liberal_arts" / f"{used}.json").read_text(encoding="utf-8"))
    return used, {c["code"]: c for c in doc["courses"]}


def required_courses(entry_year):
    return [c for c in curriculum(entry_year)["courses"] if c["type"] == MAJOR_REQUIRED]


def standard_slot(entry_year, code):
    """표준개설모형상 (학년, 학기). 없으면 None."""
    for p in curriculum(entry_year)["standard_plan"]:
        if p["code"] == code:
            return p["grade"], p["semester"]
    return None


def classify(code, entry_year, year_taken=None, credits=None, name=None):
    major = {c["code"]: c for c in curriculum(entry_year)["courses"]}
    c = major.get(code)
    if c and c["type"] in (MAJOR_REQUIRED, MAJOR):
        return CourseInfo(code, c["name"], c["credits"], c["type"])

    la_year, la = liberal_arts(year_taken or entry_year)
    l = la.get(code)
    if l:
        return CourseInfo(code, l["name"], l["credits"], LIBERAL_ARTS, l["area"], l["sub_area"],
                          l["detail_area"], l["sdg"], lookup_year=la_year)

    if c or code.startswith("CLTR"):
        # 교양인데 수강 연도 교양 목록에 없음 → 영역 판정 불가
        return CourseInfo(code, (c or {}).get("name") or name or code, (c or {}).get("credits") or credits,
                          LIBERAL_ARTS, known=False, lookup_year=la_year)

    return CourseInfo(code, name or code, credits, GENERAL_ELECTIVE, known=False)


@lru_cache(maxsize=None)
def all_courses():
    """모든 학번 교육과정 + 모든 연도 교양을 합친 {code: course}. 과목 인식(가져오기)용.
    같은 코드가 여러 해에 있으면 가장 최근 연도 정보를 쓴다."""
    merged = {}
    for year in _available("curriculum"):
        for c in curriculum(year)["courses"]:
            merged[c["code"]] = {"code": c["code"], "name": c["name"], "credits": c["credits"],
                                 "category": c["type"], "year": year}
    for year in _available("liberal_arts"):
        for c in liberal_arts(year)[1].values():
            if merged.get(c["code"], {}).get("category") in (MAJOR_REQUIRED, MAJOR):
                continue
            merged[c["code"]] = {"code": c["code"], "name": c["name"], "credits": c["credits"],
                                 "category": LIBERAL_ARTS, "area": c["area"], "sub_area": c["sub_area"],
                                 "year": year}
    return merged


def area_examples(area, sub_areas, year, limit=5):
    _, la = liberal_arts(year)
    return [f"{c['name']} ({c['credits']}학점)" for c in la.values()
            if c["area"] == area and c["sub_area"] in sub_areas][:limit]


# ── 다전공 대상 학과·융합전공 (scripts/fetch_programs.py) ─────────────
@lru_cache(maxsize=None)
def _programs_file(year):
    doc = json.loads((DATA / "programs" / f"{year}.json").read_text(encoding="utf-8"))
    return {p["code"]: {**p, "curriculum_year": year} for p in doc["programs"]}


@lru_cache(maxsize=None)
def programs(entry_year):
    """{학과코드: program} — 입학연도 기준 교육과정. 해당 학번 데이터가 없으면 가장 가까운 학번.

    융합전공은 학번과 상관없이 2학년 이상이면 신청할 수 있어서, 입학 이후 새로 생긴 융합전공
    (예: 2026 신설 피지컬AI융합전공)도 넣는다 — 그 융합전공 교육과정이 처음 나온 해의 것을 쓴다.
    """
    used = _nearest("programs", entry_year)
    result = dict(_programs_file(used))
    for year in sorted(_available("programs"), key=lambda y: (y < used, abs(y - used))):
        for code, p in _programs_file(year).items():
            if p["kind"] == "convergence" and code not in result:
                result[code] = p
    return result


def program(entry_year, code):
    p = programs(entry_year).get(code)
    if p is None:
        raise KeyError(f"다전공 학과 코드 없음: {code}")
    return p


@lru_cache(maxsize=64)
def recognizable(entry_year, program_codes=()):
    """과목 인식용 목록: all_courses() + 학생이 고른 다전공 학과 과목 (인공지능전공·교양에 없는 것만)."""
    merged = dict(all_courses())
    for code in program_codes:
        p = programs(entry_year).get(code)
        for c in (p or {}).get("courses", []):
            merged.setdefault(c["code"], {"code": c["code"], "name": c["name"], "credits": c["credits"],
                                          "category": "다전공", "program": p["name"], "year": entry_year})
    return merged


@lru_cache(maxsize=None)
def software_substitutes(entry_year):
    """졸업자격인정 소프트웨어영역 — 입학년도 기준 대체과목 {code: name}과 전산 자격증 목록.
    대체과목: 2023학번 목록 / 2024학번 이후 목록 + 폐지된 교양 소프트웨어 과목. 자격증: 2024학번 이전 / 2025학번 이후"""
    doc = json.loads((DATA / "rules" / "software_substitutes.json").read_text(encoding="utf-8"))
    by_year = doc["by_entry_year"]
    key = max((y for y in by_year if int(y) <= entry_year), default=min(by_year))
    courses = {c["code"]: c["name"] for c in by_year[key] + doc["discontinued_liberal"]}
    cert_key = "2024" if entry_year <= 2024 else "2025"
    return {"courses": courses, "certificates": doc["certificates"][cert_key]}

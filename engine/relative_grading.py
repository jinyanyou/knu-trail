"""상대평가 권장 과목 — 수강생의 50% 이내에서 A등급을 줄 수 있는 3학년 이상 전공과목 (학기마다 학사과가 지정·공지).

데이터: data/rules/relative_grading/<학기>.json (scripts/import_relative_grading.py 가 공지 엑셀에서 만든다)
적용 단위는 교과목번호 + 개설대학 + 개설학과가 모두 같은 분반 전체라서, 같은 과목이라도 학생 소속 학과가 연
분반에만 '내 학과 개설 분반 해당'으로 본다. 다른 학과가 연 분반만 지정됐으면 어느 학과 분반인지 알려 준다.
지정은 학기마다 바뀌므로 학기별로 따로 두고, 화면은 그 과목을 들을 학기의 목록(없으면 가장 최근 목록)으로 보여 준다.
"""
import json
from functools import lru_cache

from engine import catalog

DIR = catalog.DATA / "rules" / "relative_grading"
RULE = "학업성적처리규정 제3조 2항 — 학과(부)장·전공주임이 지정한 3학년 이상 개설 전공과목은 A등급을 수강생의 50% 이내로 줄 수 있음"
MATCH = "교과목번호·개설대학·개설학과가 모두 같은 분반 전체에 적용"
CAVEAT = "지정 내역은 학기마다 바뀔 수 있고, 목록에 없어도 실습·영어 과목 등 원래 상대평가 권장으로 운영되던 과목은 그대로 적용됨"


def terms():
    """목록이 있는 학기 ['2026-2', '2027-1', ...] (오래된 순)"""
    return sorted(p.stem for p in DIR.glob("*.json"))


@lru_cache(maxsize=None)
def load(term):
    return json.loads((DIR / f"{term}.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def _sections_by_dept():
    """{개설학과 코드: (개설대학, 개설학과)} — 받아 둔 모든 학기 개설 강좌 (최근 학기 이름 우선)."""
    out = {}
    for path in sorted((catalog.DATA / "timetable").glob("*.json"), reverse=True):
        for s in json.loads(path.read_text(encoding="utf-8"))["courses"]:
            out.setdefault(s["dept_code"], (s["college"], s["dept"]))
    return out


def dept(code, name=None, college=None):
    """학과 코드 → 비교용 {code, college, name}. 개설 강좌에 그 코드가 있으면 거기 적힌 이름을 쓴다
    (교육과정은 '인공지능전공', 개설 강좌·지정 내역은 '전자공학부 인공지능전공'처럼 이름이 다르다)."""
    college_tt, name_tt = _sections_by_dept().get(code, (None, None))
    return {"code": code, "college": college_tt or college, "name": name_tt or name}


def applies(entry, d):
    """지정 내역 한 줄이 이 학과(또는 분반의 개설학과)에 해당하는지 — 코드가 같거나, 대학·학과 이름이 같으면."""
    if d["code"] and d["code"] in entry["dept_codes"]:
        return True
    return d["name"] == entry["dept"] and d["college"] in (None, entry["college"])


def home_depts(entry_year, program_codes=()):
    """학생 소속: 주전공(인공지능전공) + 고른 다전공 학과."""
    main = catalog.curriculum(entry_year)
    out = [dept(main["dept_code"], main["dept_name"])]
    for code in program_codes:
        p = catalog.programs(entry_year).get(code)
        if p:
            out.append(dept(code, p["name"], p.get("college")))
    return out


def for_student(entry_year, program_codes=()):
    """화면에 줄 지정 내역: {latest, lists: {학기: {notice_date, courses: {과목코드: {mine, offered_by}}}}, ...}

    mine        학생 소속 학과가 연 분반이 지정됨 → 그 분반을 들으면 해당
    offered_by  지정된 개설학과 목록 (분반 단위 비교·'○○학과 개설 분반만' 안내용)
    """
    home = home_depts(entry_year, program_codes)
    lists = {}
    for term in terms():
        doc = load(term)
        courses = {}
        for e in doc["courses"]:
            c = courses.setdefault(e["code"], {"mine": False, "offered_by": []})
            c["mine"] = c["mine"] or any(applies(e, d) for d in home)
            c["offered_by"].append({"college": e["college"], "dept": e["dept"], "dept_codes": e["dept_codes"]})
        lists[term] = {"notice_date": doc["notice_date"], "courses": courses}
    return {"latest": max(lists, default=None), "rule": RULE, "match": MATCH, "caveat": CAVEAT, "lists": lists}

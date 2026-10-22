from datetime import date

import pytest
from fastapi.testclient import TestClient

from backend.app import app
from engine import roadmap
from engine.graduation import evaluate


def test_first_term_is_the_next_registration():
    assert roadmap.first_term(date(2026, 10, 22)) == (2027, "1학기")
    assert roadmap.first_term(date(2027, 2, 1)) == (2027, "1학기")
    assert roadmap.first_term(date(2027, 5, 1)) == (2027, "2학기")


@pytest.mark.parametrize("entry_year,profile", [
    (2027, {}), (2025, {}), (2024, {}),
    (2027, {"programs": [{"kind": "convergence", "code": "1620"}]}),
])
def test_freshman_plan_fits_8_semesters_and_graduates(entry_year, profile):
    out = roadmap.plan(entry_year, [], profile, start=(entry_year, "1학기"))
    assert out["verified"] and out["unmet"] == [] and out["extra_terms"] == 0
    assert len(out["terms"]) == 8 and all(t["credits"] <= 18 for t in out["terms"])
    # 계획 과목을 수강 예정으로 넣으면 엔진도 '예정 포함 충족'으로 본다
    planned = [{k: c[k] for k in ("code", "name", "credits", "year", "semester") } | {"grade": None,
               **({"counts_for": c["counts_for"]} if c.get("counts_for") else {})}
               for t in out["terms"] for c in t["courses"]]
    rep = evaluate(entry_year, planned, profile)
    assert not [r for r in rep["requirements"] if r["status"] == "unmet"]


def test_required_courses_follow_recommended_semester():
    out = roadmap.plan(2027, [], {}, start=(2027, "1학기"))
    where = {c["name"]: (t["year"], t["semester"]) for t in out["terms"] for c in t["courses"]}
    assert where["인공지능수학1"] == (2027, "1학기")
    assert where["이산수학"] == (2027, "2학기")


def test_too_little_time_extends_terms_and_says_so():
    out = roadmap.plan(2024, [], {}, start=(2027, "1학기"))   # 4학년인데 아무것도 안 들음
    assert out["extra_terms"] > 0 or not out["verified"]


def test_roadmap_endpoint():
    r = TestClient(app).post("/api/roadmap", json={"entry_year": 2027, "taken": [], "start_year": 2027,
                                                   "start_semester": "1학기", "max_credits": 18})
    assert r.status_code == 200 and r.json()["verified"]


def test_alternatives_and_exclude():
    out = roadmap.plan(2027, [], {}, start=(2027, "1학기"))
    courses = [c for t in out["terms"] for c in t["courses"]]
    flexible = next(c for c in courses if c["alternatives"])
    required = next(c for c in courses if c["name"] == "인공지능수학1")
    assert required["alternatives"] == []          # 필수 과목은 대체 과목 없음
    again = roadmap.plan(2027, [], {}, start=(2027, "1학기"), exclude=[flexible["code"]])
    assert flexible["code"] not in {c["code"] for t in again["terms"] for c in t["courses"]}
    assert again["verified"]


def test_planned_courses_carry_a_kind_for_colour_coding():
    out = roadmap.plan(2027, [], {"programs": [{"kind": "convergence", "code": "1620"}]}, start=(2027, "1학기"))
    kinds = {c["kind"] for t in out["terms"] for c in t["courses"]}
    assert {"전공필수", "교양", "다전공"} <= kinds and kinds <= {"전공필수", "전공", "교양", "다전공", "자유선택", "일반선택"}


def test_timeline_reports_the_term_each_requirement_is_met():
    out = roadmap.plan(2025, [], {}, start=(2025, "1학기"))
    planned = [{k: c[k] for k in ("code", "name", "credits", "year", "semester")} | {"grade": None}
               for t in out["terms"] for c in t["courses"]]
    tl = roadmap.timeline(2025, planned, {})
    assert tl["met_at"]["total"] == "2028-2"                      # 총 학점은 마지막 학기에 채워짐
    assert all(v is None or v == "now" or v[:4].isdigit() for v in tl["met_at"].values())
    assert not [r for r in tl["report"]["requirements"] if r["status"] == "unmet"]
    # 이미 들은 과목만으로 채운 요건은 'now'
    done = [dict(c, grade="A0") for c in planned]
    assert roadmap.timeline(2025, done, {})["met_at"]["total"] == "now"


def test_timeline_api():
    res = TestClient(app).post("/api/roadmap/timeline", json={"entry_year": 2025, "taken": [
        {"code": "CAIB0227", "year": 2025, "semester": "1학기", "grade": None}]})
    assert res.status_code == 200 and "major_required" in res.json()["met_at"]

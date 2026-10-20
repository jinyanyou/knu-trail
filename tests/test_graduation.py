import json

import pytest

from engine import catalog
from engine.graduation import MET, MET_WITH_PLANNED, UNMET, WAIVED, evaluate


def req(report, rid):
    return next(r for r in report["requirements"] if r["id"] == rid)


def la_course(year, **kw):
    _, pool = catalog.liberal_arts(year)
    return next(c for c in pool.values() if all(c[k] == v for k, v in kw.items()))


def full_transcript(entry_year):
    """표준개설모형 전 과목 + 부족한 교양 영역을 채운 '졸업 가능' 성적표."""
    taken = [{"code": p["code"], "year": entry_year + p["grade"] - 1, "semester": p["semester"], "grade": "A0"}
             for p in catalog.curriculum(entry_year)["standard_plan"]]
    last = entry_year + 3
    for kw in ({"sub_area": "글쓰기"}, {"sub_area": "소프트웨어"}, {"sub_area": "수리"}):
        c = la_course(last, area="첨성인기초", **kw)
        taken.append({"code": c["code"], "year": last, "grade": "A0"})
    _, pool = catalog.liberal_arts(last)
    extras = [c for c in pool.values() if c["area"] == "첨성인소양"][:12]
    taken += [{"code": c["code"], "year": last, "grade": "B+"} for c in extras]
    taken += [{"code": f"ETC{i:04d}", "credits": 3, "year": last, "grade": "P"} for i in range(8)]
    return taken


def test_freshman_with_nothing_taken():
    rep = evaluate(2027, [])
    assert req(rep, "total")["earned"] == 0
    assert req(rep, "major_required")["required"] == 16
    assert len(req(rep, "major_required")["missing"]) == 16
    assert req(rep, "basic_math_science")["examples"], "부족한 영역에는 추천 과목이 붙어야 함"
    assert rep["ruleset"]["status"] == "provisional"
    assert any("확정 공지 전" in w for w in rep["warnings"])
    assert not rep["summary"]["graduation_ready"]


def test_missing_required_course_has_recommended_slot():
    rep = evaluate(2026, [])
    first = {m["name"]: m for m in req(rep, "major_required")["missing"]}
    assert first["인공지능수학1"]["recommended"] == "1학년 1학기"


def test_failed_course_is_excluded_and_retake_counts_once():
    taken = [
        {"code": "CAIB0227", "year": 2026, "semester": "1학기", "grade": "F"},
        {"code": "CAIB0227", "year": 2027, "semester": "1학기", "grade": "B+"},
        {"code": "CAIB0229", "year": 2026, "semester": "1학기", "grade": "C+"},
        {"code": "CAIB0229", "year": 2027, "semester": "1학기", "grade": "A0"},
    ]
    rep = evaluate(2026, taken)
    assert req(rep, "major")["earned"] == 3 + 4
    reasons = sorted(x["reason"] for x in rep["excluded"])
    assert reasons == ["성적 F — 학점 미취득", "재이수로 대체됨"]


def test_planned_courses_are_projected_separately():
    taken = [{"code": "CAIB0227", "year": 2027, "semester": "1학기"}]   # 성적 없음 = 수강 예정
    rep = evaluate(2027, taken)
    r = req(rep, "major")
    assert (r["earned"], r["planned"]) == (0, 3)
    assert req(rep, "major_required")["planned"] == 1


def test_planned_courses_can_complete_a_requirement():
    c = la_course(2026, area="첨성인핵심", sub_area="자연과학")
    rep = evaluate(2026, [{"code": c["code"], "year": 2026}])
    assert req(rep, "core_science")["status"] == MET_WITH_PLANNED


def test_math_science_waiver():
    rep = evaluate(2026, [], {"math_science_waived": True})
    assert req(rep, "basic_math_science")["status"] == WAIVED
    assert req(rep, "liberal_arts")["earned"] == 0, "면제는 학점으로 인정되지 않음"


def test_major_track_changes_major_minimum():
    assert req(evaluate(2026, []), "major")["required"] == 90
    assert req(evaluate(2026, [], {"major_track": "double_major"}), "major")["required"] == 61
    assert req(evaluate(2026, [], {"major_track": "single_minor"}), "major")["required"] == 73


def test_sdg_required_from_2024_only():
    assert not any(r["id"] == "sdg" for r in evaluate(2023, [])["requirements"])
    assert req(evaluate(2024, []), "sdg")["required"] == 3


def test_external_course_counts_for_total_but_not_knu_only_areas():
    c = la_course(2026, area="첨성인핵심", sub_area="인문.사회")
    rep = evaluate(2026, [{"code": c["code"], "year": 2026, "grade": "A0", "external": True}])
    assert req(rep, "total")["earned"] == c["credits"]
    assert req(rep, "core_humanities")["earned"] == 0


def test_liberal_arts_area_is_judged_by_year_taken():
    # 실용영어1(CLTR0411)은 2026 교양 목록에는 있고 2027 개편으로 빠짐
    ok = evaluate(2026, [{"code": "CLTR0411", "year": 2026, "grade": "A0"}])
    assert req(ok, "practical_english")["earned"] == 2
    moved = evaluate(2026, [{"code": "CLTR0411", "year": 2027, "grade": "A0"}])
    assert req(moved, "practical_english")["earned"] == 0
    assert any("영역을 판정하지 못했습니다" in w for w in moved["warnings"])
    assert req(moved, "liberal_arts")["earned"] == 2, "영역 판정은 못해도 교양 학점에는 포함"


def test_unknown_other_department_course_is_general_elective():
    rep = evaluate(2026, [{"code": "MATH0101", "credits": 3, "year": 2026, "grade": "A0"}])
    assert rep["courses"][0]["category"] == "일반선택"
    assert req(rep, "total")["earned"] == 3
    assert req(rep, "major")["earned"] == 0


def test_unknown_course_without_credits_warns():
    rep = evaluate(2026, [{"code": "MATH0101", "year": 2026, "grade": "A0"}])
    assert any("credits를 입력" in w for w in rep["warnings"])


def test_english_test_substitutes_credits():
    rep = evaluate(2026, [], {"english_test": "TOEIC 750"})
    r = req(rep, "practical_english")
    assert r["status"] == MET and "TOEIC 750" in r["note"]


@pytest.mark.parametrize("entry_year", [2023, 2024, 2025, 2026])
def test_full_transcript_is_graduation_ready_once_manual_items_confirmed(entry_year):
    taken = full_transcript(entry_year)
    rep = evaluate(entry_year, taken)
    assert rep["summary"]["blocking"] == [], json.dumps(
        [r for r in rep["requirements"] if r["status"] == UNMET], ensure_ascii=False)
    assert not rep["summary"]["graduation_ready"], "상담·전공영역 평가는 본인 확인 전까지 미완료"

    rep = evaluate(entry_year, taken, {"counseling_done": True, "major_assessment_done": True})
    assert rep["summary"]["graduation_ready"]


def test_joint_degree_counts_pnu_credits():
    taken = [{"code": "PNU0001", "name": "부산대 과목", "credits": 3, "year": 2026, "grade": "A0", "pnu": True}]
    r = req(evaluate(2026, taken, {"joint_degree": True}), "joint_degree")
    assert (r["earned"], r["required"]) == (3, 18)


def test_unsupported_entry_year():
    with pytest.raises(ValueError):
        evaluate(2022, [])

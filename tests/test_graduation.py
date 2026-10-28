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


def test_duplicates_are_not_called_retakes():
    taken = [
        {"code": "CAIB0227", "year": 2024, "semester": "1학기", "grade": "C+"},
        {"code": "CAIB0227", "year": 2027, "semester": "1학기", "grade": None},   # 이미 들은 과목을 예정으로 또 넣음
        {"code": "CAIB0229", "year": 2024, "semester": "1학기", "grade": "A0"},
        {"code": "CAIB0229", "year": 2024, "semester": "1학기", "grade": "A0"},   # 같은 학기 두 번
    ]
    rep = evaluate(2024, taken)
    assert req(rep, "major")["earned"] == 3 + 4 and req(rep, "major")["planned"] == 0
    reasons = sorted(x["reason"] for x in rep["excluded"])
    assert reasons == ["같은 학기에 중복 입력", "이미 이수한 과목 (수강 예정 중복)"]
    assert next(x for x in rep["excluded"] if x["code"] == "CAIB0227")["year"] == 2027


def test_student_can_override_category():
    taken = [
        {"code": "ETC-x", "name": "학과 인정 대체과목", "credits": 3, "year": 2024, "semester": "1학기", "grade": "A0",
         "category": "전공"},
        {"code": "ETC-y", "name": "학점교류 교양", "credits": 3, "year": 2024, "semester": "1학기", "grade": "B0",
         "category": "교양", "area": "첨성인기초", "sub_area": "수리"},
        {"code": "CAIB0227", "year": 2024, "semester": "1학기", "grade": "A0", "category": "일반선택"},
    ]
    rep = evaluate(2024, taken)
    assert req(rep, "major")["earned"] == 3
    assert req(rep, "liberal_arts")["earned"] == 3 and req(rep, "basic_math_science")["earned"] == 3
    assert req(rep, "major_required")["earned"] == 0     # 일반선택으로 바꾼 전공필수는 빠진다
    assert all(c["category_override"] for c in rep["courses"])
    assert ["첨성인기초", "수리"] in [list(a) for a in rep["liberal_areas"]]


def test_student_can_assign_any_course_to_a_chosen_program():
    taken = [{"code": "ETC-z", "name": "학과 인정 과목", "credits": 3, "year": 2026, "semester": "1학기", "grade": "A0",
              "counts_for": "1620"}]
    rep = evaluate(2024, taken, {"programs": [{"kind": "convergence", "code": "1620"}]})
    assert req(rep, "program:1620:credits")["earned"] == 3
    assert rep["courses"][0]["counts_for"] == "1620"
    # 고르지 않은 학과 코드는 무시
    rep = evaluate(2024, [{**taken[0], "counts_for": "9999"}], {"programs": [{"kind": "convergence", "code": "1620"}]})
    assert req(rep, "program:1620:credits")["earned"] == 0


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
    assert r["status"] == MET and "TOEIC 750" in r["note"] and r["replaced"] == "TOEIC 750"
    assert not r.get("examples")


@pytest.mark.parametrize("entry_year", [2023, 2024, 2025, 2026])
def test_full_transcript_is_graduation_ready_once_manual_items_confirmed(entry_year):
    taken = full_transcript(entry_year)
    rep = evaluate(entry_year, taken, {"counseling_count": 8})
    assert rep["summary"]["blocking"] == [], json.dumps(
        [r for r in rep["requirements"] if r["status"] == UNMET], ensure_ascii=False)
    assert not rep["summary"]["graduation_ready"], "전공영역 평가는 본인 확인 전까지 미완료"

    rep = evaluate(entry_year, taken, {"counseling_count": 8, "major_assessment_done": True})
    assert rep["summary"]["graduation_ready"]


def test_joint_degree_counts_pnu_credits():
    taken = [{"code": "PNU0001", "name": "부산대 과목", "credits": 3, "year": 2026, "grade": "A0", "pnu": True}]
    r = req(evaluate(2026, taken, {"joint_degree": True}), "joint_degree")
    assert (r["earned"], r["required"]) == (3, 18)


def test_unsupported_entry_year():
    with pytest.raises(ValueError):
        evaluate(2022, [])


def test_advisor_counseling_count():
    """필요 횟수는 8회 고정 — 예전에 입력한 counseling_required는 무시"""
    req = lambda prof: next(r for r in evaluate(2025, [], prof)["requirements"] if r["id"] == "advisor_counseling")
    r = req({})
    assert r["status"] == "unmet" and (r["earned"], r["required"], r["unit"]) == (0, 8, "회")
    r = req({"counseling_count": 3, "counseling_required": 2})
    assert r["status"] == "unmet" and (r["earned"], r["required"]) == (3, 8)
    assert req({"counseling_count": "8"})["status"] == "met"
    assert req({"counseling_count": 1, "counseling_done": True})["status"] == "met"
    assert req({"counseling_count": "abc"})["counseling"]["count"] is None


def test_manual_retake_mark_is_passed_through_without_changing_credits():
    """성적표엔 재수강 뒤 성적만 남는다 → 학생이 표시한 retake는 계산에 영향 없이 courses로 넘어간다"""
    base = [{"code": "CLTR0041", "year": 2025, "semester": "1학기", "grade": "A0"}]
    marked = [{**base[0], "retake": {"year": 2024, "semester": "1학기", "grade": "C0"}}]
    a, b = evaluate(2024, base), evaluate(2024, marked)
    assert req(a, "total")["earned"] == req(b, "total")["earned"] == 3
    assert b["courses"][0]["retake"] == {"year": 2024, "semester": "1학기", "grade": "C0"}
    assert a["courses"][0]["retake"] is None


@pytest.mark.parametrize("entry_year,code,ok", [
    (2023, "COMP0217", True),    # 2023학번 목록에만 있음
    (2024, "COMP0217", False),
    (2024, "COMP0204", True),    # 2024학번 이후 목록
    (2027, "ELEC0520", True),
    (2026, "CLTR0266", True),    # 폐지된 교양 소프트웨어 과목
])
def test_software_substitute_courses_by_entry_year(entry_year, code, ok):
    taken = [{"code": code, "year": entry_year, "semester": "1학기", "grade": "A0", "credits": 3}]
    r = req(evaluate(entry_year, taken), "software")
    assert (r["status"] == MET) is ok
    if ok:
        assert r["note"].startswith("대체과목 인정")


def test_software_certificate_list_follows_entry_year():
    assert req(evaluate(2024, []), "software")["certificates"]["label"] == "2024학번 이전"
    r = req(evaluate(2025, []), "software")
    assert r["certificates"]["label"] == "2025학번 이후"
    assert not any("워드프로세서" in names for _, names in r["certificates"]["list"])


@pytest.mark.parametrize("flag,waived", [
    ("transfer", {"practical_english", "software", "advisor_counseling"}),
    ("qualification_exempt", {"practical_english", "software", "advisor_counseling"}),
    ("foreign_student", {"software"}),
])
def test_graduation_qualification_exemptions(flag, waived):
    rep = evaluate(2025, [], {flag: True})
    got = {r["id"] for r in rep["requirements"] if r["group"] == "졸업자격인정" and r["status"] == "waived"}
    assert got == waived
    assert req(rep, "major_assessment")["status"] != "waived"   # 전공영역은 면제 대상 아님


@pytest.mark.parametrize("kind,ok", [("double", True), ("minor", True), ("linked", False)])
def test_english_department_program_counts_as_practical_english(kind, ok):
    rep = evaluate(2025, [], {"programs": [{"kind": kind, "code": "1102"}]})
    assert (req(rep, "practical_english")["status"] == MET) is ok


def test_software_alternative_done_or_planned():
    """홈에서 고른 다른 인정 방법: 받았으면 충족, 받을 예정이면 '예정 포함 충족' (로드맵이 과목을 넣지 않게)"""
    r = req(evaluate(2025, [], {"software_alternative": "정보처리기사"}), "software")
    assert r["status"] == MET and r["replaced"] == "정보처리기사" and not r["replaced_planned"]
    r = req(evaluate(2025, [], {"software_alternative": "정보처리기사", "software_alternative_planned": True}), "software")
    assert r["status"] == "planned" and r["note"] == "대체 예정: 정보처리기사"
    assert req(evaluate(2025, [], {"software_alternative": True}), "software")["status"] == MET


def test_english_test_planned_is_met_with_planned():
    r = req(evaluate(2025, [], {"english_test": "TOEIC 750", "english_test_planned": True}), "practical_english")
    assert r["status"] == "planned" and r["replaced_planned"] and r["note"] == "대체 예정: TOEIC 750"

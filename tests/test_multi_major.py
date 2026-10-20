"""다전공(복수·부·융합·연계전공) 계산."""
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app import app
from engine import catalog
from engine.graduation import PRIMARY, UNKNOWN, evaluate

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from fetch_programs import norm, parse_multi_major_credits  # noqa: E402

OFFICIAL = json.loads((catalog.DATA / "rules" / "convergence.json").read_text(encoding="utf-8"))

YEAR = 2026
client = TestClient(app)


def req(report, rid):
    return next(r for r in report["requirements"] if r["id"] == rid)


def course(report, code):
    return next(c for c in report["courses"] if c["code"] == code)


def ai_codes():
    return {c["code"]: c for c in catalog.curriculum(YEAR)["courses"]}


def shared_and_own(program_code):
    p = catalog.program(YEAR, program_code)
    ai = ai_codes()
    return ([c for c in p["courses"] if c["code"] in ai and ai[c["code"]]["type"] == "전공"],
            [c for c in p["courses"] if c["code"] not in ai])


def took(courses, year=YEAR + 2, grade="A0"):
    return [{"code": c["code"], "year": year, "grade": grade} for c in courses]


# ── 주전공 학점 기준 ─────────────────────────────────────────────
@pytest.mark.parametrize("programs, extra, expected", [
    ([], {}, 90),
    ([{"kind": "convergence", "code": "1O18"}], {}, 61),
    ([{"kind": "double", "code": "1403"}], {}, 61),
    ([{"kind": "minor", "code": "1301"}], {}, 73),
    ([{"kind": "minor", "code": "1301"}, {"kind": "minor", "code": "1403"}], {}, 61),
    ([], {"transfer": True}, 61),
    ([], {"teaching_course": True}, 61),
    ([], {"major_track": "double_major"}, 61),  # 예전 입력 방식도 그대로 동작
])
def test_primary_major_credits_follow_multi_major(programs, extra, expected):
    rep = evaluate(YEAR, [], {"programs": programs, **extra})
    assert req(rep, "major")["required"] == expected


# ── 다전공 요건 ─────────────────────────────────────────────────
def test_double_major_uses_dept_table_credits_and_required_courses():
    rep = evaluate(YEAR, [], {"programs": [{"kind": "double", "code": "1403"}]})
    credits = req(rep, "program:1403:credits")
    assert credits["required"] == 48  # 경영학부 2026학번 다전공 시 이수학점
    assert "기준표" in credits["note"]
    required = req(rep, "program:1403:required")
    assert required["required"] == len([c for c in catalog.program(YEAR, "1403")["courses"] if c["type"] == "전공필수"])
    assert len(required["missing"]) == required["required"]
    assert credits["group"] == required["group"] == "복수전공 · 경영학부"


def test_convergence_major_defaults_to_36_credits():
    rep = evaluate(YEAR, [], {"programs": [{"kind": "convergence", "code": "1O10"}]})
    assert req(rep, "program:1O10:credits")["required"] == 36


def test_minor_needs_21_credits_and_minor_required_courses():  # 2023학번부터 24학점
    code = next(p["code"] for p in catalog.programs(YEAR).values() if any(c["minor_required"] for c in p["courses"]))
    rep = evaluate(YEAR, [], {"programs": [{"kind": "minor", "code": code}]})
    assert req(rep, f"program:{code}:credits")["required"] == 24
    r = req(rep, f"program:{code}:required")
    assert r["label"] == "부전공 필수 과목"
    assert r["required"] == sum(c["minor_required"] for c in catalog.program(YEAR, code)["courses"])


def test_unknown_dept_credits_can_be_entered_by_hand():
    code = next(p["code"] for p in catalog.programs(YEAR).values()
                if p["kind"] == "major" and not p["multi_major_credits"])
    rep = evaluate(YEAR, [], {"programs": [{"kind": "double", "code": code}]})
    assert req(rep, f"program:{code}:credits")["status"] == UNKNOWN
    rep = evaluate(YEAR, [], {"programs": [{"kind": "double", "code": code, "min_credits": 50}]})
    r = req(rep, f"program:{code}:credits")
    assert r["required"] == 50 and r["note"] == "기준: 직접 입력"


def test_kind_mismatch_is_corrected_with_warning():
    rep = evaluate(YEAR, [], {"programs": [{"kind": "double", "code": "1O10"}]})
    assert req(rep, "program:1O10:credits")["label"] == "융합전공 학점"
    assert any("융합전공 기준으로" in w for w in rep["warnings"])
    rep = evaluate(YEAR, [], {"programs": [{"kind": "convergence", "code": "1403"}]})
    assert req(rep, "program:1403:credits")["label"] == "복수전공 학점"


def test_linked_programs_are_detected():
    linked = [p for p in catalog.programs(2023).values() if p["kind"] == "linked"]
    assert any(p["name"] == "빅데이터전공" for p in linked)
    rep = evaluate(2023, [], {"programs": [{"kind": "double", "code": linked[0]["code"]}]})
    assert req(rep, f"program:{linked[0]['code']}:credits")["label"] == "연계전공 학점"


def test_unknown_program_code_raises():
    with pytest.raises(KeyError):
        evaluate(YEAR, [], {"programs": [{"kind": "double", "code": "NOPE"}]})


def test_restricted_and_own_major_are_not_offered():
    names = [p["name"] for p in catalog.programs(YEAR).values()]
    assert "1O0109" not in catalog.programs(YEAR)
    assert not any(n in names for n in ("의예과", "간호학과", "약학과"))
    assert not any("모바일공학" in n for n in names)


# ── 과목 배정 (중복 인정 금지) ───────────────────────────────────
def test_other_dept_course_gets_name_and_credits_from_program():
    _, own = shared_and_own("1403")
    rep = evaluate(YEAR, took(own[:1]), {"programs": [{"kind": "double", "code": "1403"}]})
    c = course(rep, own[0]["code"])
    assert c["name"] == own[0]["name"] and c["credits"] == own[0]["credits"]
    assert c["counts_for"] == "1403"
    assert not any("학점을 알 수 없어" in w for w in rep["warnings"])
    assert req(rep, "program:1403:credits")["earned"] == own[0]["credits"]
    assert req(rep, "major")["earned"] == 0


def test_shared_course_counts_once():
    shared, _ = shared_and_own("1O18")
    assert shared, "피지컬AI융합전공은 인공지능전공 과목과 겹친다"
    rep = evaluate(YEAR, took(shared), {"programs": [{"kind": "convergence", "code": "1O18"}]})
    major = req(rep, "major")["earned"]
    conv = req(rep, "program:1O18:credits")["earned"]
    assert major + conv == sum(c["credits"] for c in shared) == req(rep, "total")["earned"]
    for c in shared:
        assert course(rep, c["code"])["eligible"] == [PRIMARY, "1O18"]


def test_shared_courses_fill_the_bigger_shortfall_first():
    shared, _ = shared_and_own("1O18")
    rep = evaluate(YEAR, took(shared[:2]), {"programs": [{"kind": "convergence", "code": "1O18"}]})
    # 주전공 61 부족 > 융합 36 부족 → 겹치는 과목은 우선 주전공으로
    assert {course(rep, c["code"])["counts_for"] for c in shared[:2]} == {PRIMARY}


def test_manual_counts_for_wins():
    shared, _ = shared_and_own("1O18")
    taken = [{**t, "counts_for": "1O18"} for t in took(shared[:1])]
    rep = evaluate(YEAR, taken, {"programs": [{"kind": "convergence", "code": "1O18"}]})
    c = course(rep, shared[0]["code"])
    assert c["counts_for"] == "1O18" and c["counts_for_auto"] is False
    assert req(rep, "program:1O18:credits")["earned"] == shared[0]["credits"]


def test_manual_counts_for_ignored_when_not_in_that_program():
    ai_only = next(c for c in ai_codes().values()
                   if c["type"] == "전공" and c["code"] not in catalog.program(YEAR, "1403")
                   and c["code"] not in {x["code"] for x in catalog.program(YEAR, "1403")["courses"]})
    rep = evaluate(YEAR, [{"code": ai_only["code"], "year": YEAR, "grade": "A0", "counts_for": "1403"}],
                   {"programs": [{"kind": "double", "code": "1403"}]})
    assert course(rep, ai_only["code"])["counts_for"] == PRIMARY


def test_ai_required_course_stays_in_primary_major():
    p = catalog.program(YEAR, "1O18")
    ai_req = {c["code"] for c in catalog.required_courses(YEAR)}
    overlap = [c for c in p["courses"] if c["code"] in ai_req]
    if not overlap:
        pytest.skip("피지컬AI융합전공에 인공지능전공 전공필수가 없음")
    rep = evaluate(YEAR, took(overlap), {"programs": [{"kind": "convergence", "code": "1O18"}]})
    assert all(course(rep, c["code"])["counts_for"] == PRIMARY for c in overlap)


def test_liberal_arts_course_is_not_moved_automatically(monkeypatch):
    # 실제 데이터엔 교양 과목이 다전공 교육과정에 거의 없어서, 경영학부 교육과정에 교양 과목 하나를 넣어 본다
    _, pool = catalog.liberal_arts(YEAR)
    la = next(iter(pool.values()))
    c = {"code": la["code"], "name": la["name"], "credits": la["credits"], "type": "전공",
         "minor_required": False, "grade": 1}
    real = catalog.programs(YEAR)
    fake = {**real, "1403": {**real["1403"], "courses": real["1403"]["courses"] + [c]}}
    monkeypatch.setattr(catalog, "programs", lambda year: fake)
    prog = fake["1403"]
    rep = evaluate(YEAR, took([c], year=YEAR), {"programs": [{"kind": "double", "code": prog["code"]}]})
    assert course(rep, c["code"])["counts_for"] is None
    assert req(rep, "liberal_arts")["earned"] == c["credits"]
    rep = evaluate(YEAR, [{**took([c], year=YEAR)[0], "counts_for": prog["code"]}],
                   {"programs": [{"kind": "double", "code": prog["code"]}]})
    assert course(rep, c["code"])["counts_for"] == prog["code"]
    assert req(rep, "liberal_arts")["earned"] == 0, "다전공으로 옮긴 교양은 교양 학점에서 빠진다"


def test_convergence_major_blocks_joint_degree():
    rep = evaluate(YEAR, [], {"programs": [{"kind": "convergence", "code": "1O10"}], "joint_degree": True})
    assert any("공동학위 대상이 아닙니다" in w for w in rep["warnings"])


# ── 기준표 파서 ─────────────────────────────────────────────────
def test_credit_table_parser_finds_ai_major():
    tables = parse_multi_major_credits()
    assert set(tables) >= {2023, 2024, 2025, 2026}
    for year in (2023, 2024, 2025, 2026):
        assert tables[year]["전자공학부인공지능전공"] == (61, 90)
    assert tables[2026]["경영학부"] == (48, 66)


def test_new_convergence_majors_are_offered_to_older_students():
    """융합전공은 학번과 무관하게 신청 가능 → 2026 신설 융합전공도 2023학번 목록에 있어야 한다."""
    new_in_2026 = {c for c, p in catalog.programs(2026).items() if p["kind"] == "convergence"}
    for year in (2023, 2024, 2025):
        assert new_in_2026 <= set(catalog.programs(year)), year
    p = catalog.programs(2023)["1O18"]
    assert p["curriculum_year"] == 2026
    rep = evaluate(2023, [], {"programs": [{"kind": "convergence", "code": "1O18"}]})
    assert "2026학년도 기준" in req(rep, "program:1O18:credits")["note"]


def test_convergence_is_judged_by_course_type_not_name():
    p = catalog.programs(2023)["1O0204"]  # 컴퓨터학부 글로벌소프트웨어융합전공 — 학부 안의 일반 전공
    assert p["kind"] == "major"
    assert catalog.programs(2026)["110K"]["kind"] == "convergence"  # PPE: 과목 대부분이 융합전공 구분


@pytest.mark.parametrize("year", range(2023, 2028))
def test_every_official_convergence_major_is_offered(year):
    offered = {norm(p["name"]) for p in catalog.programs(year).values() if p["kind"] == "convergence"}
    official = {norm(p["name"]) for p in OFFICIAL["programs"]}
    assert offered == official, "공식 목록과 정확히 같아야 함 (빠지거나 남는 것 없이)"


def test_name_alone_does_not_make_a_convergence_major():
    progs = catalog.programs(2026)
    # 이름에 '융합'이 있어도 학과이거나, 과목은 '융합전공' 구분이지만 선발 공고에 없는 과정
    assert progs["1O15"]["kind"] == "major"                  # ICT융합학과
    assert progs["1005"]["kind"] == "major"                  # 의생명융합공학과
    assert progs["1O19"]["kind"] == "convergence_unlisted"   # 지능신호처리 융합전공 (공고에 없음)
    rep = evaluate(2026, [], {"programs": [{"kind": "convergence", "code": "1O19"}]})
    assert any("선발 목록에 없습니다" in w for w in rep["warnings"])


def test_official_convergence_carries_host_and_graduation_rule():
    p = catalog.programs(2026)["1O18"]
    assert p["host"] == "컴퓨터학부" and p["quota"] == 80
    rep = evaluate(2026, [], {"programs": [{"kind": "convergence", "code": "1O18"}]})
    r = req(rep, "program:1O18:credits")
    assert "컴퓨터학부" in r["note"]
    assert "졸업 불가" in r["if_incomplete"]
    assert any("포기 신청" in w for w in rep["warnings"])
    rep = evaluate(2026, [], {"programs": [{"kind": "double", "code": "1403"}]})
    assert "일반선택" in req(rep, "program:1403:credits")["if_incomplete"]


def test_double_major_eligibility_follows_official_guide():
    progs = catalog.programs(2026)
    by_name = {p["name"]: p for p in progs.values()}
    assert "혁신신약학과" in by_name and "스마트생물산업기계공학과" in by_name   # 부분 일치로 잘못 빠지던 학과
    assert not {"약학과", "산업기계공학과", "간호학과"} & set(by_name)
    assert by_name["미술학과"]["allowed"] == {"double": False, "minor": True}     # 예술대학: 부전공만
    assert by_name["글로벌인재학부"]["allowed"]["double"] is False
    assert by_name["수학교육과"]["allowed"]["double"] == "teaching"               # 사범대학: 교직과정 이수자만
    assert by_name["경영학부"]["allowed"]["double"] is True
    art = by_name["미술학과"]["code"]
    rep = evaluate(2026, [], {"programs": [{"kind": "double", "code": art}]})
    assert any("복수전공을 할 수 없는" in w for w in rep["warnings"])
    edu = by_name["수학교육과"]["code"]
    rep = evaluate(2026, [], {"programs": [{"kind": "double", "code": edu}]})
    assert any("교직과정 이수자만" in w for w in rep["warnings"])
    rep = evaluate(2026, [], {"programs": [{"kind": "double", "code": edu}], "teaching_course": True})
    assert not any("교직과정 이수자만" in w for w in rep["warnings"])


def test_requirements_list_courses_still_to_take():
    rep = evaluate(YEAR, [], {"programs": [{"kind": "double", "code": "1403"}]})
    ai_electives = [c for c in catalog.curriculum(YEAR)["courses"] if c["type"] == "전공"]
    assert len(req(rep, "major")["options"]) == len(ai_electives)
    prog = catalog.program(YEAR, "1403")
    opts = req(rep, "program:1403:credits")["options"]
    required = {c["code"] for c in prog["courses"] if c["type"] == "전공필수"}
    assert opts and not {o["code"] for o in opts} & required, "필수 과목은 '빠진 과목'에, 선택 과목만 여기"
    took_one = took([{"code": opts[0]["code"]}])
    rep = evaluate(YEAR, took_one, {"programs": [{"kind": "double", "code": "1403"}]})
    assert opts[0]["code"] not in {o["code"] for o in req(rep, "program:1403:credits")["options"]}


def test_every_year_has_program_data():
    for year in range(2023, 2028):
        progs = catalog.programs(year)
        assert sum(p["kind"] == "convergence" for p in progs.values()) == len(OFFICIAL["programs"])
        assert sum(bool(p["multi_major_credits"]) for p in progs.values()) >= 100


# ── API ────────────────────────────────────────────────────────
def test_api_program_courses():
    body = client.get("/api/program-courses", params={"entry_year": YEAR, "code": "1403"}).json()
    assert body["name"] == "경영학부" and len(body["courses"]) == len(catalog.program(YEAR, "1403")["courses"])
    assert client.get("/api/program-courses", params={"entry_year": YEAR, "code": "NOPE"}).status_code == 404


def test_api_programs_list():
    body = client.get("/api/programs", params={"entry_year": YEAR}).json()
    by_code = {p["code"]: p for p in body["programs"]}
    assert by_code["1O18"]["kind"] == "convergence"
    assert by_code["1403"]["multi_major_credits"] == 48
    assert "courses" not in by_code["1403"]


def test_api_catalog_includes_selected_program_courses():
    _, own = shared_and_own("1403")
    body = client.get("/api/catalog", params={"entry_year": YEAR, "year": YEAR, "programs": "1403"}).json()
    extra = {c["code"]: c for c in body["courses"] if c["category"] == "다전공"}
    assert own[0]["code"] in extra and extra[own[0]["code"]]["program"] == "경영학부"
    assert client.get("/api/catalog", params={"entry_year": YEAR, "programs": "NOPE"}).status_code == 400


def test_api_evaluate_with_programs_and_bad_code():
    res = client.post("/api/evaluate", json={"entry_year": YEAR, "profile": {
        "programs": [{"kind": "convergence", "code": "1O18"}]}})
    assert res.status_code == 200
    assert res.json()["programs"][0]["name"] == "피지컬AI융합전공"
    bad = client.post("/api/evaluate", json={"entry_year": YEAR, "profile": {"programs": [{"kind": "double", "code": "NOPE"}]}})
    assert bad.status_code == 400
    assert client.post("/api/evaluate", json={"entry_year": YEAR, "profile": {
        "programs": [{"kind": "triple", "code": "1403"}]}}).status_code == 422


def test_import_recognizes_program_courses_only_when_selected():
    _, own = shared_and_own("1403")
    text = f"{YEAR}학년도 1학기\n{own[0]['name']}\tA0"
    without = client.post("/api/import/text", json={"entry_year": YEAR, "text": text}).json()
    with_prog = client.post("/api/import/text", json={"entry_year": YEAR, "text": text, "programs": ["1403"]}).json()
    assert own[0]["code"] in {c["code"] for c in with_prog["candidates"]}
    hit = next(c for c in with_prog["candidates"] if c["code"] == own[0]["code"])
    assert hit["program"] == "경영학부" and hit["grade"] == "A0"
    assert own[0]["code"] not in {c["code"] for c in without["candidates"]}

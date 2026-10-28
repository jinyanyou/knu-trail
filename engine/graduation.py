"""졸업요건 계산 엔진.

    from engine.graduation import evaluate
    report = evaluate(2027, taken=[{"code": "CAIB0227", "year": 2027, "semester": "1학기", "grade": "A+"}, ...],
                      profile={"math_science_waived": True})

    python -m engine.graduation examples/sample_2024.json      # 사람이 읽는 리포트

입력 과목(taken) 항목
    code        과목 코드 (필수)
    year        수강 연도 — 교양 영역을 '이수 당시' 기준으로 판정할 때 사용 (없으면 입학연도)
    semester    "1학기" / "2학기" / "여름계절" / "겨울계절" — 재이수 시 최신 판정용
    grade       A+ … D0, P, S / F, U, NP, W 는 미취득 / 없음(None) = 수강 예정
    credits     데이터에 없는 과목(타학과 등)의 학점
    name        데이터에 없는 과목의 이름
    external    True면 타 대학(교환학생 등) 이수 → 총학점에는 포함, 첨성인기초·핵심·SDG 영역에는 불인정
    pnu         True면 부산대 개설 과목 (공동학위 18학점 계산)
    counts_for  "primary"(인공지능전공) 또는 다전공 학과 코드 — 이 과목을 어느 전공에 인정할지 직접 지정.
                없으면 자동 배정 (한 과목은 한 전공에만 인정: 필수 과목 우선, 나머지는 부족한 쪽부터)
    retake      {"year", "semester", "grade"} — 학생이 직접 표시한 재수강 (성적표에 이전 수강이 안 남은 경우).
                계산에는 영향 없음(이전 학점은 이미 무효) — 화면 표시용으로 courses에 그대로 넘긴다

profile 항목 (모두 선택)
    programs                다전공 목록 [{"kind": "double"|"linked"|"convergence"|"minor", "code": 학과코드,
                            "min_credits": 학과 기준을 직접 입력할 때}] — 코드는 data/programs/<학번>.json
    transfer, teaching_course   편입생 / 교직과정 이수자 → 주전공 '다전공 시' 학점(61) 적용
                            (편입생은 졸업자격인정 실용영어·소프트웨어·상담도 면제)
    qualification_exempt    학교가 인정한 일괄 면제 대상(장애학생지원센터 등록 등) → 실용영어·소프트웨어·상담 면제.
                            사유(장애 여부)는 민감정보라 받지 않는다
    foreign_student         외국인 학생(2022학번 이후) → 소프트웨어 면제, 실용영어는 TOPIK 4급으로 대체
    major_track             programs 없이 학점 기준만 바꿀 때: "single"(기본) / "double_major" / "single_minor"
    math_science_waived     기초학력 진단평가 A → 수리·기초과학 이수 면제
    english_test            실용영어 대체 성적 보유 (예: "TOEIC 750") — 기준 충족 여부는 학생이 확인
    english_test_planned    위 대체를 아직 받기 전(예정) → '예정 포함 충족'
    software_alternative    소프트웨어 대체 인정(자격증, 45시간 교육 등) — True 또는 방법 글 (예: "정보처리기사")
    software_alternative_planned  위 대체를 아직 받기 전(예정) → '예정 포함 충족' 
    counseling_done         학생상담지도교수 상담 기준 충족
    major_assessment_done   전공영역 평가 통과
    joint_degree            부산대 공동학위 희망
"""
import json
import sys
from pathlib import Path

from engine import catalog
from engine.catalog import GENERAL_ELECTIVE, LIBERAL_ARTS, MAJOR, MAJOR_REQUIRED
from engine.rules import load_ruleset

FAILING_GRADES = {"F", "U", "NP", "W", "FA"}
SEMESTER_ORDER = {"1학기": 1, "여름계절": 2, "2학기": 3, "겨울계절": 4, "1,2학기": 3}

# 상태값
MET = "met"                   # 이미 충족
MET_WITH_PLANNED = "planned"  # 수강 예정 과목까지 들으면 충족
UNMET = "unmet"
WAIVED = "waived"
MANUAL = "manual"             # 학생 본인 확인 필요 (상담 등)
UNKNOWN = "unknown"           # 학교 기준 자체가 확인되지 않음


def _status(earned, planned, required):
    if earned >= required:
        return MET
    if earned + planned >= required:
        return MET_WITH_PLANNED
    return UNMET


def _normalize_taken(taken, entry_year):
    """낙제 과목 제외, 같은 과목이 여러 번 있으면 하나만 남긴다.

    - 둘 다 성적 있음(실제 재이수) → 가장 최근 것 (재이수 시 이전 학점 무효)
    - 이수 + 수강 예정 → 이수한 것 (예정은 이미 들은 과목)
    - 같은 학기에 두 번 → 중복 입력
    """
    latest, dropped = {}, []
    order = lambda t: (t["year"], SEMESTER_ORDER.get(t.get("semester"), 0))
    for t in taken:
        t = {**t, "year": t.get("year") or entry_year}
        grade = (t.get("grade") or "").strip().upper() or None
        if grade in FAILING_GRADES:
            dropped.append((t, f"성적 {grade} — 학점 미취득"))
            continue
        t["planned"] = grade is None
        key = t["code"]
        old = latest.get(key)
        if old is None:
            latest[key] = t
            continue
        newer, older = (t, old) if order(old) <= order(t) else (old, t)
        if old["planned"] != t["planned"]:
            keep, drop = (t, old) if old["planned"] else (old, t)  # 성적 있는 쪽
            why = "같은 학기에 중복 입력" if order(old) == order(t) else "이미 이수한 과목 (수강 예정 중복)"
        elif order(old) == order(t):
            keep, drop, why = old, t, "같은 학기에 중복 입력"
        elif t["planned"]:
            keep, drop, why = older, newer, "수강 예정 중복"
        else:
            keep, drop, why = newer, older, "재이수로 대체됨"
        latest[key] = keep
        dropped.append((drop, why))
    return list(latest.values()), dropped


def _count(v):
    """사용자가 입력한 횟수 (빈칸·잘못된 값은 None, 음수는 0)."""
    try:
        return max(0, int(v)) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _credits(item):
    return item["info"].credits if item["info"].credits is not None else (item.get("credits") or 0)


def _tally(items, pred):
    earned = sum(_credits(i) for i in items if pred(i) and not i["planned"])
    planned = sum(_credits(i) for i in items if pred(i) and i["planned"])
    return earned, planned


def _counted(items, pred):
    """요건에 들어간 과목 — 화면에서 그 요건을 눌러 과목을 고칠 때 쓴다 (코드·연도·학기로 입력과 맞춘다)."""
    return [{"code": i["code"], "year": i["year"], "semester": i.get("semester")} for i in items if pred(i)]


def _req(rid, group, label, required, earned, planned, unit="학점", status=None, **extra):
    return {
        "id": rid, "group": group, "label": label, "unit": unit,
        "required": required, "earned": earned, "planned": planned,
        "status": status or _status(earned, planned, required),
        **extra,
    }


PRIMARY = "primary"
CATEGORIES = (MAJOR_REQUIRED, MAJOR, LIBERAL_ARTS, GENERAL_ELECTIVE)


def _major_track(profile):
    """주전공 학점 기준: 다전공(복수·연계·융합, 부전공 2개 이상)·편입·교직 → 다전공 시, 부전공 1개만 → +12."""
    kinds = [p["kind"] for p in profile.get("programs") or []]
    if profile.get("transfer") or profile.get("teaching_course") or any(k != "minor" for k in kinds) or len(kinds) > 1:
        return "double_major"
    if kinds == ["minor"]:
        return "single_minor"
    return profile.get("major_track", "single")


def _lookup(prog, item):
    """다전공 학과 교육과정에서 이 과목 찾기 (코드 → 공백 뺀 이름)."""
    return prog["by_code"].get(item["code"]) or prog["by_name"].get(item["info"].name.replace(" ", ""))


def _load_programs(entry_year, rs, profile, warnings):
    """profile.programs → 계산용 다전공 목록 (요건 학점, 필수 과목, 과목 색인)."""
    mm = rs["multi_major"]
    selected = profile.get("programs") or []
    if len(selected) > mm["max_programs"]:
        warnings.append(f"다전공은 {mm['max_programs']}개까지만 계산합니다.")
    out, seen = [], set()
    for sel in selected[:mm["max_programs"]]:
        if sel["code"] in seen:
            continue
        seen.add(sel["code"])
        p = catalog.program(entry_year, sel["code"])
        kind = sel["kind"]
        # 융합·연계전공은 종류가 정해져 있음
        fixed = {"convergence": "convergence", "convergence_unlisted": "convergence", "linked": "linked"}.get(p["kind"])
        if fixed and kind != fixed:
            kind = fixed
        elif not fixed and kind in ("convergence", "linked"):
            kind = "double"
        if kind != sel["kind"]:
            warnings.append(f"{p['name']}은(는) {mm['kinds'][kind]['label']} 기준으로 계산했습니다 "
                            f"(선택: {mm['kinds'][sel['kind']]['label']}).")
        rule = mm["kinds"][kind]
        allowed = p.get("allowed") or {}
        if kind == "double" and allowed.get("double") is False:
            warnings.append(f"{p['name']}은(는) 복수전공을 할 수 없는 학과입니다 (부전공만 가능).")
        elif kind == "double" and allowed.get("double") == "teaching" and not profile.get("teaching_course"):
            warnings.append(f"{p['name']}은(는) 사범대학 학과라 교직과정 이수자만 복수전공할 수 있습니다.")
        if p["kind"] == "convergence_unlisted":
            warnings.append(f"{p['name']}은(는) 현재 학교 융합전공 선발 목록에 없습니다. 이미 이수 중인 경우에만 "
                            "의미가 있으니 주관학과에 운영 여부를 확인하세요.")
        if sel.get("min_credits"):
            min_credits, basis = sel["min_credits"], "직접 입력"
        elif rule.get("min_credits_from") == "program" and p.get("multi_major_credits"):
            min_credits = p["multi_major_credits"]
            basis = f"{p['credits_source']['table_year']}학번 전공학점 기준표의 '다전공 시 이수학점'"
        elif rule.get("min_credits"):
            min_credits, basis = rule["min_credits"], f"{rule['label']} 공통 기준"
        else:
            min_credits, basis = None, None
        if p["curriculum_year"] != entry_year and basis:
            basis += f" · 교육과정은 {p['curriculum_year']}학년도 기준"
        if rule.get("required_flag"):
            required = [c for c in p["courses"] if c.get(rule["required_flag"])]
        else:
            required = [c for c in p["courses"] if c["type"] == rule["required_course_type"]]
        out.append({
            "code": p["code"], "name": p["name"], "kind": kind, "label": rule["label"], "rule": rule,
            "min_credits": min_credits, "basis": basis, "required": required, "host": p.get("host"),
            "courses": p["courses"],
            "required_codes": {c["code"] for c in required},
            "by_code": {c["code"]: c for c in p["courses"]},
            "by_name": {c["name"].replace(" ", ""): c for c in p["courses"]},
        })
    return out


def _allocate(items, progs, major_min, required_names):
    """각 과목을 주전공(PRIMARY)·다전공 학과 중 한 곳에 배정한다 (같은 과목 중복 인정 금지).

    1) 학생이 counts_for로 지정했으면 그대로 (고른 다전공이면 교육과정에 없어도)
    2) 해당하는 곳이 하나뿐이면 거기
    3) 어느 한 곳의 필수 과목이면 그곳 (주전공 우선)
    4) 나머지 겹치는 과목은 이수 → 예정 순으로, 그 시점에 학점이 가장 많이 부족한 곳
    교양으로 분류된 과목은 학생이 직접 지정할 때만 다전공에 넣는다 (기본은 교양 학점).
    """
    by_code = {p["code"]: p for p in progs}
    mins = {PRIMARY: major_min, **{p["code"]: p["min_credits"] or p["rule"].get("min_credits") or 0 for p in progs}}

    for i in items:
        cat = i["info"].category
        pools = [PRIMARY] if cat in (MAJOR, MAJOR_REQUIRED) else []
        matches = [p["code"] for p in progs if _lookup(p, i)]
        pools += [] if cat == LIBERAL_ARTS else matches
        want = i.get("counts_for_request")
        i["counts_for"], i["auto"] = None, True
        # 학생이 고른 다전공으로 직접 지정하면 그 교육과정에 없는 과목(학과 인정 과목 등)도 그 전공에 넣는다
        if want and (want in pools or want in matches or want in by_code):
            i["counts_for"], i["auto"] = want, False
            pools = pools if want in pools else pools + [want]
        elif len(pools) == 1:
            i["counts_for"] = pools[0]
        i["pools"] = pools

    def required_in(i, pool):
        if pool == PRIMARY:
            return i["info"].category == MAJOR_REQUIRED or i["info"].name.replace(" ", "") in required_names
        hit = _lookup(by_code[pool], i)
        return bool(hit) and hit["code"] in by_code[pool]["required_codes"]

    rest = []
    for i in items:
        if i["counts_for"] is None and len(i["pools"]) > 1:
            i["counts_for"] = next((pool for pool in i["pools"] if required_in(i, pool)), None)
            if i["counts_for"] is None:
                rest.append(i)

    assigned = dict.fromkeys(mins, 0)
    for i in items:
        if i["counts_for"] in assigned:
            assigned[i["counts_for"]] += _credits(i)
    for i in sorted(rest, key=lambda i: (i["planned"], i["year"], SEMESTER_ORDER.get(i.get("semester"), 0))):
        best = max(i["pools"], key=lambda pool: (mins[pool] - assigned[pool], pool == PRIMARY))
        i["counts_for"] = best
        assigned[best] += _credits(i)


def _required_progress(required, items, recommend):
    """필수 과목 목록 대비 (이수 수, 예정 수, 빠진 과목). items는 그 전공에 배정된 과목만."""
    by_code = {i["code"]: i for i in items}
    by_name = {i["info"].name.replace(" ", ""): i for i in items}
    done = planned = 0
    missing = []
    for c in required:
        hit = by_code.get(c["code"]) or by_name.get(c["name"].replace(" ", ""))
        if hit and not hit["planned"]:
            done += 1
        elif hit:
            planned += 1
        else:
            missing.append({"code": c["code"], "name": c["name"], "credits": c["credits"], "recommended": recommend(c)})
    return done, planned, missing


def _options(courses, items, skip_codes=()):
    """아직 안 들은(수강 예정도 아님) 선택 과목 — '들어야 하는 과목' 목록용. 학년 순."""
    have_codes = {i["code"] for i in items}
    have_names = {i["info"].name.replace(" ", "") for i in items}
    out = [{"code": c["code"], "name": c["name"], "credits": c["credits"], "grade": c.get("grade"),
            "semester": c.get("semester")}
           for c in courses
           if c["code"] not in have_codes and c["code"] not in skip_codes
           and c["name"].replace(" ", "") not in have_names]
    return sorted(out, key=lambda c: (c["grade"] or 9, c["semester"] or "", c["name"]))


def _excluded(t, why, entry_year):
    """계산에서 뺀 입력 — 평점(F 포함) 계산·화면 표시용으로 이름·학점·학기도 함께."""
    info = catalog.classify(t["code"], entry_year, t.get("year"), t.get("credits"), t.get("name"))
    credits = info.credits if info.credits is not None else t.get("credits")
    return {"code": t["code"], "name": info.name, "credits": credits, "year": t.get("year"),
            "semester": t.get("semester"), "grade": t.get("grade"), "reason": why}


def evaluate(entry_year, taken, profile=None):
    profile = profile or {}
    rs = load_ruleset(entry_year)
    warnings = []
    if rs["status"] != "confirmed":
        warnings.append(f"{entry_year}학번 졸업요건은 아직 확정 공지 전입니다. 이전 학번 기준을 임시로 적용했습니다.")

    courses, dropped = _normalize_taken(taken, entry_year)
    progs = _load_programs(entry_year, rs, profile, warnings)
    items = []
    for t in courses:
        info = catalog.classify(t["code"], entry_year, t["year"], t.get("credits"), t.get("name"))
        if not info.known and info.category == GENERAL_ELECTIVE:
            pc = next((p["by_code"][t["code"]] for p in progs if t["code"] in p["by_code"]), None)
            if pc:  # 인공지능전공 교육과정엔 없지만 다전공 학과 과목 → 이름·학점을 그 교육과정에서
                info = catalog.CourseInfo(t["code"], pc["name"], pc["credits"], GENERAL_ELECTIVE)
        override = t.get("category")
        if override in CATEGORIES:  # 학생이 분류를 직접 지정 (학과 인정·대체 과목 등)
            la = override == LIBERAL_ARTS
            info = catalog.CourseInfo(t["code"], info.name, info.credits, override,
                                      t.get("area") if la else None, t.get("sub_area") if la else None,
                                      sdg=info.sdg and la, known=True)
        want = t.get("counts_for")
        t = {k: v for k, v in t.items() if k != "counts_for"}
        items.append({**t, "counts_for_request": want, "info": info})
        if not info.known and info.category == GENERAL_ELECTIVE:
            if t.get("credits") is None:
                warnings.append(f"{t['code']}: 교육과정에 없는 과목이라 학점을 알 수 없어 0학점으로 계산했습니다. credits를 입력하세요.")
        elif not info.known:
            warnings.append(f"{info.name}({t['code']}): {info.lookup_year}년 교양 목록에 없어 영역을 판정하지 못했습니다.")
        elif info.lookup_year and info.lookup_year != t["year"]:
            warnings.append(f"{info.name}: {t['year']}년 교양 데이터가 없어 {info.lookup_year}년 영역으로 판정했습니다.")

    at_knu = lambda i: not i.get("external")
    reqs = []

    # ── 총 이수학점 ─────────────────────────────────────────────
    e, p = _tally(items, lambda i: True)
    reqs.append(_req("total", "졸업학점", "총 이수학점", rs["total_credits"]["min"], e, p,
                     source=rs["total_credits"]["source"], counted=_counted(items, lambda i: True)))

    # ── 전공 ────────────────────────────────────────────────────
    major = rs["major"]
    track = _major_track(profile)
    major_min = major["min_credits"]
    for cond in major.get("min_credits_if", []):
        if (track, cond["when"]) in {("double_major", "double_major_or_convergence_or_transfer"),
                                      ("single_minor", "single_minor_only")}:
            major_min = cond["min_credits"]
    required = catalog.required_courses(entry_year)
    _allocate(items, progs, major_min, {c["name"].replace(" ", "") for c in required})
    counts_for = lambda pool: (lambda i: i["counts_for"] == pool)

    e, p = _tally(items, counts_for(PRIMARY))
    track_note = {"double_major": "다전공(복수·연계·융합·부전공)·편입·교직과정 이수자 기준",
                  "single_minor": "부전공 1개만 이수할 때 기준 (다전공 기준 + 12학점)"}.get(track)
    electives = [c for c in catalog.curriculum(entry_year)["courses"] if c["type"] == MAJOR]
    reqs.append(_req("major", "전공", "전공 학점 (전공필수 포함)", major_min, e, p, source=major["source"],
                     counted=_counted(items, counts_for(PRIMARY)), pick={"categories": [MAJOR_REQUIRED, MAJOR]},
                     options=_options(electives, items), options_label="들을 수 있는 전공선택 과목",
                     **({"note": track_note} if track_note else {})))

    def standard(c):
        slot = catalog.standard_slot(entry_year, c["code"])
        return f"{slot[0]}학년 {slot[1]}" if slot else None

    done, planned_n, missing = _required_progress(required, [i for i in items if i["counts_for"] == PRIMARY], standard)
    reqs.append(_req("major_required", "전공", "전공필수 과목", len(required), done, planned_n,
                     unit="과목", missing=missing, source=major["source"], pick={"categories": [MAJOR_REQUIRED]},
                     counted=_counted(items, lambda i: i["counts_for"] == PRIMARY and (
                         i["code"] in {c["code"] for c in required}
                         or i["info"].name.replace(" ", "") in {c["name"].replace(" ", "") for c in required})),
                     note=f"전공필수 {major['required']['min_credits']}학점 = 아래 과목 전부"))

    # ── 다전공 ──────────────────────────────────────────────────
    for prog in progs:
        group = f"{prog['label']} · {prog['name']}"
        rid = f"program:{prog['code']}"
        mine = [i for i in items if i["counts_for"] == prog["code"]]
        e, p = _tally(mine, lambda i: True)
        if prog["min_credits"]:
            note = f"기준: {prog['basis']}"
            if prog["kind"] == "convergence":
                note += " — 융합전공에서 따로 정한 학점이 더 많으면 그 기준"
                note += f" (주관학과 {prog['host']}에 확인)" if prog["host"] else ""
            reqs.append(_req(f"{rid}:credits", group, f"{prog['label']} 학점", prog["min_credits"], e, p,
                             counted=_counted(mine, lambda i: True), pick={"program": prog["code"]},
                             note=note, if_incomplete=prog["rule"]["if_incomplete"],
                             options=_options(prog["courses"], items, prog["required_codes"]),
                             options_label=f"들을 수 있는 {prog['name']} 과목",
                             source=prog["rule"]["source"]))
        else:
            reqs.append(_req(f"{rid}:credits", group, f"{prog['label']} 학점", None, e, p, status=UNKNOWN,
                             counted=_counted(mine, lambda i: True), pick={"program": prog["code"]},
                             options=_options(prog["courses"], items, prog["required_codes"]),
                             options_label=f"들을 수 있는 {prog['name']} 과목",
                             source=prog["rule"]["source"],
                             note="이 학과의 다전공 이수학점을 기준표에서 찾지 못했습니다. 학과 공지를 확인해 직접 입력하세요."))
        if prog["required"]:
            done, planned_n, pmiss = _required_progress(
                prog["required"], mine, lambda c: f"{c['grade']}학년" if c.get("grade") else None)
            reqs.append(_req(f"{rid}:required", group,
                             "부전공 필수 과목" if prog["kind"] == "minor" else "전공필수 과목",
                             len(prog["required"]), done, planned_n, unit="과목", missing=pmiss,
                             source=prog["rule"]["source"]))
    if progs:
        warnings.append("한 과목은 주전공·다전공 중 한 곳에만 인정됩니다.")
    if any(p["kind"] in ("double", "minor") for p in progs):
        warnings.append("복수전공·부전공을 졸업 때까지 완성하지 못하면 그 과목들은 일반선택 학점으로만 인정됩니다.")
    if any(p["kind"] == "convergence" for p in progs):
        warnings.append("융합전공은 학점이 모자라면 주전공 요건을 다 채워도 졸업할 수 없습니다. "
                        "졸업 전에 다 못 채울 것 같으면 융합전공 포기 신청을 해야 합니다.")

    # ── 교양 ────────────────────────────────────────────────────
    la = rs["liberal_arts"]
    ref_year = max([i["year"] for i in items] + [entry_year])
    in_la = lambda i: i["info"].category == LIBERAL_ARTS and i["counts_for"] is None  # 다전공으로 옮긴 교양은 제외
    e, p = _tally(items, in_la)
    reqs.append(_req("liberal_arts", "교양", "교양 학점", la["min_credits"], e, p, source=la["source"],
                     counted=_counted(items, in_la), pick={"categories": [LIBERAL_ARTS]}))

    for area in la["areas"]:
        in_area = lambda i, a=area: (in_la(i) and at_knu(i)
                                     and i["info"].area == a["area"] and i["info"].sub_area in a["sub_areas"])
        e, p = _tally(items, in_area)
        waiver = area.get("waived_if")
        status = WAIVED if waiver and profile.get(waiver["flag"]) and e < area["min_credits"] else None
        r = _req(area["id"], "교양", area["label"], area["min_credits"], e, p, status=status,
                 source=area.get("source", la["source"]), counted=_counted(items, in_area),
                 pick={"categories": [LIBERAL_ARTS], "area": area["area"], "sub_areas": area["sub_areas"]})
        if r["status"] in (UNMET, MET_WITH_PLANNED):
            r["examples"] = catalog.area_examples(area["area"], area["sub_areas"], ref_year)
        if waiver:
            r["note"] = f"면제 조건: {waiver['label']} (면제돼도 학점으로는 인정되지 않음)"
        reqs.append(r)

    if la["sdg_min_credits"]:
        in_sdg = lambda i: in_la(i) and i["info"].sdg and at_knu(i)
        e, p = _tally(items, in_sdg)
        r = _req("sdg", "교양", "SDG 교양", la["sdg_min_credits"], e, p, source=la["source"],
                 counted=_counted(items, in_sdg), pick={"categories": [LIBERAL_ARTS], "sdg": True})
        if r["status"] == UNMET:
            _, pool = catalog.liberal_arts(ref_year)
            r["examples"] = [f"{c['name']} ({c['credits']}학점)" for c in pool.values() if c["sdg"]][:5]
        reqs.append(r)

    # ── 졸업자격인정 ────────────────────────────────────────────
    for q in rs["graduation_qualification"]["items"]:
        credit_rule = next((a for a in q["any_of"] if a["type"] == "credits"), None)
        alt_flag = {"practical_english": "english_test", "software": "software_alternative",
                    "advisor_counseling": "counseling_done", "major_assessment": "major_assessment_done"}.get(q["id"])
        alternatives = [a["label"] for a in q["any_of"] if a["type"] != "credits"]
        if credit_rule:
            in_rule = lambda i, a=credit_rule: (in_la(i) and at_knu(i)
                                                and i["info"].area == a["area"] and i["info"].sub_area in a["sub_areas"])
            subs = catalog.software_substitutes(entry_year) if q["id"] == "software" else None
            if subs:
                # 소프트웨어교육원 지정 대체과목 — 개설학과·이수 구분과 상관없이 같은 3학점 기준에 합산
                in_area = in_rule
                in_rule = lambda i: in_area(i) or (not i.get("external") and i["code"] in subs["courses"])
            e, p = _tally(items, in_rule)
            r = _req(q["id"], "졸업자격인정", q["label"], credit_rule["min_credits"], e, p,
                     alternatives=alternatives, source=q["source"], counted=_counted(items, in_rule),
                     pick={"categories": [LIBERAL_ARTS], "area": credit_rule["area"], "sub_areas": credit_rule["sub_areas"]})
            if alt_flag and profile.get(alt_flag) and r["status"] != MET:
                # 대체로 인정되면 과목을 더 들을 필요가 없다 → 학점 진행 대신 '대체 인정'으로 보여 준다
                planned = bool(profile.get(f"{alt_flag}_planned"))  # 받을 예정 → '예정 포함 충족'
                r["status"] = MET_WITH_PLANNED if planned else MET
                r["replaced"] = profile[alt_flag] if isinstance(profile[alt_flag], str) else "본인 입력"
                r["replaced_planned"] = planned
                r["note"] = f"대체 {'예정' if planned else '인정'}: {r['replaced']}"
            elif r["status"] != MET:
                r["examples"] = catalog.area_examples(credit_rule["area"], credit_rule["sub_areas"], ref_year)
                if any(a.get("status") == "unknown" for a in q["any_of"]):
                    r["note"] = "학과 지정 대체과목으로도 인정될 수 있음 (대체과목 목록은 확인 중)"
            if subs:
                used = [subs["courses"][i["code"]] for i in items if i["code"] in subs["courses"]]
                if used and not r.get("replaced"):
                    r["note"] = f"대체과목 인정: {', '.join(used)}"
                r["certificates"] = subs["certificates"]
        elif q["id"] == "advisor_counseling":
            # 필요 횟수는 학과 안내 기준 8회(graduation.json required_count), 받은 횟수만 학생이 입력
            count = _count(profile.get("counseling_count"))
            need = q["required_count"]
            status = MET if profile.get(alt_flag) or (count or 0) >= need else UNMET
            r = _req(q["id"], "졸업자격인정", q["label"], need, count or 0, 0,
                     unit="회", status=status, alternatives=alternatives, source=q["source"],
                     counseling={"count": count, "required": need, "confirmed": bool(profile.get(alt_flag))})
        else:
            status = MET if profile.get(alt_flag) else (UNKNOWN if q.get("status") == "unknown" else MANUAL)
            r = _req(q["id"], "졸업자격인정", q["label"], None, None, None, unit=None, status=status,
                     alternatives=alternatives, note=q.get("note"), source=q["source"])
        # 다전공으로 인정 (영어영문학과·영어교육과 복수·부전공 → 실용영어)
        prog_rule = next((a for a in q["any_of"] if a["type"] == "program"), None)
        hit = prog_rule and next((p for p in profile.get("programs") or []
                                  if p.get("code") in prog_rule["codes"] and p.get("kind") in prog_rule["kinds"]), None)
        if hit and r["status"] != MET:
            r.update(status=MET, replaced=prog_rule["label"], examples=None,
                     note=f"대체 인정: {prog_rule['label']} (그 다전공을 완성해야 인정)")
        # 일괄 면제 (편입생·장애학생 / 외국인 학생은 소프트웨어만)
        ex = next((x for x in rs["graduation_qualification"].get("exemptions", [])
                   if q["id"] in x["items"] and any(profile.get(f) for f in x["flags"])), None)
        if ex and r["status"] != MET:
            r.update(status=WAIVED, examples=None, note=f"면제: {ex['label']}")
        reqs.append(r)

    # ── 공동학위 (희망자만) ─────────────────────────────────────
    if profile.get("joint_degree"):
        jd = rs["joint_degree"]
        e, p = _tally(items, lambda i: i.get("pnu"))
        reqs.append(_req("joint_degree", "공동학위", jd["label"] + " (부산대 개설 과목)", jd["pnu_min_credits"], e, p,
                         note=jd["note"], source=jd["source"]))
        if any(p["kind"] == "convergence" for p in progs):
            warnings.append("융합전공 이수자는 부산대 공동학위 대상이 아닙니다 (제외 대상: "
                            + ", ".join(jd["not_eligible"]) + ").")

    prog_names = {p["code"]: p["name"] for p in progs}
    blocking = [r["id"] for r in reqs if r["status"] == UNMET]
    return {
        "entry_year": entry_year,
        "major_track": track,
        "ruleset": {"id": rs["id"], "status": rs["status"], "notes": rs["notes"]},
        "summary": {
            "earned_credits": reqs[0]["earned"],
            "planned_credits": reqs[0]["planned"],
            "met": sum(r["status"] in (MET, WAIVED) for r in reqs),
            "total": len(reqs),
            "blocking": blocking,
            "graduation_ready": not blocking and all(r["status"] in (MET, WAIVED) for r in reqs),
        },
        "requirements": reqs,
        "courses": [{"code": i["code"], "name": i["info"].name, "credits": _credits(i), "category": i["info"].category,
                     "area": i["info"].area, "sub_area": i["info"].sub_area, "year": i["year"],
                     "semester": i.get("semester"), "grade": i.get("grade"), "planned": i["planned"],
                     "counts_for": i["counts_for"], "counts_for_auto": i["auto"], "eligible": i["pools"],
                     "category_override": i.get("category") in CATEGORIES,
                     "program": prog_names.get(i["counts_for"]), "retake": i.get("retake")}
                    for i in items],
        "programs": [{"code": p["code"], "name": p["name"], "kind": p["kind"], "label": p["label"],
                      "min_credits": p["min_credits"], "basis": p["basis"]} for p in progs],
        # 분류 직접 지정에서 고를 수 있는 교양 영역 (수강 연도 교양 목록 기준)
        "liberal_areas": sorted({(c["area"], c["sub_area"]) for c in catalog.liberal_arts(ref_year)[1].values()
                                 if c["area"] and c["sub_area"]}),
        "excluded": [_excluded(t, why, entry_year) for t, why in dropped],
        "warnings": warnings,
    }


# ── CLI ─────────────────────────────────────────────────────────
ICON = {MET: "✅", MET_WITH_PLANNED: "🕒", UNMET: "❌", WAIVED: "➖", MANUAL: "📝", UNKNOWN: "❓"}


def format_report(rep):
    out = [f"■ {rep['entry_year']}학번 졸업요건 ({rep['ruleset']['id']} 기준, {rep['ruleset']['status']})",
           f"  이수 {rep['summary']['earned_credits']}학점 + 예정 {rep['summary']['planned_credits']}학점 | "
           f"충족 {rep['summary']['met']}/{rep['summary']['total']}", ""]
    group = None
    for r in rep["requirements"]:
        if r["group"] != group:
            group = r["group"]
            out.append(f"[{group}]")
        prog = (f"{r['earned']}{'+' + str(r['planned']) if r['planned'] else ''} / {r['required']}{r['unit']}"
                if r["required"] is not None else "")
        out.append(f"  {ICON[r['status']]} {r['label']:<28} {prog}")
        for m in r.get("missing", []):
            out.append(f"       - {m['name']} ({m['credits']}학점{', ' + m['recommended'] if m['recommended'] else ''})")
        if r.get("examples"):
            out.append(f"       예) {', '.join(r['examples'][:3])}")
        if r.get("note") and r["status"] != MET:
            out.append(f"       ※ {r['note']}")
    for w in rep["warnings"]:
        out.append(f"⚠ {w}")
    for x in rep["excluded"]:
        out.append(f"  (제외) {x['code']} {x['year']} {x['grade'] or ''}: {x['reason']}")
    return "\n".join(out)


if __name__ == "__main__":
    doc = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    report = evaluate(doc["entry_year"], doc.get("taken", []), doc.get("profile"))
    print(json.dumps(report, ensure_ascii=False, indent=2) if "--json" in sys.argv else format_report(report))

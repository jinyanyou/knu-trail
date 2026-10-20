"""졸업요건 규칙 파일(data/rules/graduation.json)이 수집된 교육과정·교양 데이터와 맞는지 검사.

    python scripts/check_rules.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from engine.catalog import DATA  # noqa: E402
from engine.rules import load_ruleset, load_rules_doc  # noqa: E402


def check():
    """규칙 ↔ 수집 데이터 정합성. 문제 목록을 반환."""
    doc = load_rules_doc()
    problems, ok = [], []
    for rs_raw in doc["rulesets"]:
        lo, hi = rs_raw["entry_years"]
        for year in range(lo, hi + 1):
            rs = load_ruleset(year)
            cur_path = DATA / "curriculum" / f"{year}.json"
            la_path = DATA / "liberal_arts" / f"{year}.json"
            if not cur_path.exists() or not la_path.exists():
                problems.append(f"{year}: 수집 데이터 없음")
                continue
            courses = json.loads(cur_path.read_text(encoding="utf-8"))["courses"]
            la = json.loads(la_path.read_text(encoding="utf-8"))["courses"]

            # 1) 전공필수 학점 합계 == 규칙
            req = rs["major"]["required"]
            got = sum(c["credits"] for c in courses if c["type"] == req["course_type"])
            (ok if got == req["min_credits"] else problems).append(
                f"{year}: 전공필수 합계 {got}학점 (규칙 {req['min_credits']})")

            # 2) 전공필수 51 ≤ 전공 90 ≤ 졸업 133
            if not req["min_credits"] <= rs["major"]["min_credits"] <= rs["total_credits"]["min"]:
                problems.append(f"{year}: 학점 대소관계 이상")

            # 3) 규칙에 쓴 교양 영역 이름이 실제 데이터에 존재
            existing = {(c["area"], c["sub_area"]) for c in la}
            rule_areas = [(a["area"], s) for a in rs["liberal_arts"]["areas"] for s in a["sub_areas"]]
            rule_areas += [(i["area"], s) for q in rs["graduation_qualification"]["items"]
                           for i in q["any_of"] if i["type"] == "credits" for s in i["sub_areas"]]
            missing = [f"{a}/{s}" for a, s in rule_areas if (a, s) not in existing]
            (problems if missing else ok).append(
                f"{year}: 교양 영역 이름 " + (f"데이터에 없음 {missing}" if missing else "모두 존재"))

            # 4) SDG 요구가 있으면 그 해 SDG 과목이 있어야 함
            if rs["liberal_arts"]["sdg_min_credits"] and not any(c["sdg"] for c in la):
                problems.append(f"{year}: SDG 3학점 요구하지만 SDG 과목이 없음")

            # 5) 학과 교육과정의 교양 과목이 그 해 교양 목록에 있는지 (2027 미갱신 감지용)
            la_codes = {c["code"] for c in la}
            orphan = [c["name"] for c in courses if c["type"] == "교양" and c["code"] not in la_codes]
            if orphan:
                problems.append(f"{year}: 학과 교육과정의 교양 과목이 교양 목록에 없음 {orphan}")

            # 6) 다전공 데이터: 학번별 학과·융합전공 목록, 다전공 이수학점을 못 찾은 학과
            prog_path = DATA / "programs" / f"{year}.json"
            if not prog_path.exists():
                problems.append(f"{year}: 다전공 데이터 없음 — scripts/fetch_programs.py 실행")
            else:
                progs = json.loads(prog_path.read_text(encoding="utf-8"))["programs"]
                no_credits = [p["name"] for p in progs if p["kind"] != "convergence" and not p["multi_major_credits"]]
                ok.append(f"{year}: 다전공 학과·전공 {sum(p['kind'] == 'major' for p in progs)}개, "
                          f"융합전공 {sum(p['kind'] == 'convergence' for p in progs)}개, "
                          f"연계전공 {sum(p['kind'] == 'linked' for p in progs)}개")
                if no_credits:
                    problems.append(f"{year}: 다전공 이수학점을 기준표에서 못 찾은 학과 (학생 직접 입력) {no_credits}")

            if rs["status"] != "confirmed":
                problems.append(f"{year}: 규칙 상태 '{rs['status']}' (확정 전)")
    return ok, problems


if __name__ == "__main__":
    ok, problems = check()
    for line in ok:
        print("  OK  ", line)
    for line in problems:
        print("  WARN", line)
    print("\n미해결 질문:")
    for q in load_rules_doc()["open_questions"]:
        print("  -", q)

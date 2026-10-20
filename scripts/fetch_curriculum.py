"""경북대 인공지능전공 교육과정 수집기.

knuin 포털의 공개 교육과정 조회 화면(https://knuin.knu.ac.kr/public/stddm/edu.knu?itttn_cd=1O0109)이
호출하는 공개 API를 그대로 사용한다. 로그인 불필요.

    python scripts/fetch_curriculum.py              # 2023~2027학번
    python scripts/fetch_curriculum.py 2026 2027    # 특정 학번만

출력
    data/raw/<학번>/*.json        API 원본 응답 (재가공용)
    data/curriculum/<학번>.json   정규화된 교육과정
"""
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

DEPT_CODE = "1O0109"
DEPT_NAME = "인공지능전공"
BASE = "https://knuin.knu.ac.kr/public/"
PAGE_URL = f"{BASE}stddm/edu.knu?itttn_cd={DEPT_CODE}"
ROOT = Path(__file__).resolve().parent.parent / "data"

ENDPOINTS = {
    "courses": "web/stddm/curse/educourse/eduCour/searchEduCourList",
    "standard_plan": "web/stddm/curse/homepage/univEduCour/searchUnivEduCourList",
    "guidelines": "web/stddm/curse/educourse/cmpltManual/searchCmpltManualList",
    "modules": "web/stddm/curse/mdl/mdlCd/selectListMdlCd",
}
MODULE_KINDS = {"STCU001800001": "major_module", "STCU001800002": "micro_major"}

# 개설학기 코드(STCU0006)는 공개 코드 API가 비어 있어 화면과 대조해 정함
# (00003 과목 = 이수지침의 "1, 2학기 동시개설" 목록과 일치)
SEMESTER = {"STCU000600001": "1학기", "STCU000600002": "2학기", "STCU000600003": "1,2학기"}


def session():
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0 (knu-trail curriculum fetcher)", "Referer": PAGE_URL})
    return s


def post(s, path, search):
    r = s.post(BASE + path, json={"isApi": "Y", "search": {"isApi": "Y", **search}}, timeout=30)
    r.raise_for_status()
    body = r.json()
    if not body.get("success", True) and body.get("data") is None:
        raise RuntimeError(f"{path}: {body.get('msg')}")
    time.sleep(0.3)  # 학교 서버에 부담 주지 않게
    return body.get("data") or []


def code_names(s, key):
    """포털 공통 코드표 (예: STCU0008 교과목구분, STCU0010~12 교양 영역 대/중/소분류)."""
    data = s.post(BASE + "cmmnn/cmmbs/code/selectListCode", timeout=30, json={
        "search": {"reqId": "knu-trail", "key": key, "upperKey": None,
                   "listCode": False, "attrs": [], "useYn": None, "searchParam": None}}).json()["data"]
    return {c["codeId"]: c["codeNm"] for c in data["option"]["codes"]}


def course_types(s):
    return code_names(s, "STCU0008")


def strip_tags(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()


def yn(v):
    return v == "Y"


def normalize_course(row, types):
    return {
        "code": row["sbjetCd"],
        "name": row["sbjetNm"].strip(),
        "name_en": (row["sbjetEnglhNm"] or "").strip(),
        "credits": row["crdit"],
        "theory_hours": row["thryTime"],
        "practice_hours": row["prctsTime"],
        "type": types.get(row["sbjetSctcd"], row["sbjetSctcd"]),
        "grade": int(row["estblGrade"]) if row.get("estblGrade") else None,
        "semester": SEMESTER.get(row["estblSmstrCd"], row["estblSmstrCd"]),
        "pass_fail": yn(row.get("sugrdEvltnYn")),
        "minor_required": yn(row.get("mnorEssnlYn")),
        "micro_major": yn(row.get("mnmjMjrYn")),
        "joint_degree": yn(row.get("cprtnDgrYn")),
        "joint_degree_required": yn(row.get("cprtnDgrEssnlYn")),
        "other_dept": yn(row.get("othdpCrsdcYn")),
    }


def normalize_plan(rows):
    """표준개설모형: 한 행에 1학기/2학기 과목이 나란히 온다 → 학기별 한 줄씩 펼친다."""
    plan, grade = [], None
    for row in rows:
        grade = int(row["estblGrade"]) if row.get("estblGrade") else grade
        for n, sem in ((1, "1학기"), (2, "2학기")):
            code = row.get(f"sbjetCd{n}")
            if not code:
                continue
            name = strip_tags(row.get(f"sbjetNm{n}"))
            required = "(전공필수)" in name
            plan.append({
                "grade": grade,
                "semester": sem,
                "code": code,
                "name": name.replace("(전공필수)", "").strip(),
                "credit_system": row.get(f"crditSystem{n}"),
                "credits": int(row[f"crditSystem{n}"].split("-")[0]) if row.get(f"crditSystem{n}") else None,
                "major_required": required,
            })
    return plan


def fetch_year(s, year, types):
    search = {"trgtYrsf": str(year), "dprtnCd": DEPT_CODE, "dprtnNm": "", "mdlSctinCd": "",
              "forMdlMgmntYn": "", "frstNcrYear": ""}
    raw = {
        "courses": post(s, ENDPOINTS["courses"], search),
        "standard_plan": post(s, ENDPOINTS["standard_plan"],
                              {"trgtYrsf": str(year), "dprtnCd": DEPT_CODE, "dprtnNm": "", "sbjetSctinClscd": "ALL"}),
        "guidelines": post(s, ENDPOINTS["guidelines"], search),
    }
    for kind_code, kind in MODULE_KINDS.items():
        raw[kind] = post(s, ENDPOINTS["modules"],
                         {**search, "mdlSctinCd": kind_code, "forMdlMgmntYn": "Y", "frstNcrYear": str(year)})

    raw_dir = ROOT / "raw" / str(year)
    raw_dir.mkdir(parents=True, exist_ok=True)
    for name, rows in raw.items():
        (raw_dir / f"{name}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

    return {
        "entry_year": year,
        "dept_code": DEPT_CODE,
        "dept_name": DEPT_NAME,
        "source": PAGE_URL,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "courses": sorted((normalize_course(r, types) for r in raw["courses"]),
                          key=lambda c: (c["grade"] or 9, c["semester"], c["code"])),
        "standard_plan": normalize_plan(raw["standard_plan"]),
        "guidelines": [{"title": g["complMnulSubjt"], "content": g["cntns"]} for g in raw["guidelines"]],
    }


def main(years):
    s = session()
    types = course_types(s)
    out_dir = ROOT / "curriculum"
    out_dir.mkdir(parents=True, exist_ok=True)
    for year in years:
        cur = fetch_year(s, year, types)
        (out_dir / f"{year}.json").write_text(json.dumps(cur, ensure_ascii=False, indent=2), encoding="utf-8")
        req = [c for c in cur["courses"] if c["type"] == "전공필수"]
        print(f"{year}학번: 과목 {len(cur['courses'])}개 (전공필수 {len(req)}개, {sum(c['credits'] for c in req)}학점), "
              f"표준개설모형 {len(cur['standard_plan'])}행")


if __name__ == "__main__":
    main([int(y) for y in sys.argv[1:]] or list(range(2023, 2028)))

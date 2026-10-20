"""경북대 교양(첨성인) 교육과정 수집기.

knuin 포털 "교양교육과정조회" 탭이 쓰는 공개 API. 전공 교육과정과 같은 엔드포인트에
대학 전체(dprtnCd=1) + 교양 구분(STCU000700003)으로 조회한다.

    python scripts/fetch_liberal_arts.py              # 2023~2027 적용연도
    python scripts/fetch_liberal_arts.py 2027

출력
    data/raw/liberal_arts/<연도>.json   API 원본 응답
    data/liberal_arts/<연도>.json       영역(대/중/소분류)을 이름으로 풀어 정규화한 교양 과목
"""
import json
import sys
from datetime import datetime, timezone

from fetch_curriculum import BASE, ENDPOINTS, ROOT, SEMESTER, code_names, post, session, yn

LIBERAL_ARTS = "STCU000700003"
AREA_KEYS = ("STCU0010", "STCU0011", "STCU0012")  # 대분류, 중분류, 소분류


def normalize(row, areas):
    name = lambda code: areas.get(code) if code else None
    return {
        "code": row["sbjetCd"],
        "name": row["sbjetNm"].strip(),
        "name_en": (row["sbjetEnglhNm"] or "").strip(),
        "credits": row["crdit"],
        "theory_hours": row["thryTime"],
        "practice_hours": row["prctsTime"],
        "area": name(row["sbjetRelmCd1"]),         # 첨성인기초 / 첨성인핵심 / 첨성인소양
        "sub_area": name(row["sbjetRelmCd2"]),     # 예: 글쓰기, 수리, 소프트웨어, 인문.사회
        "detail_area": name(row["sbjetRelmCd3"]),  # 첨성인핵심만 있음: 언어와문화, 과학과기술 등
        "semester": SEMESTER.get(row["estblSmstrCd"], row["estblSmstrCd"]),
        "grade": None if row.get("estblGrade") in (None, "9") else int(row["estblGrade"]),  # 9 = 전학년
        "sdg": yn(row.get("sdgCltreYn")),
        "humanities": yn(row.get("hmntsCltreYn")),
        "pass_fail": yn(row.get("sugrdEvltnYn")),
    }


def main(years):
    s = session()
    areas = {}
    for key in AREA_KEYS:
        areas.update(code_names(s, key))
    (ROOT / "raw" / "liberal_arts").mkdir(parents=True, exist_ok=True)
    (ROOT / "liberal_arts").mkdir(parents=True, exist_ok=True)

    for year in years:
        rows = post(s, ENDPOINTS["courses"],
                    {"trgtYrsf": str(year), "sbjetRelmCd": "", "dprtnCd": "1", "sbjetSctinClscd": LIBERAL_ARTS})
        (ROOT / "raw" / "liberal_arts" / f"{year}.json").write_text(
            json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

        courses = sorted((normalize(r, areas) for r in rows),
                         key=lambda c: (c["area"] or "", c["sub_area"] or "", c["detail_area"] or "", c["code"]))
        out = {
            "year": year,
            "source": f"{BASE}stddm/edu.knu (교양교육과정조회)",
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "courses": courses,
        }
        (ROOT / "liberal_arts" / f"{year}.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

        by_area = {}
        for c in courses:
            by_area[c["area"]] = by_area.get(c["area"], 0) + 1
        print(f"{year}: 교양 {len(courses)}과목 {by_area}, SDG {sum(c['sdg'] for c in courses)}과목")


if __name__ == "__main__":
    main([int(y) for y in sys.argv[1:]] or list(range(2023, 2028)))

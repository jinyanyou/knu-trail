"""수강신청 시뮬레이션용 개설 강좌(수업시간표) 수집기.

knuin 공개 '강의계획서 조회' API로 한 학기의 전체 개설 분반을 받는다 (로그인 불필요).
정원·신청인원·수강꾸러미 인원은 수집 시점의 값이다 — 시뮬레이션의 경쟁률 재현에만 쓴다.

    python scripts/fetch_timetable.py              # 2026학년도 2학기
    python scripts/fetch_timetable.py 2027 1       # 2027학년도 1학기

출력: data/timetable/<연도>-<학기>.json
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

BASE = "https://knuin.knu.ac.kr/public/"
ENDPOINT = "web/stddm/lsspr/syllabus/lectPlnInqr/selectListLectPlnInqr"
SEMESTER_CODES = {"1": "CMBS001400001", "2": "CMBS001400002"}
ROOT = Path(__file__).resolve().parent.parent / "data" / "timetable"
DAYS = "월화수목금토일"


def parse_slots(text):
    """'월 1A,1B,2A,수 2B,3A,3B' → [['월', '1A'], ['월', '1B'], ...] — 요일은 뒤에 올 교시까지 이어진다."""
    slots, day = [], None
    for token in (text or "").replace(" ", ",").split(","):
        token = token.strip()
        if not token:
            continue
        if token[0] in DAYS:
            day, token = token[0], token[1:]
        if token and day:
            slots.append([day, token])
    return slots


def to_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def normalize(row):
    return {
        "id": row["crseNo"],                      # CAIB0207-001 (교과목번호-분반)
        "code": row["sbjetCd"],
        "section": row["sbjetDvnno"],
        "name": (row["sbjetNm"] or "").strip(),
        "type": row["sbjetSctnm"],                # 전공 / 전공필수 / 교양 ...
        "credits": to_int(row["crdit"]),
        "grade": to_int(row["estblGrade"]),
        "college": row["estblUnivNm"],
        "dept": row["estblDprtnNm"],
        "dept_code": row["estblDprtnCd"],
        "professor": row.get("totalPrfssNm") or "",
        "time": row.get("lssnsRealTimeInfo") or "",
        "slots": parse_slots(row.get("lssnsTimeInfo")),
        "room": re.sub(r"\s+", " ", row.get("lctrmInfo") or "").strip(),
        "capacity": to_int(row.get("attlcPrscpCnt")),
        "applied": to_int(row.get("appcrCnt")),
        "basket": to_int(row.get("pckgeRqstCnt")),
        "basket_allowed": row.get("pckgeRqstPssblYn") == "Y",
        "language": row.get("doPlan"),
        "remark": re.sub(r"<[^>]+>", " ", row.get("rmrk") or "").strip(),
    }


def main(year, semester):
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0 (knu-trail timetable fetcher)",
                      "Referer": BASE + "stddm/lectPlnInqr.knu"})
    r = s.post(BASE + ENDPOINT, json={"isApi": "Y", "search": {
        "isApi": "Y", "estblYear": str(year), "estblSmstrSctcd": SEMESTER_CODES[semester]}}, timeout=120)
    r.raise_for_status()
    rows = r.json().get("data") or []
    courses = sorted((normalize(x) for x in rows), key=lambda c: c["id"])
    ROOT.mkdir(parents=True, exist_ok=True)
    out = ROOT / f"{year}-{semester}.json"
    out.write_text(json.dumps({
        "year": year, "semester": f"{semester}학기", "source": BASE + "stddm/lectPlnInqr.knu",
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "note": "정원·신청인원·꾸러미 인원은 수집 시점 값 (시뮬레이션 경쟁률 재현용)",
        "courses": courses,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{year}학년도 {semester}학기: {len(courses)}개 분반 → {out.name}")


if __name__ == "__main__":
    args = sys.argv[1:]
    main(int(args[0]) if args else 2026, args[1] if len(args) > 1 else "2")

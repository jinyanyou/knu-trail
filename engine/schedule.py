"""경북대 학사일정 — 학교 홈페이지 학사일정(연도별 목록)에서 학부생에게 중요한 일정만 골라 D-day로 보여준다.

https://www.knu.ac.kr/wbbs/wbbs/user/yearSchedule/index.action?menu_idx=43&vo.search_year=2027
<li><span class="day">02.11(목)</span>1학기 수강신청 (2.11.~2. 15.)</li>
"""
import html
import re
import urllib.request
from datetime import date, datetime, timedelta

from engine.daily import KST, today

URL = "https://www.knu.ac.kr/wbbs/wbbs/user/yearSchedule/index.action?menu_idx=43&vo.search_year={year}"
SOURCE = "https://www.knu.ac.kr/wbbs/wbbs/user/yearSchedule/index.action?menu_idx=43"
ITEM_RE = re.compile(r'<li>\s*<span class="day">(\d{2})\.(\d{2})\([^)]*\)</span>(.*?)</li>', re.S)
END_RE = re.compile(r"~\s*(\d{1,2})\s*\.\s*(\d{1,2})")
# 학부생에게 중요한 일정 (대학원·입시·행정 일정은 뺀다)
KEYWORDS = ("수강꾸러미", "수강신청", "수강변경", "수강정정", "수강취소", "재학생 등록", "개강", "종강", "휴학",
            "복학", "중간고사", "기말고사", "방학", "성적", "다전공", "복수전공", "부전공", "융합전공", "전과", "졸업", "학위수여식",
            "계절학기")
SKIP = ("[대학원]", "대학원", "정시모집", "수시모집", "편입학", "신입생 등록", "시무식", "종무식")


def parse(html_text, year):
    """학사일정 HTML → [{start, end, title}] (날짜는 date)."""
    out = []
    for month, day, raw in ITEM_RE.findall(html_text):
        title = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", raw))).strip()
        start = date(year, int(month), int(day))
        end = start
        m = END_RE.search(title)
        if m:
            end_year = year + (1 if int(m.group(1)) < start.month else 0)
            try:
                end = date(end_year, int(m.group(1)), int(m.group(2)))
            except ValueError:
                pass
        out.append({"start": start, "end": end, "title": title})
    return out


def relevant(title):
    return any(k in title for k in KEYWORDS) and not any(s in title for s in SKIP)


def _fetch(url, timeout=8):
    req = urllib.request.Request(url, headers={"User-Agent": "trAIl/0.1 (+student project)"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read().decode("utf-8", "replace")


_cache = {}  # {날짜: 결과} — 하루에 한 번만 학교 홈페이지에 접속


def upcoming(day=None, limit=6, fetch=_fetch):
    """오늘 진행 중이거나 다가오는 학부 일정 (올해·내년 학사일정에서). 못 가져오면 None."""
    day = day or today()
    if day in _cache:
        return _cache[day]
    events = []
    for year in (day.year, day.year + 1):
        try:
            events += parse(fetch(URL.format(year=year)), year)
        except Exception:
            continue
    if not events:
        return None
    seen, items = set(), []
    for e in sorted(events, key=lambda e: (e["start"], e["title"])):
        if e["end"] < day or not relevant(e["title"]) or (e["start"], e["title"]) in seen:
            continue
        seen.add((e["start"], e["title"]))
        items.append({"title": e["title"], "start": e["start"].isoformat(), "end": e["end"].isoformat(),
                      "d_day": (e["start"] - day).days, "ongoing": e["start"] <= day <= e["end"],
                      "days_left": (e["end"] - day).days})
    result = {"date": day.isoformat(), "events": items[:limit], "source": SOURCE,
              "fetched_at": datetime.now(KST).isoformat(timespec="minutes")}
    _cache.clear()
    _cache[day] = result
    return result

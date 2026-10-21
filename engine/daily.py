"""오늘의 전공 뉴스·퀴즈 — 하루(한국 시간)에 하나씩.

- 뉴스: AI타임스 첫 화면 맨 위의 메인 기사(편집자가 고른 톱기사)를 그날 하루 고정한다.
  메인 기사를 못 읽으면 AI 전문 언론사 RSS(AI타임스·인공지능신문)의 최신 기사로 대신한다.
  제목·짧은 요약·원문 링크만 보여주고 본문·사진은 가져오지 않는다.
- 퀴즈: data/quiz/questions.json 문제 은행을 고정된 순서로 섞어 날짜마다 한 문제. 모두에게 같은 문제.
"""
import html
import json
import random
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from functools import lru_cache
from pathlib import Path

KST = timezone(timedelta(hours=9))
DATA = Path(__file__).resolve().parent.parent / "data" / "quiz" / "questions.json"
MAIN_PAGE = ("AI타임스", "https://www.aitimes.com/")
FEEDS = [
    ("AI타임스", "https://www.aitimes.com/rss/allArticle.xml"),
    ("인공지능신문", "https://www.aitimes.kr/rss/allArticle.xml"),
]
SUMMARY_LEN = 140
EPOCH = date(2026, 1, 1)


def today():
    return datetime.now(KST).date()


# ── 퀴즈 ─────────────────────────────────────────────────────────
@lru_cache(maxsize=1)
def _questions():
    qs = json.loads(DATA.read_text(encoding="utf-8"))["questions"]
    order = list(range(len(qs)))
    random.Random(20261022).shuffle(order)  # 주제가 연달아 나오지 않게 고정된 순서로 섞는다
    return [qs[i] for i in order]


def quiz(day=None):
    qs = _questions()
    day = day or today()
    return {"date": day.isoformat(), **qs[(day - EPOCH).days % len(qs)]}


# ── 뉴스 ─────────────────────────────────────────────────────────
def _text(raw):
    """RSS 설명의 HTML 태그·엔티티를 걷어 내고 앞부분만."""
    t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", raw or ""))).strip()
    return t if len(t) <= SUMMARY_LEN else t[:SUMMARY_LEN].rstrip() + "…"


def _published(raw):
    """RFC 822(표준) 또는 '2026-10-21 19:03:08'(국내 언론사 RSS) 형식 → KST datetime."""
    if not raw:
        return None
    try:
        return parsedate_to_datetime(raw).astimezone(KST)
    except (TypeError, ValueError):
        pass
    try:
        return datetime.strptime(raw.strip()[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=KST)
    except ValueError:
        return None


def parse_feed(xml_bytes, source):
    items = []
    for it in ET.fromstring(xml_bytes).iter("item"):
        title, link = (it.findtext("title") or "").strip(), (it.findtext("link") or "").strip()
        if not title or not link.startswith("http"):
            continue
        items.append({"title": html.unescape(title), "link": link, "source": source,
                      "summary": _text(it.findtext("description")),
                      "published": _published(it.findtext("pubDate"))})
    return items


# 첫 화면 맨 위 큰 기사 블록(#skin-1)의 첫 기사: 링크·제목(h2.auto-titles)·요약(div.auto-sums)
MAIN_RE = re.compile(
    r'id="skin-1"[^>]*>.*?<a href="(?P<link>https?://[^"]+articleView[^"]+)"[^>]*class="photo-titbg"[^>]*>\s*'
    r'<h2[^>]*auto-titles[^>]*>(?P<title>.*?)</h2>(?:\s*<div[^>]*auto-sums[^>]*>(?P<summary>.*?)</div>)?',
    re.S | re.I)


def parse_main(html_bytes, source):
    """언론사 첫 화면 HTML → 메인 기사 하나. 구조가 바뀌어 못 찾으면 None."""
    m = MAIN_RE.search(html_bytes.decode("utf-8", "replace"))
    if not m:
        return None
    title = _text(m.group("title")).rstrip("…")
    return {"title": title, "link": html.unescape(m.group("link")), "source": source,
            "summary": _text((m.group("summary") or "").replace("...", "…")),
            "published": None, "kind": "main"} if title else None


def _fetch(url, timeout=6):
    req = urllib.request.Request(url, headers={"User-Agent": "trAIl/0.1 (+student project)"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read()


_news_cache = {}  # {날짜: 기사} — 그날 처음 고른 기사를 하루 동안 유지


def _latest_from_feeds(fetch):
    items = []
    for source, url in FEEDS:
        try:
            items += parse_feed(fetch(url), source)
        except Exception:  # 한 곳이 안 되면 다른 곳 기사로
            continue
    if not items:
        return None
    latest = max(items, key=lambda i: i["published"] or datetime.min.replace(tzinfo=KST))
    return {**latest, "published": latest["published"].isoformat() if latest["published"] else None, "kind": "latest"}


def news(day=None, fetch=_fetch):
    """오늘의 뉴스: 메인 기사 → (실패 시) RSS 최신 기사. 그날 처음 고른 기사를 하루 동안 유지."""
    day = day or today()
    if day in _news_cache:
        return _news_cache[day]
    item = None
    try:
        item = parse_main(fetch(MAIN_PAGE[1]), MAIN_PAGE[0])
    except Exception:
        pass
    item = item or _latest_from_feeds(fetch)
    if item is None:
        return None  # 실패는 캐시하지 않고 다음 요청 때 다시 시도
    item = {**item, "date": day.isoformat()}
    _news_cache.clear()
    _news_cache[day] = item
    return item

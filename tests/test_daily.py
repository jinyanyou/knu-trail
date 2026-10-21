from datetime import date

from engine import daily

FEED = """<?xml version="1.0" encoding="utf-8"?><rss><channel>
<item><title>오래된 기사</title><link>https://example.com/1</link>
<description><![CDATA[<p>예전 &amp; 내용</p>]]></description><pubDate>2026-10-20 09:00:00</pubDate></item>
<item><title>최신 기사</title><link>https://example.com/2</link>
<description><![CDATA[새 소식 ]]></description><pubDate>Wed, 21 Oct 2026 10:00:00 GMT</pubDate></item>
</channel></rss>""".encode()


def test_quiz_is_one_question_per_day_and_rotates():
    a, b = daily.quiz(date(2026, 10, 22)), daily.quiz(date(2026, 10, 23))
    assert a == daily.quiz(date(2026, 10, 22)) and a["id"] != b["id"]
    assert len(a["choices"]) == 4 and 0 <= a["answer"] < 4 and a["explanation"]
    n = len(daily._questions())
    assert len({daily.quiz(date.fromordinal(date(2026, 1, 1).toordinal() + i))["id"] for i in range(n)}) == n


# AI타임스 첫 화면 맨 위 메인 기사 블록 모양 (내용은 지어낸 예시)
MAIN = """<div id="skin-1" class="auto-article"><div class="item">
<a href="https://www.aitimes.com/news/articleView.html?idxno=1" target="_top" class="frame"><img alt="x"></a>
<a href="https://www.aitimes.com/news/articleView.html?idxno=1" target="_top" class="photo-titbg">
<H2 class="auto-titles line-x2 onload">메인 기사 &amp; 제목</H2>
<div class="auto-sums line-x2">메인 기사 요약...</div></a></div></div>
<div id="skin-8"><a href="https://www.aitimes.com/news/articleView.html?idxno=2"><H2 class="auto-titles">다른 기사</H2></a></div>""".encode()


def test_news_is_the_main_article_and_kept_for_the_day():
    daily._news_cache.clear()
    pages = {daily.MAIN_PAGE[1]: MAIN}
    item = daily.news(date(2026, 10, 22), fetch=lambda u: pages.get(u, FEED))
    assert (item["title"], item["kind"]) == ("메인 기사 & 제목", "main")
    assert item["link"].endswith("idxno=1") and item["summary"] == "메인 기사 요약…"
    pages[daily.MAIN_PAGE[1]] = MAIN.replace("메인 기사".encode(), "바뀐 메인".encode())
    assert daily.news(date(2026, 10, 22), fetch=lambda u: pages.get(u, FEED)) == item   # 하루 동안 같은 기사


def test_news_falls_back_to_latest_feed_item_when_main_page_changes():
    daily._news_cache.clear()
    item = daily.news(date(2026, 10, 22), fetch=lambda u: b"<html>new layout</html>" if u == daily.MAIN_PAGE[1] else FEED)
    assert (item["title"], item["kind"]) == ("최신 기사", "latest")
    assert daily.parse_feed(FEED, "x")[0]["summary"] == "예전 & 내용"


def test_news_failure_returns_none_without_caching():
    daily._news_cache.clear()

    def boom(url):
        raise OSError("offline")

    assert daily.news(date(2026, 10, 22), fetch=boom) is None
    assert daily._news_cache == {}

from datetime import date

from engine import schedule

PAGE = """<dl><dd class="list"><ul>
<li><span class="day">10.21(수)</span>중간고사 기간 (10.21.~10.27.)</li>
<li><span class="day">10.28(수)</span>[대학원] 논문 접수 : 10.28.~10.29.</li>
<li><span class="day">11.02(월)</span>개천절 같은 공휴일</li>
<li><span class="day">12.28(월)</span>2학기 성적 공개 (12.28.~1.4.)</li>
</ul></dd></dl>"""
NEXT = """<li><span class="day">02.11(목)</span>1학기 수강신청 (2.11.~2. 15.)</li>"""


def test_parse_dates_and_ranges_across_year_end():
    ev = schedule.parse(PAGE, 2026)
    assert ev[0]["start"] == date(2026, 10, 21) and ev[0]["end"] == date(2026, 10, 27)
    assert ev[3]["end"] == date(2027, 1, 4)
    assert schedule.parse(NEXT, 2027)[0]["end"] == date(2027, 2, 15)


def test_upcoming_keeps_undergraduate_events_with_d_day():
    schedule._cache.clear()
    pages = {2026: PAGE, 2027: NEXT}
    r = schedule.upcoming(date(2026, 10, 22), fetch=lambda url: pages[int(url[-4:])])
    titles = [e["title"] for e in r["events"]]
    assert titles == ["중간고사 기간 (10.21.~10.27.)", "2학기 성적 공개 (12.28.~1.4.)", "1학기 수강신청 (2.11.~2. 15.)"]
    first = r["events"][0]
    assert first["ongoing"] and first["d_day"] == -1 and first["days_left"] == 5
    assert r["events"][2]["d_day"] == (date(2027, 2, 11) - date(2026, 10, 22)).days


def test_upcoming_returns_none_when_site_unreachable():
    schedule._cache.clear()

    def boom(url):
        raise OSError

    assert schedule.upcoming(date(2026, 10, 22), fetch=boom) is None

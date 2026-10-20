"""모바일(390x844, 터치) 화면 점검: 대시보드·수강신청 연습을 실제로 눌러 보며 단계마다 가로 넘침을 재고 스크린샷을 남긴다.

    uvicorn backend.app:app --port 8000        # 먼저 서버 실행 (frontend/dist 빌드 필요)
    pip install playwright && playwright install chromium
    python scripts/mobile_check.py out/        # 스크린샷 폴더

CHROME_PATH 환경변수가 있으면 그 Chrome을 쓴다.
"""
import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else "mobile_check_out"
Path(OUT).mkdir(parents=True, exist_ok=True)
URL = os.environ.get("APP_URL", "http://127.0.0.1:8000/")
report = []


def overflow(page, label):
    info = page.evaluate("""() => {
      const w = document.documentElement.clientWidth
      const wide = [...document.querySelectorAll('body *')].filter(el => {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return false
        // 가로 스크롤 상자 안의 요소(표)는 제외
        for (let p = el.parentElement; p; p = p.parentElement) {
          const s = getComputedStyle(p)
          if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden') return false
        }
        return r.right > w + 1 || r.left < -1
      }).slice(0, 5).map(el => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 60) + ` (${Math.round(el.getBoundingClientRect().right)}px)`)
      return { page: document.documentElement.scrollWidth, view: w, wide }
    }""")
    ok = info["page"] <= info["view"] and not info["wide"]
    report.append(f"{'OK ' if ok else 'BAD'} {label}: 페이지 {info['page']}px / 화면 {info['view']}px {info['wide'] if info['wide'] else ''}")


def tap(locator):
    locator.scroll_into_view_if_needed()
    locator.tap()


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, headless=True)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    # ── 대시보드 ──
    page.goto(URL)
    plan = page.evaluate("fetch('/api/standard-plan?entry_year=2025').then(r=>r.json())")["plan"]
    taken = [{"id": f"x{i}", "code": x["code"], "year": 2025 + x["grade"] - 1, "semester": x["semester"], "grade": "A0"}
             for i, x in enumerate(plan) if x["grade"] <= 2]
    taken.append({"id": "p1", "code": "CAIB0216", "year": 2026, "semester": "2학기", "grade": None})
    state = {"entryYear": 2025, "taken": taken, "profile": {"programs": [{"kind": "convergence", "code": "1O18"}]}}
    page.evaluate(f"localStorage.setItem('trail:v1', {json.dumps(json.dumps(state, ensure_ascii=False))})")
    page.reload()
    page.wait_for_selector("text=융합전공 · 피지컬AI융합전공")
    overflow(page, "대시보드 첫 화면")
    page.screenshot(path=OUT + "/m1_top.png")
    page.screenshot(path=OUT + "/m2_full.png", full_page=True)

    # 다전공 추가: 복수전공 경영학부
    tap(page.get_by_role("button", name="+ 다전공 추가"))
    box = page.get_by_placeholder("학과·전공 검색 (예: 경영학부)")
    tap(box)
    box.fill("경영")
    tap(page.get_by_role("option", name="경영학부").first)
    page.wait_for_selector("text=복수전공 · 경영학부")
    report.append("OK  다전공 추가(터치)")
    overflow(page, "다전공 2개")

    # 분류로 찾기 → 교양 → 영역
    panel = page.locator(".browse")
    panel.get_by_label("분류", exact=True).select_option("la")
    panel.get_by_label("영역", exact=True).select_option("첨성인기초")
    tap(panel.locator(".browse-list button:not([disabled])").first)
    report.append("OK  분류로 찾기 → 추가(터치)")
    overflow(page, "분류로 찾기 열림")
    panel.screenshot(path=OUT + "/m3_browse.png")

    # 들어야 하는 과목 펼치고 +예정
    det = page.locator("details.options").first
    tap(det.locator("summary"))
    tap(det.locator("button", has_text="+ 예정").first)
    report.append("OK  남은 과목 + 예정(터치)")
    overflow(page, "남은 과목 펼침")

    # 인정 전공 선택 (주전공/융합 겹치는 과목)
    sel = page.locator("select.counts-for")
    report.append(f"OK  인정 전공 선택 상자 {sel.count()}개")
    if sel.count():
        sel.first.select_option(index=2)
    page.screenshot(path=OUT + "/m4_after.png", full_page=True)

    # 성적표 가져오기 패널
    tap(page.get_by_role("button", name="성적표·시간표 붙여넣어 한 번에 가져오기"))
    overflow(page, "가져오기 패널")

    # ── 시뮬레이션 ──
    tap(page.locator("a.sim-link"))
    page.wait_for_selector("text=연습 시작")
    overflow(page, "시뮬 설정")
    page.screenshot(path=OUT + "/m5_sim_setup.png", full_page=True)
    page.locator(".sim-login-body select").nth(3).select_option("0")
    page.get_by_label("자동입력방지문자 입력").uncheck()
    tap(page.locator("button.sim-btn-login"))
    page.wait_for_selector(".sim-queue")
    overflow(page, "대기열")
    page.screenshot(path=OUT + "/m6_queue.png")
    page.wait_for_selector(".sim-inputbar", timeout=30000)
    overflow(page, "신청 화면")
    page.fill(".sim-inputbar input", "CAIB0207001")
    tap(page.locator(".sim-btn-red", has_text="조회"))
    tap(page.locator(".sim-table button", has_text="신청").first)
    page.wait_for_selector(".sim-modal")
    overflow(page, "알림창")
    page.screenshot(path=OUT + "/m7_modal.png")
    tap(page.locator(".sim-modal button"))
    # 메모에서 강좌번호 넣기
    if page.locator(".sim-memo-secs button").count():
        tap(page.locator(".sim-memo-secs button").first)
        report.append("OK  메모 → 강좌번호 입력(터치)")
    tap(page.locator(".sim-finder summary"))
    overflow(page, "강좌 찾기 열림")
    page.screenshot(path=OUT + "/m8_finder.png")
    tap(page.locator(".sim-finder summary"))
    page.screenshot(path=OUT + "/m9_main_full.png", full_page=True)
    tap(page.get_by_role("button", name="연습 종료"))
    page.wait_for_selector(".sim-result")
    overflow(page, "결과")
    page.screenshot(path=OUT + "/m10_result.png", full_page=True)

    # 수강정정 모드
    tap(page.get_by_role("button", name="다시 연습"))
    page.locator(".sim-login-body select").nth(1).select_option("change")
    page.locator(".sim-login-body select").nth(3).select_option("0")
    page.get_by_label("자동입력방지문자 입력").uncheck()
    page.get_by_label("접속 대기열 재현").uncheck()
    tap(page.locator("button.sim-btn-login"))
    page.wait_for_selector(".sim-inputbar")
    n = page.locator(".sim-table").nth(1).locator("tbody tr").count()
    report.append(f"OK  수강정정 시작 시간표 {n}과목")
    # 꽉 찬 과목 삭제 시 확인창
    rows = page.locator(".sim-table").nth(1).locator("tbody tr")
    tap(rows.first.locator("button"))
    txt = page.locator(".sim-modal p").nth(1).inner_text()
    report.append(f"OK  삭제 → {txt[:60]}")
    if page.locator(".sim-modal-actions").count():
        tap(page.locator(".sim-modal-actions button", has_text="취소"))
    else:
        tap(page.locator(".sim-modal button"))
    # 제한 분반
    page.fill(".sim-inputbar input", "CAIB0230002")
    tap(page.locator(".sim-btn-red", has_text="조회"))
    remark = page.locator(".sim-remark").inner_text() if page.locator(".sim-remark").count() else "(비고 없음)"
    tap(page.locator(".sim-table").first.locator("button", has_text="신청"))
    report.append(f"OK  제한 분반 신청 → {page.locator('.sim-modal p').nth(1).inner_text()[:50]}")
    report.append(f"    비고 표시: {remark[:70]}")
    tap(page.locator(".sim-modal button"))
    overflow(page, "수강정정 화면")
    page.screenshot(path=OUT + "/m11_change.png", full_page=True)

    print("\n".join(report))
    print("errors:", errors)
    bad = [r for r in report if r.startswith("BAD")] + errors
    b.close()
    sys.exit(1 if bad else 0)

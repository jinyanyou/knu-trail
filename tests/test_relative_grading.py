import sys
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app import app
from engine import relative_grading as rg

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from import_relative_grading import detect, split_dept  # noqa: E402
import openpyxl  # noqa: E402

client = TestClient(app)


def test_track_letter_is_split_from_dept_name():
    assert split_dept("IT대학 전자공학부 A") == ("IT대학", "전자공학부", "A")
    assert split_dept("IT대학 컴퓨터학부 인공지능컴퓨팅전공") == ("IT대학", "컴퓨터학부 인공지능컴퓨팅전공", None)
    assert split_dept("행정학부 행정학부 공공정책전공") == ("행정학부", "행정학부 공공정책전공", None)


def test_term_and_notice_date_are_read_from_the_sheet_title():
    src = Path(__file__).resolve().parent.parent / "data" / "sources" / "knu_2026-2_relative_grading.xlsx"
    ws = next(w for w in openpyxl.load_workbook(src, read_only=True).worksheets if w.title == "공개용")
    assert detect(ws) == ("2026-2", "2026-07-10")


def test_data_matches_sections_by_code_college_and_dept():
    doc = rg.load("2026-2")
    assert "2026-2" in rg.terms() and doc["term"] == "2026-2" and len(doc["courses"]) == 520
    rl = {(c["code"], c["dept"]): c for c in doc["courses"] if c["code"] == "CAIB0216"}
    assert rl[("CAIB0216", "전자공학부 인공지능전공")]["dept_codes"] == ["1O0109"]
    assert rl[("CAIB0216", "컴퓨터학부 인공지능컴퓨팅전공")]["dept_codes"] == ["1O0208"]


def test_only_sections_opened_by_my_dept_count_as_mine():
    courses = rg.for_student(2024)["lists"]["2026-2"]["courses"]
    assert courses["CAIB0216"]["mine"]                 # 강화학습개론: 인공지능전공 분반 지정
    ml = courses["ITEC0417"]                           # 기계학습개론: 컴퓨터학부 분반만 지정
    assert not ml["mine"] and {o["dept"] for o in ml["offered_by"]} == {"컴퓨터학부", "컴퓨터학부 글로벌소프트웨어융합전공"}
    assert "CAIB0227" not in courses                   # 지정 안 된 과목은 아예 없음


def test_double_major_dept_counts_as_mine():
    assert not rg.for_student(2024)["lists"]["2026-2"]["courses"]["COMP0411"]["mine"]
    assert rg.for_student(2024, ("1O01",))["lists"]["2026-2"]["courses"]["COMP0411"]["mine"]   # 전자공학부 복수전공 → 전자공학부 A 분반


def test_api_returns_notice_and_flags():
    body = client.get("/api/relative-grading", params={"entry_year": 2024, "programs": "1O0208"}).json()
    assert body["latest"] == "2026-2" and body["caveat"]
    term = body["lists"]["2026-2"]
    assert term["notice_date"] == "2026-07-10" and term["courses"]["MOBI0224"]["mine"]          # 딥러닝: 인공지능컴퓨팅전공 분반 지정
    assert client.get("/api/relative-grading", params={"entry_year": 2024, "programs": "XXXX"}).status_code == 400

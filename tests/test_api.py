from fastapi.testclient import TestClient

from backend.app import app

client = TestClient(app)


def test_meta_lists_supported_entry_years():
    years = {e["year"]: e["status"] for e in client.get("/api/meta").json()["entry_years"]}
    assert years[2026] == "confirmed"
    assert years[2027] == "provisional"


def test_catalog_has_major_and_liberal_arts():
    body = client.get("/api/catalog", params={"entry_year": 2026, "year": 2026}).json()
    cats = {c["category"] for c in body["courses"]}
    assert {"전공필수", "전공", "교양"} <= cats


def test_evaluate_round_trip():
    res = client.post("/api/evaluate", json={
        "entry_year": 2026,
        "taken": [{"code": "CAIB0227", "year": 2026, "semester": "1학기", "grade": "A0"}],
        "profile": {"math_science_waived": True},
    })
    assert res.status_code == 200
    body = res.json()
    assert body["summary"]["earned_credits"] == 3
    assert next(r for r in body["requirements"] if r["id"] == "basic_math_science")["status"] == "waived"


def test_unsupported_year_is_400():
    assert client.post("/api/evaluate", json={"entry_year": 2019}).status_code == 400
    assert client.get("/api/catalog", params={"entry_year": 2019}).status_code == 400


def test_invalid_major_track_is_422():
    res = client.post("/api/evaluate", json={"entry_year": 2026, "profile": {"major_track": "triple"}})
    assert res.status_code == 422


def test_sim_timetable():
    terms = client.get("/api/sim/terms").json()["terms"]
    assert "2026-2" in terms
    body = client.get("/api/sim/timetable", params={"term": "2026-2"}).json()
    assert len(body["courses"]) > 1000
    c = next(c for c in body["courses"] if c["code"] == "CAIB0207")
    assert c["capacity"] and c["slots"]
    assert client.get("/api/sim/timetable", params={"term": "../x"}).status_code == 404

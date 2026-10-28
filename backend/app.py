"""trAIl API.

    uvicorn backend.app:app --reload          # 저장소 루트에서 실행

frontend/dist 가 있으면 같은 서버에서 화면까지 제공한다(배포용). 개발 중에는 Vite 개발 서버가 /api 를 프록시한다.
성적 데이터는 요청마다 계산만 하고 저장하지 않는다.
"""
import io
import re
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pypdf import PdfReader

from engine import ai_extract, catalog, daily, importer, relative_grading, roadmap, schedule
from engine.graduation import evaluate
from engine.rules import load_rules_doc, supported_entry_years

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
Semester = Literal["1학기", "2학기", "여름계절", "겨울계절"]

app = FastAPI(title="trAIl API", version="0.1.0")
app.add_middleware(GZipMiddleware, minimum_size=1000)
TIMETABLE = Path(__file__).resolve().parent.parent / "data" / "timetable"


class RetakeInfo(BaseModel):
    """재수강한 과목의 이전 수강 (성적표에는 재수강 뒤 성적만 남아 학생이 직접 표시). 모르면 비워 둠"""
    year: int | None = Field(default=None, ge=2000, le=2100)
    semester: str | None = None
    grade: str | None = Field(default=None, max_length=5)


class TakenCourse(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    year: int | None = Field(default=None, ge=2000, le=2100)
    semester: str | None = None
    grade: str | None = None
    credits: int | None = Field(default=None, ge=0, le=30)
    name: str | None = Field(default=None, max_length=100)
    external: bool = False
    pnu: bool = False
    counts_for: str | None = Field(default=None, max_length=20)  # "primary" 또는 다전공 학과 코드
    # 학생이 직접 지정한 분류 (없으면 교육과정 기준 자동 분류). 교양이면 영역도
    category: Literal["전공필수", "전공", "교양", "일반선택"] | None = None
    area: str | None = Field(default=None, max_length=30)
    sub_area: str | None = Field(default=None, max_length=30)
    retake: RetakeInfo | None = None


class ProgramChoice(BaseModel):
    kind: Literal["double", "linked", "convergence", "minor"]
    code: str = Field(min_length=1, max_length=20)
    min_credits: int | None = Field(default=None, ge=1, le=200)


class Profile(BaseModel):
    major_track: Literal["single", "double_major", "single_minor"] = "single"
    programs: list[ProgramChoice] = Field(default_factory=list, max_length=3)
    transfer: bool = False
    qualification_exempt: bool = False
    foreign_student: bool = False
    teaching_course: bool = False
    math_science_waived: bool = False
    english_test: str | None = Field(default=None, max_length=50)
    english_test_planned: bool = False  # 대체 성적·이수를 아직 받기 전(예정)
    # True(프로필 체크) 또는 인정 방법 글 (예: "정보처리기사"), _planned = 아직 받기 전(예정)
    software_alternative: bool | Annotated[str, Field(max_length=50)] = False
    software_alternative_planned: bool = False
    counseling_done: bool = False
    counseling_count: int | None = Field(default=None, ge=0, le=99)
    counseling_required: int | None = Field(default=None, ge=1, le=99)
    major_assessment_done: bool = False
    joint_degree: bool = False


class EvaluateRequest(BaseModel):
    entry_year: int
    taken: list[TakenCourse] = Field(default_factory=list, max_length=300)
    profile: Profile = Field(default_factory=Profile)


def _check_year(entry_year):
    if entry_year not in supported_entry_years():
        raise HTTPException(400, f"{entry_year}학번은 아직 지원하지 않습니다. 지원 학번: {supported_entry_years()}")


def _program_codes(entry_year, raw):
    """'1O18,1403' → ('1O18', '1403'). 없는 코드는 400."""
    codes = tuple(c for c in (raw or "").split(",") if c)[:3]
    unknown = [c for c in codes if c not in catalog.programs(entry_year)]
    if unknown:
        raise HTTPException(400, f"다전공 학과 코드를 찾을 수 없습니다: {', '.join(unknown)}")
    return codes


@app.get("/api/meta")
def meta():
    rulesets = load_rules_doc()["rulesets"]
    return {
        "entry_years": [
            {"year": y, "ruleset": rs["id"], "status": rs["status"]}
            for rs in rulesets for y in range(rs["entry_years"][0], rs["entry_years"][1] + 1)
        ],
        "open_questions": load_rules_doc()["open_questions"],
        "ai_enabled": ai_extract.enabled(),
    }


@app.get("/api/programs")
def program_list(entry_year: int):
    """다전공으로 고를 수 있는 학과·융합전공 목록 (과목 목록 제외)."""
    _check_year(entry_year)
    return {"entry_year": entry_year, "programs": [
        {"code": p["code"], "name": p["name"], "college": p["college"], "kind": p["kind"],
         "multi_major_credits": p["multi_major_credits"], "course_count": len(p["courses"]),
         "curriculum_year": p["curriculum_year"],
         "allowed": p.get("allowed"), "host": p.get("host"), "quota": p.get("quota"), "selection": p.get("selection"),
         "required_count": sum(c["type"] == "전공필수" for c in p["courses"]),
         "minor_required_count": sum(c["minor_required"] for c in p["courses"])}
        for p in catalog.programs(entry_year).values()
    ]}


@app.get("/api/program-courses")
def program_courses(entry_year: int, code: str):
    """학과·융합전공 하나의 전공 과목 (분류별 과목 찾기용)."""
    _check_year(entry_year)
    p = catalog.programs(entry_year).get(code)
    if p is None:
        raise HTTPException(404, f"학과 코드를 찾을 수 없습니다: {code}")
    return {"code": p["code"], "name": p["name"], "college": p["college"], "kind": p["kind"],
            "courses": p["courses"]}


@app.get("/api/sim/terms")
def sim_terms():
    """수강신청 연습에 쓸 수 있는 학기 목록."""
    return {"terms": sorted((p.stem for p in TIMETABLE.glob("*.json")), reverse=True)}


@app.get("/api/sim/timetable")
def sim_timetable(term: str):
    """한 학기 전체 개설 분반 (수강신청 연습용). 예: term=2026-2"""
    if not re.fullmatch(r"\d{4}-[12]", term) or not (TIMETABLE / f"{term}.json").exists():
        raise HTTPException(404, f"{term} 시간표 데이터가 없습니다.")
    return Response((TIMETABLE / f"{term}.json").read_bytes(), media_type="application/json")


@app.get("/api/catalog")
def course_catalog(entry_year: int, year: int | None = None, programs: str | None = None):
    """과목 검색용 목록: 입학연도 전공 과목 + 수강 연도 교양 과목 + 고른 다전공 학과 과목."""
    _check_year(entry_year)
    codes = _program_codes(entry_year, programs)
    major = [
        {"code": c["code"], "name": c["name"], "credits": c["credits"], "category": c["type"],
         "grade": c["grade"], "semester": c["semester"]}
        for c in catalog.curriculum(entry_year)["courses"] if c["type"] != "교양"
    ]
    la_year, la = catalog.liberal_arts(year or entry_year)
    liberal = [
        {"code": c["code"], "name": c["name"], "credits": c["credits"], "category": "교양",
         "area": c["area"], "sub_area": c["sub_area"], "sdg": c["sdg"]}
        for c in la.values()
    ]
    have = {c["code"] for c in major + liberal}
    extra = []
    for code in codes:
        p = catalog.program(entry_year, code)
        for c in p["courses"]:
            if c["code"] not in have:
                have.add(c["code"])
                extra.append({"code": c["code"], "name": c["name"], "credits": c["credits"], "category": "다전공",
                              "program": p["name"], "program_code": p["code"], "type": c["type"]})
    return {"entry_year": entry_year, "liberal_arts_year": la_year, "courses": major + liberal + extra}


@app.get("/api/relative-grading")
def relative_grading_list(entry_year: int, programs: str | None = None):
    """상대평가 권장 과목(A 50% 이내) 지정 내역 — 과목마다 학생 소속 학과가 연 분반이 해당되는지."""
    _check_year(entry_year)
    return relative_grading.for_student(entry_year, _program_codes(entry_year, programs))


@app.get("/api/standard-plan")
def standard_plan(entry_year: int):
    _check_year(entry_year)
    return {"entry_year": entry_year, "plan": catalog.curriculum(entry_year)["standard_plan"]}


@app.post("/api/evaluate")
def evaluate_endpoint(req: EvaluateRequest):
    _check_year(req.entry_year)
    try:
        return evaluate(req.entry_year, [t.model_dump() for t in req.taken], req.profile.model_dump())
    except KeyError as e:  # 없는 다전공 학과 코드
        raise HTTPException(400, str(e.args[0])) from e


class RoadmapRequest(EvaluateRequest):
    max_credits: int = Field(default=18, ge=9, le=24)   # 한 학기에 넣을 최대 학점
    start_year: int | None = Field(default=None, ge=2000, le=2100)
    start_semester: Literal["1학기", "2학기"] | None = None
    exclude: list[str] = Field(default_factory=list, max_length=200)   # 로드맵에서 뺀 과목 코드


@app.post("/api/roadmap")
def roadmap_endpoint(req: RoadmapRequest):
    """남은 졸업요건을 채우는 학기별 수강 계획 (규칙 기반, 엔진으로 졸업 가능 여부까지 검증)."""
    _check_year(req.entry_year)
    start = ((req.start_year, req.start_semester) if req.start_year and req.start_semester
             else roadmap.first_term(daily.today()))
    try:
        return roadmap.plan(req.entry_year, [t.model_dump() for t in req.taken], req.profile.model_dump(),
                            start=start, max_credits=req.max_credits, exclude=req.exclude)
    except KeyError as e:
        raise HTTPException(400, str(e.args[0])) from e


@app.post("/api/roadmap/timeline")
def roadmap_timeline(req: EvaluateRequest):
    """요건마다 언제 채워지는지 (지금 / 수강 예정 과목을 학기 순으로 더했을 때 처음 충족되는 학기) + 전체 계산 결과."""
    _check_year(req.entry_year)
    try:
        return roadmap.timeline(req.entry_year, [t.model_dump() for t in req.taken], req.profile.model_dump())
    except KeyError as e:
        raise HTTPException(400, str(e.args[0])) from e


class ImportTextRequest(BaseModel):
    entry_year: int
    text: str = Field(min_length=1, max_length=50_000)
    default_year: int | None = Field(default=None, ge=2000, le=2100)
    default_semester: Semester | None = None
    use_ai: bool = False
    programs: list[str] = Field(default_factory=list, max_length=3)


def _run_ai(entry_year, **kwargs):
    if not ai_extract.enabled():
        # 사진·스캔본처럼 글자를 뽑을 수 없는 자료 (AI 인식은 서버에 ANTHROPIC_API_KEY가 있을 때만)
        raise HTTPException(400, "글자를 읽을 수 없는 자료예요 (사진·스캔본). 통합정보시스템에서 내려받은 성적증명서 PDF를 올리거나, "
                                 "내용을 복사해 텍스트로 붙여넣어 주세요.")
    try:
        return {"engine": "ai", **ai_extract.extract(entry_year, **kwargs)}
    except ai_extract.AIExtractError as e:
        raise HTTPException(502, str(e)) from e


@app.post("/api/import/text")
def import_text(req: ImportTextRequest):
    """붙여넣은 성적 목록·시간표 텍스트 → 과목 후보. 저장하지 않는다."""
    _check_year(req.entry_year)
    codes = _program_codes(req.entry_year, ",".join(req.programs))
    if req.use_ai:
        return _run_ai(req.entry_year, text=req.text, programs=codes,
                       default_year=req.default_year, default_semester=req.default_semester)
    return {"engine": "rules",
            **importer.parse_text(req.text, req.entry_year, req.default_year, req.default_semester, codes)}


@app.post("/api/import/file")
async def import_file(
    file: Annotated[UploadFile, File()],
    entry_year: Annotated[int, Form()],
    default_year: Annotated[int | None, Form()] = None,
    default_semester: Annotated[Semester | None, Form()] = None,
    programs: Annotated[str | None, Form()] = None,
):
    """성적표 PDF·시간표 캡처 → 과목 후보. PDF는 글자를 먼저 뽑아 규칙으로 처리하고, 안 되면 AI."""
    _check_year(entry_year)
    codes = _program_codes(entry_year, programs)
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "파일이 너무 큽니다 (최대 10MB).")
    media_type = file.content_type or ""

    if media_type == ai_extract.PDF_TYPE:
        try:
            text = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(data)).pages)
        except Exception:
            text = ""
        if text.strip():
            result = importer.parse_text(text, entry_year, default_year, default_semester, codes)
            if result["candidates"] or not ai_extract.enabled():
                return {"engine": "rules", **result}
    elif media_type not in ai_extract.IMAGE_TYPES:
        raise HTTPException(415, "PNG·JPG·WEBP 이미지나 PDF만 올릴 수 있습니다.")

    return _run_ai(entry_year, file_bytes=data, media_type=media_type, programs=codes,
                   default_year=default_year, default_semester=default_semester)


@app.get("/api/daily")
def daily_cards():
    """오늘의 전공 뉴스(없으면 null)와 퀴즈 — 한국 시간 기준 하루에 하나."""
    return {"date": daily.today().isoformat(), "news": daily.news(), "quiz": daily.quiz()}


@app.get("/api/schedule")
def academic_schedule():
    """경북대 학사일정 중 학부생에게 중요한 진행 중·다가오는 일정 (못 가져오면 events 빈 목록)."""
    return schedule.upcoming() or {"date": daily.today().isoformat(), "events": [], "source": schedule.SOURCE}


DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")

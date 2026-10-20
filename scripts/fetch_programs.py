"""다전공(복수·부·융합·연계전공) 대상 학과·융합전공 교육과정 수집기.

knuin 교육과정 조회 API에 학과 코드를 비워 보내면 학부·대학원 전체 교육과정이 한 번에 온다.
그중 학부 학과·융합전공만 골라 전공 과목 목록을 정리하고, 학교 '전공학점 기준' 원문
(data/sources/knu_2026_major_credits.txt)에서 학번별 '다전공 시 이수학점'을 찾아 붙인다.

    python scripts/fetch_programs.py              # 2023~2027학번
    python scripts/fetch_programs.py 2026         # 특정 학번만

출력: data/programs/<학번>.json
"""
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_curriculum import BASE, ENDPOINTS, MODULE_KINDS, course_types, post, session  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent / "data"
CREDITS_SOURCE = ROOT / "sources" / "knu_2026_major_credits.txt"
CONVERGENCE_LIST = ROOT / "rules" / "convergence.json"  # 학교가 현재 선발하는 융합전공 공식 목록
PRIMARY_CODE = "1O0109"  # 인공지능전공 — 자기 전공은 다전공 대상에서 뺀다

# 학부 학과 코드: 4자리(학과) 또는 6자리(학부 안의 전공). 대학원은 5자리 이상 숫자로 시작해 걸러진다.
UNDERGRAD_CODE = re.compile(r"^1[0-9A-Z]{3}([0-9]{2})?$")
MAJOR_TYPES = {"전공", "전공필수", "융합전공", "전공심화", "전공기초", "연계전공", "부전공", "복수전공"}
SKIP_NAME = re.compile(r"자율학부|첨단자율학부")
# 다전공 허용 학과 — 학사안내 '복수전공'·'부전공' 페이지 (2026-10 확인)
#   복수전공 제외: 예술대학·사범대학·수의·간호·약학·의과·치과대학 전학과, 모바일공학전공, 농산업학과, 치위생학과,
#                  글로벌인재학부, 산업기계공학과 (단, 사범대생·교직과정 이수자는 사범대학 전학과 복수전공 가능)
#   부전공 제외:   간호학과, 의과·치과·수의과대학 전학과, 약학과, 모바일공학전공, 치위생학과, 산업기계공학과
# 학과 이름 '전체'(또는 '학부 전공'의 마지막 단어)와 정확히 일치할 때만 — 부분 일치는 '혁신신약학과'(약학과),
# '스마트생물산업기계공학과'(산업기계공학과)까지 잘못 걸러낸다
NO_MULTI_MAJOR = re.compile(r"(?:^|\s)(?:의예과|치의예과|수의예과|의학과|치의학과|수의학과|간호학과|약학과|모바일공학전공|치위생학과"
                            r"|산업기계공학과"
                            # 이수지침 제23조②1: 교직 연계전공은 사범대생·교직과정 선발자만
                            r"|기술·가정교육전공|통합과학교육전공|통합사회교육전공)$")
NO_DOUBLE_MAJOR = re.compile(r"(?:^|\s)(?:농산업학과|글로벌인재학부)$")
ARTS_COLLEGE = ("예술대학", "18")      # (단과대학 이름, 학과 코드 앞자리)
EDUCATION_COLLEGE = ("사범대학", "19")


def double_major_allowed(code, college, name):
    """True / False / 'teaching'(사범대생·교직과정 이수자만)."""
    if NO_DOUBLE_MAJOR.search(name) or college == ARTS_COLLEGE[0] or code.startswith(ARTS_COLLEGE[1]):
        return False
    if college == EDUCATION_COLLEGE[0] or code.startswith(EDUCATION_COLLEGE[1]):
        return "teaching"
    return True
# 학부 코드(4자리) 과목은 그 아래 전공(6자리)의 공통 과목으로 합친다. 단, 전자공학부(1O01)는 그 자체가 하나의 전공이라
# 인공지능전공(1O0109)·모바일공학전공과 과목을 공유하지 않는다.
NO_PARENT_MERGE = {"1O01"}
# 모듈 목록에 정식 이름이 없는 전공 — 과목 구성과 전공학점 기준표의 전공 순서로 확인 (2026-10)
CODE_NAMES = {
    "1O0101": "IT대학 전자공학부 모바일공학전공",      # 운영체제·자료구조 등, 다전공 불가 학과
    "160101": "공과대학 기계공학부 기계공학전공",
    "160102": "공과대학 기계공학부 기계설계학전공",    # 2023학년도 모듈 목록에 이름 없음
    "160105": "공과대학 기계공학부 로봇/자동화전공",    # 로봇비전 및 센서, 로봇인공지능 ...
    "190D02": "사범대학 유럽어교육학부 프랑스어교육전공",
}


def norm(name):
    return re.sub(r"[\s·.\-/()]", "", name or "")


def strip_college(full_name):
    """'IT대학 컴퓨터학부 인공지능컴퓨팅전공' → ('IT대학', '컴퓨터학부 인공지능컴퓨팅전공')"""
    parts = (full_name or "").split()
    if len(parts) > 1 and parts[0].endswith("대학"):
        return parts[0], " ".join(parts[1:])
    return None, full_name


# ── 다전공 시 이수학점 (학교 전공학점 기준 원문) ──────────────────────
def _split_top(cell):
    """'A(B, C), D' → ['A(B, C)', 'D'] — 괄호 안 쉼표는 나누지 않는다."""
    out, depth, cur = [], 0, ""
    for ch in cell:
        depth += ch == "("
        depth -= ch == ")"
        if ch == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
        else:
            cur += ch
    return [x for x in out + [cur.strip()] if x]


def _expand(name):
    """'기계공학부(기계공학전공, 기계설계학전공)' → ['기계공학부기계공학전공', '기계공학부기계설계학전공']"""
    m = re.fullmatch(r"(.+?)\((.+)\)\**", name)
    if not m:
        return [norm(name.rstrip("*"))]
    return [norm(m.group(1)) + norm(sub) for sub in _split_top(m.group(2))]


def parse_multi_major_credits():
    """{학번: {정규화 학과명: (다전공 시, 단일전공 시)}} — 2023~2026학번 표."""
    text = CREDITS_SOURCE.read_text(encoding="utf-8")
    sections = list(re.finditer(r"□ (\d{4})학년도 입학생", text))
    result = {}
    for i, sec in enumerate(sections):
        year = int(sec.group(1))
        if year < 2023:
            continue
        end = sections[i + 1].start() if i + 1 < len(sections) else len(text)
        body = text[sec.end():end].split("* 다전공")[0]
        cells = [c.strip() for c in body.split("|") if c.strip()]
        table, name = {}, None
        nums = []
        for cell in cells:
            m = re.fullmatch(r"([\d.]+)학점|-", cell)
            if m:
                nums.append(float(m.group(1)) if m.group(1) else None)
                continue
            if name and nums:
                _store(table, name, nums)
            name, nums = cell, []
        if name and nums:
            _store(table, name, nums)
        result[year] = table
    return result


def _store(table, name, nums):
    # 2026 표는 [다전공, 다전공 가중치, 단일, 단일 가중치], 이전 표는 [다전공, 단일]
    multi, single = (nums[0], nums[2]) if len(nums) >= 4 else (nums[0], nums[-1])
    for cell in _split_top(name):
        for key in _expand(cell):
            table[key] = (int(multi) if multi else None, int(single) if single else None)


# 기준표에 옛 이름으로 실린 전공
CREDIT_TABLE_ALIASES = {"유럽어교육학부프랑스어교육전공": "유럽어교육학부불어교육전공"}


def lookup_credits(table, dept, sub):
    """학과명 → 다전공 시 이수학점. 표의 학과명 표기가 해마다 조금씩 달라 몇 가지 키로 찾는다."""
    keys = [norm(dept) + norm(sub)] if sub else []
    keys += [norm(sub)] if sub else [norm(dept)]
    keys += [CREDIT_TABLE_ALIASES[k] for k in keys if k in CREDIT_TABLE_ALIASES]
    for key in keys:
        if key in table:
            return table[key][0], key
    return None, None


# ── 수집 ────────────────────────────────────────────────────────
def fetch_all(s, year):
    rows = post(s, ENDPOINTS["courses"], {"trgtYrsf": str(year), "dprtnCd": "", "dprtnNm": "", "mdlSctinCd": "",
                                          "forMdlMgmntYn": "", "frstNcrYear": ""})
    names = {}
    for kind in MODULE_KINDS:
        for m in post(s, ENDPOINTS["modules"], {"trgtYrsf": str(year), "dprtnCd": "", "dprtnNm": "", "mdlSctinCd": kind,
                                                 "forMdlMgmntYn": "Y", "frstNcrYear": str(year)}):
            names.setdefault(m["mngetDprtnCd"], m["mngetDprtnNm"])
    return rows, names


def official_convergence():
    """{정규화 이름: 공식 목록 항목}"""
    doc = json.loads(CONVERGENCE_LIST.read_text(encoding="utf-8"))
    return {norm(p["name"]): p for p in doc["programs"]}


def build(year, rows, full_names, types, credit_tables):
    official = official_convergence()
    by_dept = defaultdict(list)
    dept_name = {}
    for r in rows:
        code = r["dprtnCd"]
        if not UNDERGRAD_CODE.match(code or ""):
            continue
        dept_name.setdefault(code, (r["dprtnNm"] or "").strip())
        t = types.get(r["sbjetSctcd"], r["sbjetSctcd"])
        if t in MAJOR_TYPES:
            by_dept[code].append({"code": r["sbjetCd"], "name": r["sbjetNm"].strip(), "credits": r["crdit"],
                                  "type": t, "minor_required": r.get("mnorEssnlYn") == "Y",
                                  "grade": int(r["estblGrade"]) if r.get("estblGrade") else None})

    children = defaultdict(list)
    for code in dept_name:
        if len(code) == 6 and code[:4] in dept_name:
            children[code[:4]].append(code)

    # 표 기준 학번: 2027은 아직 표가 없어 가장 최근(2026) 표를 쓴다
    table_year = max(y for y in credit_tables if y <= year) if any(y <= year for y in credit_tables) else min(credit_tables)
    table = credit_tables[table_year]

    programs = []
    for code, base_name in sorted(dept_name.items()):
        if code == PRIMARY_CODE or SKIP_NAME.search(base_name) or not base_name:
            continue
        if children.get(code) and code not in NO_PARENT_MERGE:
            continue  # 학부 껍데기 — 아래 전공을 고르게 한다
        college, full = strip_college(CODE_NAMES.get(code) or full_names.get(code) or "")
        full = full or base_name
        dept, _, sub = full.partition(" ")
        if sub.startswith(dept + " "):  # '행정학부 행정학부 공공관리전공'
            sub = sub[len(dept) + 1:]
            full = f"{dept} {sub}"
        if NO_MULTI_MAJOR.search(full):
            continue
        courses = list(by_dept.get(code, []))
        parent = code[:4] if len(code) == 6 else None
        if parent and parent in dept_name and parent not in NO_PARENT_MERGE:
            have = {c["code"] for c in courses}
            courses += [c for c in by_dept.get(parent, []) if c["code"] not in have]
        if not courses:
            continue
        # 융합전공 판정은 이름이 아니라 (1) 학교 공식 융합전공 목록, (2) 과목 구분으로 한다.
        # '컴퓨터학부 글로벌소프트웨어융합전공'은 이름만 융합전공인 일반 전공이고, 과목이 '융합전공' 구분이어도
        # 공식 목록에 없으면 폐지됐거나 마이크로디그리 등 다른 과정 → 기존 이수자용으로만 남긴다.
        info = official.get(norm(full))
        if info:
            kind = "convergence"
        elif sum(c["type"] == "융합전공" for c in courses) * 2 >= len(courses):
            kind = "convergence_unlisted"
        elif all(c["type"] == "연계전공" for c in courses):
            kind = "linked"
        else:
            kind = "major"
        multi, matched = lookup_credits(table, dept, sub)
        programs.append({
            "code": code,
            "name": full,
            "college": college or (info or {}).get("college"),
            "kind": kind,
            "allowed": {"double": double_major_allowed(code, college, full), "minor": True}
                       if kind == "major" else None,
            **({"host": info["host"], "quota": info["quota"], "selection": info["selection"]} if info else {}),
            "multi_major_credits": multi,
            "credits_source": {"table_year": table_year, "matched": matched} if multi else None,
            "required_credits": sum(c["credits"] for c in courses if c["type"] == "전공필수"),
            "courses": sorted(courses, key=lambda c: (c["grade"] or 9, c["code"])),
        })
    return programs


def main(years):
    s = session()
    types = course_types(s)
    credit_tables = parse_multi_major_credits()
    out_dir = ROOT / "programs"
    out_dir.mkdir(parents=True, exist_ok=True)
    for year in years:
        rows, names = fetch_all(s, year)
        programs = build(year, rows, names, types, credit_tables)
        doc = {
            "entry_year": year,
            "source": BASE + "stddm/edu.knu (전체 학과)",
            "credits_source": "data/sources/knu_2026_major_credits.txt (다전공 시 이수학점)",
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "programs": programs,
        }
        (out_dir / f"{year}.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")),
                                              encoding="utf-8")
        missing = [p["name"] for p in programs if p["kind"] in ("major", "linked") and not p["multi_major_credits"]]
        found = {norm(p["name"]) for p in programs if p["kind"] == "convergence"}
        absent = [p["name"] for k, p in official_convergence().items() if k not in found]
        if absent:
            print(f"  {year}학번 교육과정에 아직 없는 공식 융합전공: {absent}")
        print(f"{year}학번: 학과·전공 {sum(p['kind'] == 'major' for p in programs)}개, "
              f"융합전공 {sum(p['kind'] == 'convergence' for p in programs)}개"
              f"(공고에 없는 것 {sum(p['kind'] == 'convergence_unlisted' for p in programs)}개), "
              f"연계전공 {sum(p['kind'] == 'linked' for p in programs)}개, "
              f"다전공 학점 못 찾음 {len(missing)}개: {missing}")


if __name__ == "__main__":
    main([int(y) for y in sys.argv[1:]] or list(range(2023, 2028)))

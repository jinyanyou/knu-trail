"""졸업 로드맵 — 남은 졸업요건을 채우는 학기별 수강 계획을 규칙으로 짠다.

1) 졸업요건을 계산해 아직 부족한(unmet) 요건을 고른다 (전공필수 → 다전공 필수 → 학점·영역 요건 순)
2) 그 요건을 채울 과목을 하나 고른다 (빠진 필수 과목, 들을 수 있는 선택 과목, 그 영역 교양…)
3) 권장 학년·개설 학기·학기당 학점 한도에 맞춰 학기에 배치하고 '수강 예정'으로 넣은 뒤 1)로
모든 과목은 엔진(evaluate)으로 다시 계산해 넣으므로, 끝났을 때 '이 계획대로면 졸업요건 충족'이 검증된다.
"""
import re
from datetime import date

from engine import catalog
from engine.graduation import MET, MET_WITH_PLANNED, UNMET, evaluate

REGULAR = ("1학기", "2학기")
MAX_EXTRA_TERMS = 4      # 8학기 안에 다 못 넣으면 이만큼까지 학기를 늘려 본다
MAX_STEPS = 120
FREE = "ROADMAP-FREE"
MAX_ALTERNATIVES = 8    # 들을 과목을 특정할 수 없는 학점(자유 선택)


def first_term(today=None):
    """지금 수강신청을 앞둔 학기 — 1~2월은 그해 1학기, 3~8월은 그해 2학기, 9~12월은 다음 해 1학기."""
    today = today or date.today()
    if today.month <= 2:
        return today.year, "1학기"
    if today.month <= 8:
        return today.year, "2학기"
    return today.year + 1, "1학기"


def _terms(start, entry_year):
    """start부터 4학년 2학기까지의 정규 학기. 이미 지났으면 두 학기."""
    year, sem = start
    end = (entry_year + 3, 1)
    out = []
    while (year, REGULAR.index(sem)) <= end or len(out) < 2:
        out.append((year, sem))
        year, sem = (year, "2학기") if sem == "1학기" else (year + 1, "1학기")
    return out


def _next(term):
    year, sem = term
    return (year, "2학기") if sem == "1학기" else (year + 1, "1학기")


def _grade_of(term, entry_year):
    return term[0] - entry_year + 1


def _recommended(text):
    """'2학년 1학기' / '3학년' → (학년, 학기 또는 None)."""
    m = re.match(r"\s*(\d)학년\s*(\d학기)?", text or "")
    return (int(m.group(1)), m.group(2)) if m else (None, None)


class _Planner:
    def __init__(self, entry_year, taken, profile, start, max_credits, exclude=()):
        self.entry_year, self.profile, self.max_credits = entry_year, profile or {}, max_credits
        self.taken = list(taken)
        self.terms = _terms(start, entry_year)
        self.load = {t: 0 for t in self.terms}
        for t in self.taken:  # 이미 넣어 둔 수강 예정 학점
            key = (t.get("year"), t.get("semester"))
            if not t.get("grade") and key in self.load:
                self.load[key] += t.get("credits") or 3
        self.added = []
        self.extra = 0
        self.exclude = set(exclude)  # 학생이 로드맵에서 뺀 과목 — 다시 추천하지 않는다
        self.standard = {p["code"]: p for p in catalog.curriculum(entry_year)["standard_plan"]}

    # ── 배치 ──
    def _fits(self, term, credits, offered):
        return (self.load[term] + credits <= self.max_credits
                and (not offered or offered not in REGULAR or offered == term[1]))

    def place(self, credits, grade=None, offered=None):
        """권장 학년이 있으면 그 학년 이후 가장 이른 학기, 없으면 가장 덜 찬 학기."""
        regular = len(self.terms) - self.extra  # 늘린 학기는 다른 데 자리가 없을 때만

        def pick(cands):
            if not cands:
                return None
            if grade:
                later = [t for t in cands if _grade_of(t, self.entry_year) >= grade]
                return min(later or cands, key=lambda t: (self.terms.index(t) >= regular, self.terms.index(t)))
            return min(cands, key=lambda t: (self.terms.index(t) >= regular, self.load[t], self.terms.index(t)))

        term = pick([t for t in self.terms if self._fits(t, credits, offered)]) or self._make_room(credits, offered)
        while term is None and self.extra < MAX_EXTRA_TERMS:  # 그래도 자리가 없으면 학기를 늘린다
            new = _next(self.terms[-1])
            self.terms.append(new)
            self.load[new] = 0
            self.extra += 1
            term = pick([t for t in self.terms if self._fits(t, credits, offered)])
        return term

    def _make_room(self, credits, offered):
        """개설 학기가 정해진 과목 자리를 위해, 아무 학기나 되는 계획 과목들을 다른 정규 학기로 옮긴다."""
        regular = self.terms[:len(self.terms) - self.extra]
        for term in regular:
            if offered in REGULAR and term[1] != offered:
                continue
            movable = sorted((a for a in self.added if (a["year"], a["semester"]) == term and a["flexible"]),
                             key=lambda a: -a["credits"])
            if self.load[term] - sum(a["credits"] for a in movable) + credits > self.max_credits:
                continue
            for item in movable:
                if self.load[term] + credits <= self.max_credits:
                    break
                dest = min((t for t in regular if t != term and self.load[t] + item["credits"] <= self.max_credits),
                           key=lambda t: self.load[t], default=None)
                if dest:
                    self._move(item, dest)
            if self.load[term] + credits <= self.max_credits:
                return term
        return None

    def _move(self, item, dest):
        src = (item["year"], item["semester"])
        self.load[src] -= item["credits"]
        self.load[dest] += item["credits"]
        for row in (item, next(t for t in self.taken if t is item["_taken"])):
            row["year"], row["semester"] = dest

    def add(self, course, reason, term, counts_for=None, flexible=False, alternatives=(), **extra):
        item = {"code": course["code"], "name": course["name"], "credits": course["credits"],
                "year": term[0], "semester": term[1], "grade": None, **extra}
        if counts_for:
            item["counts_for"] = counts_for
        self.taken.append(item)
        self.load[term] += course["credits"]
        self.added.append({**item, "reason": reason, "alternatives": list(alternatives),
                           "flexible": flexible, "_taken": item})

    # ── 후보 ──
    def have(self):
        return {t["code"] for t in self.taken} | {(t.get("name") or "").replace(" ", "") for t in self.taken}

    def fresh(self, courses):
        have = self.have() | self.exclude
        return [c for c in courses if c.get("code") and c["code"] not in have
                and c["name"].replace(" ", "") not in have]

    def liberal(self, pick, prefer_sdg):
        """그 영역 교양 과목 — 표준 이수 모형에 있는 과목 → SDG(필요할 때) → 이름 순."""
        year = max(self.terms[0][0], min(catalog._available("liberal_arts")))
        pool = [c for c in catalog.liberal_arts(year)[1].values()
                if (not pick.get("area") or (c["area"] == pick["area"] and c["sub_area"] in pick["sub_areas"]))
                and (not pick.get("sdg") or c["sdg"])]
        pool = self.fresh(pool)
        return sorted(pool, key=lambda c: (c["code"] not in self.standard, not (prefer_sdg and c["sdg"]), c["name"]))

    def candidates(self, req, report):
        """요건 하나를 채울 후보 [(과목, 권장 학년, 개설 학기, 배정 전공)] — 앞의 것이 추천, 나머지는 바꿔 들을 수 있는 과목."""
        rid = req["id"]
        program = rid.split(":")[1] if rid.startswith("program:") else None
        if req.get("missing"):  # 빠진 필수 과목 — 다른 과목으로 대신할 수 없으니 하나만
            m = self.fresh(req["missing"])
            if m:
                c = m[0]
                grade, sem = _recommended(c.get("recommended"))
                std = self.standard.get(c["code"]) or {}
                return [(c, grade or std.get("grade"), sem or std.get("semester"), program)]
        if req.get("options"):
            o = sorted(self.fresh(req["options"]), key=lambda c: (c["code"] not in self.standard, c.get("grade") or 9, c["name"]))
            if o:
                return [(c, c.get("grade"), c.get("semester"), program) for c in o]
        pick = req.get("pick") or {}
        sdg_needed = any(r["id"] == "sdg" and r["status"] == UNMET for r in report["requirements"])
        if "교양" in pick.get("categories", []) or pick.get("area"):
            lib = self.liberal(pick, sdg_needed)
            if lib:
                return [(c, (self.standard.get(c["code"]) or {}).get("grade"),
                         (self.standard.get(c["code"]) or {}).get("semester"), None) for c in lib]
        if rid == "total":
            major = next((r for r in report["requirements"] if r["id"] == "major"), None)
            o = self.fresh((major or {}).get("options") or [])
            if o:  # 남는 학점은 전공 선택 과목으로 채우는 게 이득
                return [(c, c.get("grade"), c.get("semester"), None) for c in o]
            n = sum(1 for t in self.taken if str(t["code"]).startswith(FREE))
            return [({"code": f"{FREE}-{n + 1}", "name": "자유 선택 (교양·일반선택 아무 과목)", "credits": 3},
                     None, None, None)]
        return []


def _order(req):
    rid = req["id"]
    if rid == "major_required" or rid.endswith(":required"):
        return 0
    if rid == "total":
        return 3
    return 1 if (req.get("pick") or {}).get("area") or rid in ("sdg",) else 2


def plan(entry_year, taken, profile=None, start=None, max_credits=18, exclude=()):
    """→ {terms: [{year, semester, grade, credits, courses}], verified, unmet, report_after, ...}"""
    start = start or first_term()
    p = _Planner(entry_year, taken, profile, start, max_credits, exclude)
    skipped = set()
    report = evaluate(entry_year, p.taken, p.profile)
    for _ in range(MAX_STEPS):
        todo = sorted((r for r in report["requirements"] if r["status"] == UNMET and r["id"] not in skipped
                       and r.get("required") is not None), key=_order)
        if not todo:
            break
        req = todo[0]
        cands = p.candidates(req, report)
        term = cands and p.place(cands[0][0]["credits"], cands[0][1], cands[0][2])
        if not term:
            skipped.add(req["id"])
            continue
        course, _, offered, program = cands[0]
        extra = {"category": "일반선택", "name": course["name"]} if course["code"].startswith(FREE) else {}
        # 같은 요건을 채우는 다른 과목 (로드맵 화면에서 바꿔 고를 수 있게)
        extra["alternatives"] = [{"code": c["code"], "name": c["name"], "credits": c["credits"]}
                                 for c, *_ in cands[1:MAX_ALTERNATIVES + 1]]
        p.add(course, req["label"], term, program, flexible=offered not in REGULAR, **extra)
        report = evaluate(entry_year, p.taken, p.profile)

    by_term = {t: [] for t in p.terms}
    for a in p.added:
        by_term[(a["year"], a["semester"])].append({k: v for k, v in a.items() if k not in ("_taken", "flexible")})
    existing = {t: [x for x in taken if (x.get("year"), x.get("semester")) == t and not x.get("grade")] for t in p.terms}
    unmet = [r["label"] for r in report["requirements"] if r["status"] == UNMET]
    terms = [{"year": t[0], "semester": t[1], "grade": _grade_of(t, entry_year),
              "credits": p.load[t], "planned_before": len(existing[t]), "courses": by_term[t]}
             for t in p.terms if by_term[t] or existing[t]]
    return {
        "entry_year": entry_year, "start": {"year": start[0], "semester": start[1]}, "max_credits": max_credits,
        "terms": terms,
        "added_credits": sum(a["credits"] for a in p.added),
        "extra_terms": p.extra,
        "verified": not unmet,
        "unmet": unmet,
        "manual": [r["label"] for r in report["requirements"] if r["status"] in ("manual", "unknown")],
        "summary_after": report["summary"],
    }

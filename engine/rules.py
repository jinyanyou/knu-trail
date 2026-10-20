"""졸업요건 규칙 로더. data/rules/graduation.json 의 extends/overrides 를 풀어 학번별 최종 규칙을 만든다."""
import copy
import json
from functools import lru_cache

from engine.catalog import DATA

RULES_PATH = DATA / "rules" / "graduation.json"


@lru_cache(maxsize=None)
def load_rules_doc():
    return json.loads(RULES_PATH.read_text(encoding="utf-8"))


def _set_path(obj, dotted, value):
    *parents, last = dotted.split(".")
    for key in parents:
        obj = obj[key]
    if last not in obj:
        raise KeyError(f"override 경로가 부모 규칙에 없음: {dotted}")
    obj[last] = value


def _resolve(rulesets, rid):
    rs = rulesets[rid]
    if "extends" not in rs:
        base = copy.deepcopy(rs)
        base.setdefault("notes", [])
        return base
    merged = _resolve(rulesets, rs["extends"])
    for path, value in rs.get("overrides", {}).items():
        _set_path(merged, path, value)
    for key in ("id", "entry_years", "status"):
        merged[key] = rs[key]
    merged["notes"] = merged["notes"] + rs.get("notes", [])
    return merged


def supported_entry_years():
    return [y for rs in load_rules_doc()["rulesets"] for y in range(rs["entry_years"][0], rs["entry_years"][1] + 1)]


def load_ruleset(entry_year):
    doc = load_rules_doc()
    by_id = {rs["id"]: rs for rs in doc["rulesets"]}
    for rs in doc["rulesets"]:
        lo, hi = rs["entry_years"]
        if lo <= entry_year <= hi:
            return _resolve(by_id, rs["id"])
    raise ValueError(f"{entry_year}학번 규칙 없음 (지원: {supported_entry_years()})")

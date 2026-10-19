"""Offline readiness audit for the existing TTALKAK RAG graduation evaluation.

Read the AI teammate's datasets/results without changing them, importing models,
making provider requests, or printing user prompts and generated responses.
Not a quality score or a substitute for human review.
"""
import argparse
import csv
import json
from pathlib import Path


def read_json(path):
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def read_sheet(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))
    expected = ("문항", "질문번호", "답(예/아니오/해당없음)")
    if not rows or any(name not in rows[0] for name in expected):
        raise ValueError("invalid human-review sheet structure")
    keys = []
    answered = 0
    invalid = 0
    for row in rows:
        key = (row["문항"].strip(), row["질문번호"].strip())
        keys.append(key)
        answer = row["답(예/아니오/해당없음)"].strip()
        if answer:
            if answer in ("예", "아니오", "해당없음"):
                answered += 1
            else:
                invalid += 1
    if len(keys) != len(set(keys)):
        raise ValueError("duplicate human-review question IDs")
    return {"questions": len(keys), "answered": answered, "invalid": invalid, "keys": keys}


def audit(root):
    base = root / "rag-server" / "eval"
    uplift = read_json(base / "uplift_set_v2.json")
    items = uplift["items"]
    if not items or any(not isinstance(x, dict) or not x.get("id") or x.get("track") not in ("A", "B") for x in items):
        raise ValueError("invalid uplift item fields")
    ids = [x["id"] for x in items]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate uplift item IDs")
    by_track = {name: sum(x["track"] == name for x in items) for name in ("A", "B")}

    multi = read_json(base / "multi_turn_set.json")["items"]
    multi_ids = [x["id"] for x in multi]
    if not multi_ids or len(multi_ids) != len(set(multi_ids)):
        raise ValueError("missing or duplicate multi-turn IDs")

    sheet_a = read_sheet(base / "human_review" / "sheet_A.csv")
    sheet_b = read_sheet(base / "human_review" / "sheet_B.csv")
    aligned = sheet_a["keys"] == sheet_b["keys"]
    if not aligned:
        raise ValueError("human-review A/B question keys differ")
    invalid = sheet_a["invalid"] + sheet_b["invalid"]
    if invalid:
        raise ValueError("unexpected human-review answers")

    old = read_json(base / "results" / "uplift_trackA_20260922.json")
    records = old.get("records", {})
    if not isinstance(records, dict):
        raise ValueError("invalid historical evaluation record format")
    record_ids = {rec.get("item") for rec in records.values() if isinstance(rec, dict)}
    record_conditions = {
        key: {v.get("condition") for v in records.values()
              if isinstance(v, dict) and v.get("item") == key}
        for key in record_ids
    }
    a_ids = {x["id"] for x in items if x["track"] == "A"}
    if not record_ids.issubset(a_ids):
        raise ValueError("historical track-A results contain unknown/non-A item IDs")
    paired = sum({"raw", "ttalkak"}.issubset(conds) for conds in record_conditions.values())
    all_reviewed = (sheet_a["answered"] == sheet_a["questions"]
                    and sheet_b["answered"] == sheet_b["questions"])

    return {
        "dataset": {"uplift_total": len(ids), "track_A": by_track["A"],
                    "track_B": by_track["B"], "multi_turn_total": len(multi_ids)},
        "human_review": {"questions": sheet_a["questions"], "sheet_A_answered": sheet_a["answered"],
                         "sheet_B_answered": sheet_b["answered"],
                         "aligned": aligned, "agreement_ready": all_reviewed},
        "historical_track_A": {"unique_items_with_records": len(record_ids),
                                "paired_raw_ttalkak_items": paired,
                                "target_items": by_track["A"],
                                "complete_coverage": paired == by_track["A"]},
        "note": ("An offline audit, not evidence of score improvement. Human agreement "
                 "and provider-backed evaluation require separate review."),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        report = audit(args.root)
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
        # Do not print file content or exception text (which might contain user data).
        print(json.dumps({"status": "FAIL", "errorType": type(error).__name__}))
        return 1
    print(json.dumps({"status": "PASS", **report}, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

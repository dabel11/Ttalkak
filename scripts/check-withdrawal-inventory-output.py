"""Validate only approved aggregate metrics from withdrawal-retention SQL.

Input: TSV from a SELECT-only aggregate query. No member IDs, tokens, emails,
personal content, order keys or full rows may be accepted or printed.
"""
import argparse
import json
import sys

EXPECTED = (
    "inactive_members",
    "inactive_google_subject_still_set",
    "inactive_member_user_id_reserved",
    "inactive_private_make_threads",
    "inactive_private_make_folders",
    "inactive_community_prompts",
    "inactive_community_comments",
    "inactive_saved_links",
    "inactive_liked_links",
    "inactive_report_references",
    "inactive_billing_subscriptions",
    "inactive_auto_renew_enabled",
    "inactive_billing_keys_stored",
    "inactive_billing_charge_records",
    "inactive_pending_charges",
    "inactive_member_token_usage",
)
ACTION_REQUIRED = (
    "inactive_private_make_threads",
    "inactive_private_make_folders",
    "inactive_auto_renew_enabled",
    "inactive_billing_keys_stored",
    "inactive_pending_charges",
)


def parse_aggregate_rows(raw: str) -> dict[str, int]:
    counts = {}
    for row in raw.splitlines():
        fields = row.rstrip("\r").split("\t")
        if len(fields) != 2:
            raise ValueError("unexpected result shape")
        metric, number = fields
        if metric not in EXPECTED or metric in counts:
            raise ValueError("unexpected or duplicate metric")
        if not number.isascii() or not number.isdecimal():
            raise ValueError("non-integer aggregate count")
        counts[metric] = int(number)
    if set(counts) != set(EXPECTED):
        raise ValueError("missing required aggregate metric")
    return counts


def classify(counts: dict[str, int]) -> dict:
    followup = {name: counts[name] for name in ACTION_REQUIRED if counts[name] > 0}
    return {
        "status": "REVIEW_REQUIRED" if followup else "PASS",
        "metricsChecked": len(EXPECTED),
        "reviewCounts": followup,
        "note": "Aggregates only. Does not authorize deletes, payment retries or refunds.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ci-zero-risk", action="store_true",
                        help="CI-only: fail on any withdrawn-member risk count")
    args = parser.parse_args()
    try:
        counts = parse_aggregate_rows(sys.stdin.read())
        output = classify(counts)
    except (ValueError, TypeError, OverflowError) as exc:
        # Never echo unexpected input or DB output, which might contain secrets.
        print(json.dumps({"status": "FAIL", "errorType": type(exc).__name__}))
        return 1
    print(json.dumps(output, sort_keys=True))
    return 1 if args.ci_zero_risk and output["status"] != "PASS" else 0


if __name__ == "__main__":
    raise SystemExit(main())

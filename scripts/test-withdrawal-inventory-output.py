"""Offline tests for privacy-preserving withdrawal aggregate output."""
import contextlib
import importlib.util
import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

path = Path(__file__).with_name("check-withdrawal-inventory-output.py")
spec = importlib.util.spec_from_file_location("withdrawal_audit", path)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def result_rows(override=None):
    values = {name: 0 for name in audit.EXPECTED}
    values.update(override or {})
    return "\n".join(f"{name}\t{value}" for name, value in values.items()) + "\n"


class WithdrawalAggregateOutputTest(unittest.TestCase):
    def test_accepts_complete_nonidentifying_aggregate(self):
        counts = audit.parse_aggregate_rows(result_rows())
        self.assertEqual(len(audit.EXPECTED), len(counts))
        self.assertEqual("PASS", audit.classify(counts)["status"])

    def test_existing_withdrawn_data_requires_manual_review(self):
        counts = audit.parse_aggregate_rows(result_rows({
            "inactive_members": 3,
            "inactive_private_make_threads": 1,
            "inactive_pending_charges": 2,
        }))
        report = audit.classify(counts)
        self.assertEqual("REVIEW_REQUIRED", report["status"])
        self.assertEqual({"inactive_private_make_threads": 1, "inactive_pending_charges": 2},
                         report["reviewCounts"])
        self.assertNotIn("member_id", str(report))

    def test_retained_billing_key_triggers_manual_revocation_review(self):
        counts = audit.parse_aggregate_rows(result_rows({
            "inactive_billing_keys_stored": 2,
        }))
        report = audit.classify(counts)
        self.assertEqual("REVIEW_REQUIRED", report["status"])
        self.assertEqual({"inactive_billing_keys_stored": 2}, report["reviewCounts"])

    def test_retained_history_alone_is_not_automatic_delete(self):
        counts = audit.parse_aggregate_rows(result_rows({
            "inactive_member_user_id_reserved": 2,
            "inactive_billing_charge_records": 1,
            "inactive_community_comments": 5,
        }))
        self.assertEqual("PASS", audit.classify(counts)["status"])

    def test_rejects_member_identifiers_and_leaked_content(self):
        for payload in (
            result_rows() + "member_id\t7\n",
            result_rows() + "email\tperson@example.test\n",
            "inactive_members\t7\tuser@example.test\n",
            "PRIVATE_PERSONAL_MESSAGE",
        ):
            with self.subTest(payload=payload[:12]), self.assertRaises(ValueError):
                audit.parse_aggregate_rows(payload)

    def test_rejects_missing_duplicate_or_nonnumeric_counts(self):
        for payload in (
            result_rows().replace("inactive_pending_charges\t0\n", ""),
            result_rows() + "inactive_members\t9\n",
            result_rows().replace("inactive_members\t0", "inactive_members\t-1"),
            result_rows().replace("inactive_members\t0", "inactive_members\tNaN"),
            result_rows().replace("inactive_members\t0", "inactive_members\t1.5"),
        ):
            with self.subTest(payload=payload[:12]), self.assertRaises(ValueError):
                audit.parse_aggregate_rows(payload)

    def test_cli_prints_no_rejected_raw_input(self):
        secret = "REJECTED_PRIVATE_ORDER_KEY"
        with patch.object(sys, "stdin", io.StringIO(result_rows() + secret + "\n")), \
             patch.object(sys, "argv", ["audit"]), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(1, audit.main())
        self.assertNotIn(secret, output.getvalue())
        self.assertIn('"status": "FAIL"', output.getvalue())

    def test_ci_zero_risk_fails_nonzero_sensitive_metrics(self):
        with patch.object(sys, "stdin", io.StringIO(result_rows({
                 "inactive_auto_renew_enabled": 1,
             }))), patch.object(sys, "argv", ["audit", "--ci-zero-risk"]), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(1, audit.main())
        self.assertIn('"status": "REVIEW_REQUIRED"', output.getvalue())


if __name__ == "__main__":
    unittest.main()

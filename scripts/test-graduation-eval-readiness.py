"""No-key unit tests for the offline graduation evaluation audit."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


script_path = Path(__file__).with_name("check-graduation-eval-readiness.py")
spec = importlib.util.spec_from_file_location("graduation_eval_readiness", script_path)
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


class EvalReadinessTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.base = self.root / "rag-server" / "eval"
        (self.base / "human_review").mkdir(parents=True)
        (self.base / "results").mkdir()
        self.write_json("uplift_set_v2.json", {"items": [
            {"id": "up_01", "track": "A", "query": "PRIVATE USER CONTENT"},
            {"id": "up_02", "track": "A", "query": "ANOTHER PRIVATE REQUEST"},
            {"id": "up_46", "track": "B", "query": "PRIVATE CONTEXT"},
        ]})
        self.write_json("multi_turn_set.json", {"items": [{"id": "test_multiturn"}]})
        self.write_json("results/uplift_trackA_20260922.json", {"records": {
            "up_01|raw|0": {"item": "up_01", "condition": "raw", "output": "PRIVATE OUTPUT"},
            "up_01|ttalkak|0": {"item": "up_01", "condition": "ttalkak", "output": "PRIVATE OUTPUT"},
        }})
        self.sheet = ("문항,질문번호,답(예/아니오/해당없음),메모\n"
                      "up_01,r1,,\nup_02,r2,,\n")
        for who in ("A", "B"):
            (self.base / "human_review" / ("sheet_" + who + ".csv")).write_text(
                self.sheet, encoding="utf-8-sig")

    def write_json(self, relative, data):
        (self.base / relative).write_text(json.dumps(data), encoding="utf-8")

    def test_reports_incomplete_human_review_without_claiming_quality(self):
        result = checks.audit(self.root)
        self.assertEqual({"uplift_total": 3, "track_A": 2,
                          "track_B": 1, "multi_turn_total": 1}, result["dataset"])
        self.assertEqual(2, result["human_review"]["questions"])
        self.assertFalse(result["human_review"]["agreement_ready"])
        self.assertEqual(1, result["historical_track_A"]["paired_raw_ttalkak_items"])
        self.assertFalse(result["historical_track_A"]["complete_coverage"])
        self.assertNotIn("PRIVATE", json.dumps(result))

    def test_ready_only_when_two_independent_sheets_are_complete(self):
        filled = self.sheet.replace("r1,,", "r1,예,").replace("r2,,", "r2,아니오,")
        for who in ("A", "B"):
            (self.base / "human_review" / ("sheet_" + who + ".csv")).write_text(
                filled, encoding="utf-8-sig")
        self.assertTrue(checks.audit(self.root)["human_review"]["agreement_ready"])

    def test_mismatched_sheets_fail(self):
        (self.base / "human_review" / "sheet_B.csv").write_text(
            self.sheet.replace("up_02,r2", "up_02,r3"), encoding="utf-8-sig")
        with self.assertRaisesRegex(ValueError, "keys differ"):
            checks.audit(self.root)

    def test_duplicate_uplift_ids_fail(self):
        self.write_json("uplift_set_v2.json", {"items": [
            {"id": "up_01", "track": "A"}, {"id": "up_01", "track": "B"}
        ]})
        with self.assertRaisesRegex(ValueError, "duplicate uplift"):
            checks.audit(self.root)

    def test_history_with_unknown_item_fails(self):
        self.write_json("results/uplift_trackA_20260922.json", {"records": {
            "up_99|raw|0": {"item": "up_99", "condition": "raw"},
        }})
        with self.assertRaisesRegex(ValueError, "unknown/non-A"):
            checks.audit(self.root)

    def test_invalid_review_label_fails(self):
        (self.base / "human_review" / "sheet_A.csv").write_text(
            self.sheet.replace("r1,,", "r1,확인불가,"), encoding="utf-8-sig")
        with self.assertRaisesRegex(ValueError, "unexpected"):
            checks.audit(self.root)


if __name__ == "__main__":
    unittest.main()

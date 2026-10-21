import json
import tempfile
import unittest
from pathlib import Path
import importlib.util

spec = importlib.util.spec_from_file_location(
    "schema_compare", Path(__file__).with_name("compare-schema-snapshots.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SchemaSnapshotTests(unittest.TestCase):
    def snapshot(self, obj):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'metadata.json'
            path.write_text(json.dumps(obj))
            return module.load(path)

    def empty(self):
        sample = {kind: [] for kind in module.KINDS}
        sample['columns'] = [{'table':'members','name':'id','type':'bigint','nullable':False}]
        return sample

    def test_equal(self):
        a = self.snapshot(self.empty())
        self.assertEqual([], module.compare(a, a))

    def test_changed_type_detected(self):
        a, b = self.empty(), self.empty()
        a['columns'] = [{'table':'members', 'name':'id', 'type':'bigint', 'nullable':False}]
        b['columns'] = [{'table':'members', 'name':'id', 'type':'int', 'nullable':False}]
        self.assertEqual('changed', module.compare(self.snapshot(a), self.snapshot(b))[0]['status'])

    def test_missing_index_detected(self):
        a, b = self.empty(), self.empty()
        a['indexes'] = [{'table':'members','name':'PRIMARY','position':1,'column':'id','unique':True}]
        self.assertEqual('missing', module.compare(self.snapshot(a), self.snapshot(b))[0]['status'])

    def test_duplicate_rejected(self):
        a = self.empty()
        row = {'table':'members', 'name':'id', 'type':'bigint', 'nullable':False}
        a['columns'] = [row, row]
        with self.assertRaises(ValueError):
            self.snapshot(a)

    def test_unexpected_fields_rejected(self):
        a = self.empty()
        a['columns'] = [{'table':'members','name':'id','type':'bigint','nullable':False,'private_text':'secret'}]
        with self.assertRaises(ValueError):
            self.snapshot(a)

    def test_empty_schema_rejected(self):
        with self.assertRaises(ValueError):
            self.snapshot({kind: [] for kind in module.KINDS})

    def test_boolean_string_rejected(self):
        a = self.empty()
        a['columns'][0]['nullable'] = 'false'
        with self.assertRaises(ValueError):
            self.snapshot(a)

    def test_nonpositive_index_position_rejected(self):
        a = self.empty()
        a['indexes'] = [{'table':'members','name':'PRIMARY','position':0,'column':'id','unique':True}]
        with self.assertRaises(ValueError):
            self.snapshot(a)

    def test_missing_foreign_key_detected(self):
        a, b = self.empty(), self.empty()
        a['foreign_keys'] = [{'table':'comments','name':'fk_comment_member','column':'member_id','referenced_table':'members','referenced_column':'id'}]
        result = module.compare(self.snapshot(a), self.snapshot(b))
        self.assertEqual('foreign_keys', result[0]['section'])
        self.assertEqual('missing', result[0]['status'])


if __name__ == '__main__':
    unittest.main()

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
        sample['tables'] = [{'name':'members','engine':'InnoDB'}]
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
        a['tables'].append({'name':'comments','engine':'InnoDB'})
        b['tables'].append({'name':'comments','engine':'InnoDB'})
        for snap in (a, b):
            snap['columns'].append({'table':'comments','name':'member_id','type':'bigint','nullable':False})
        a['foreign_keys'] = [{'table':'comments','name':'fk_comment_member','position':1,'column':'member_id','referenced_table':'members','referenced_column':'id'}]
        result = module.compare(self.snapshot(a), self.snapshot(b))
        self.assertEqual('foreign_keys', result[0]['section'])
        self.assertEqual('missing', result[0]['status'])

    def test_missing_empty_table_detected(self):
        a, b = self.empty(), self.empty()
        a['tables'].append({'name':'empty_audit','engine':'InnoDB'})
        diff = module.compare(self.snapshot(a), self.snapshot(b))
        self.assertEqual('tables', diff[0]['section'])
        self.assertEqual('missing', diff[0]['status'])

    def test_column_unknown_table_rejected(self):
        a = self.empty()
        a['columns'].append({'table':'not_listed','name':'id','type':'bigint','nullable':False})
        with self.assertRaises(ValueError):
            self.snapshot(a)

    def test_composite_foreign_key_order_changed(self):
        a, b = self.empty(), self.empty()
        for snap in (a, b):
            snap['tables'].append({'name':'comments','engine':'InnoDB'})
            snap['columns'] += [
                {'table':'comments','name':'left_id','type':'bigint','nullable':False},
                {'table':'comments','name':'right_id','type':'bigint','nullable':False},
                {'table':'members','name':'other_id','type':'bigint','nullable':False},
            ]
        a['foreign_keys'] = [
            {'table':'comments','name':'fk_pair','position':1,'column':'left_id','referenced_table':'members','referenced_column':'id'},
            {'table':'comments','name':'fk_pair','position':2,'column':'right_id','referenced_table':'members','referenced_column':'other_id'},
        ]
        b['foreign_keys'] = [
            dict(a['foreign_keys'][1], position=1),
            dict(a['foreign_keys'][0], position=2),
        ]
        changes = module.compare(self.snapshot(a), self.snapshot(b))
        self.assertEqual(2, len(changes))
        self.assertTrue(all(row['status'] == 'changed' for row in changes))

    def test_missing_target_table_rejected(self):
        a = self.empty()
        a['foreign_keys'] = [{'table':'members','name':'fk_missing','position':1,'column':'id',
                              'referenced_table':'missing','referenced_column':'id'}]
        with self.assertRaises(ValueError):
            self.snapshot(a)

    def test_missing_local_and_target_columns_rejected(self):
        for invalid in ('column','referenced_column'):
            a = self.empty()
            a['foreign_keys'] = [{'table':'members','name':'fk_bad','position':1,'column':'id',
                                  'referenced_table':'members','referenced_column':'id'}]
            a['foreign_keys'][0][invalid] = 'absent'
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                self.snapshot(a)

    def test_index_missing_column_rejected(self):
        a = self.empty()
        a['indexes'] = [{'table':'members','name':'idx_bad','position':1,
                         'column':'absent','unique':False}]
        with self.assertRaises(ValueError):
            self.snapshot(a)

    def test_duplicate_json_property_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'duplicate.json'
            path.write_text('{"tables":[],"tables":[],"columns":[],"indexes":[],"constraints":[],"foreign_keys":[]}')
            with self.assertRaises(ValueError):
                module.load(path)

    def test_sparse_index_positions_rejected(self):
        a = self.empty()
        a['indexes'] = [
            {'table':'members','name':'idx_pair','position':1,'column':'id','unique':False},
            {'table':'members','name':'idx_pair','position':3,'column':'id','unique':False},
        ]
        with self.assertRaisesRegex(ValueError, 'contiguous'):
            self.snapshot(a)

    def test_sparse_composite_fk_positions_rejected(self):
        a = self.empty()
        a['foreign_keys'] = [
            {'table':'members','name':'fk_pair','position':1,'column':'id','referenced_table':'members','referenced_column':'id'},
            {'table':'members','name':'fk_pair','position':3,'column':'id','referenced_table':'members','referenced_column':'id'},
        ]
        with self.assertRaisesRegex(ValueError, 'contiguous'):
            self.snapshot(a)

    def test_out_of_order_but_complete_positions_accepted(self):
        a = self.empty()
        a['indexes'] = [
            {'table':'members','name':'idx_pair','position':2,'column':'id','unique':False},
            {'table':'members','name':'idx_pair','position':1,'column':'id','unique':False},
        ]
        self.assertEqual([], module.compare(self.snapshot(a), self.snapshot(a)))


if __name__ == '__main__':
    unittest.main()

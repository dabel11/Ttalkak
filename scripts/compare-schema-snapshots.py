#!/usr/bin/env python3
"""Compare two sanitized MySQL metadata snapshots offline; never connects to a DB."""
import argparse
import json
from pathlib import Path

KINDS = ('tables', 'columns', 'indexes', 'constraints', 'foreign_keys')
FIELDS = {
    'tables': ('name', 'engine'),
    'columns': ('table', 'name', 'type', 'nullable'),
    'indexes': ('table', 'name', 'position', 'column', 'unique'),
    'constraints': ('table', 'name', 'type'),
    'foreign_keys': ('table', 'name', 'position', 'column', 'referenced_table', 'referenced_column'),
}
KEYS = {
    'tables': ('name',),
    'columns': ('table', 'name'),
    'indexes': ('table', 'name', 'position'),
    'constraints': ('table', 'name'),
    'foreign_keys': ('table', 'name', 'position'),
}
MAX_BYTES = 2_000_000


def reject_duplicate_properties(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON property')
        result[key] = value
    return result


def load(path):
    p = Path(path)
    if p.stat().st_size > MAX_BYTES:
        raise ValueError('snapshot exceeds size limit')
    obj = json.loads(p.read_text(encoding='utf-8'), object_pairs_hook=reject_duplicate_properties)
    if not isinstance(obj, dict) or set(obj) != set(KINDS):
        raise ValueError('snapshot must have exactly the five metadata sections')
    if not obj['tables'] or not obj['columns']:
        raise ValueError('tables and columns must be nonempty')
    output = {}
    for kind in KINDS:
        rows = obj[kind]
        if not isinstance(rows, list) or len(rows) > 20000:
            raise ValueError(f'invalid {kind} list')
        indexed = {}
        for row in rows:
            if not isinstance(row, dict) or set(row) != set(FIELDS[kind]):
                raise ValueError(f'invalid {kind} row fields')
            for field, value in row.items():
                expected = bool if field in ('nullable', 'unique') else int if field == 'position' else str
                if type(value) is not expected:
                    raise ValueError(f'invalid {kind} field type')
                if isinstance(value, str) and (not value or len(value) > 255):
                    raise ValueError(f'invalid {kind} string value')
                if field == 'position' and value < 1:
                    raise ValueError('index position must be positive')
            key = tuple(row[k] for k in KEYS[kind])
            if key in indexed:
                raise ValueError(f'duplicate {kind} key')
            indexed[key] = row
        output[kind] = indexed
    known_tables = {row['name'] for row in output['tables'].values()}
    for kind in ('columns', 'indexes', 'constraints', 'foreign_keys'):
        if any(row['table'] not in known_tables for row in output[kind].values()):
            raise ValueError(f'{kind} references a table absent from snapshot')
    column_pairs = set(output['columns'])
    for row in output['indexes'].values():
        if (row['table'], row['column']) not in column_pairs:
            raise ValueError('index references a missing local column')
    for row in output['foreign_keys'].values():
        if (row['table'], row['column']) not in column_pairs:
            raise ValueError('foreign key references a missing local column')
        if row['referenced_table'] not in known_tables:
            raise ValueError('foreign key references a missing target table')
        if (row['referenced_table'], row['referenced_column']) not in column_pairs:
            raise ValueError('foreign key references a missing target column')
    return output


def compare(baseline, candidate):
    differences = []
    for kind in KINDS:
        before, after = baseline[kind], candidate[kind]
        for key in sorted(before.keys() | after.keys(), key=str):
            if key not in before:
                state = 'added'
            elif key not in after:
                state = 'missing'
            elif before[key] != after[key]:
                state = 'changed'
            else:
                continue
            differences.append({'section': kind, 'key': [str(x) for x in key], 'status': state})
    return differences


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline')
    parser.add_argument('candidate')
    args = parser.parse_args()
    try:
        differences = compare(load(args.baseline), load(args.candidate))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        parser.exit(2, f'INVALID_SNAPSHOT: {type(exc).__name__}\n')
    print(json.dumps({'result': 'DIFFERENCES' if differences else 'MATCH',
                      'difference_count': len(differences), 'differences': differences}, ensure_ascii=False))
    return 1 if differences else 0


if __name__ == '__main__':
    raise SystemExit(main())

#!/usr/bin/env python3
"""Compare two sanitized MySQL metadata snapshots offline; never connects to a DB."""
import argparse
import json
from pathlib import Path

KINDS = ('columns', 'indexes', 'constraints', 'foreign_keys')
FIELDS = {
    'columns': ('table', 'name', 'type', 'nullable'),
    'indexes': ('table', 'name', 'position', 'column', 'unique'),
    'constraints': ('table', 'name', 'type'),
    'foreign_keys': ('table', 'name', 'column', 'referenced_table', 'referenced_column'),
}
KEYS = {
    'columns': ('table', 'name'),
    'indexes': ('table', 'name', 'position'),
    'constraints': ('table', 'name'),
    'foreign_keys': ('table', 'name', 'column'),
}
MAX_BYTES = 2_000_000


def load(path):
    p = Path(path)
    if p.stat().st_size > MAX_BYTES:
        raise ValueError('snapshot exceeds size limit')
    obj = json.loads(p.read_text(encoding='utf-8'))
    if not isinstance(obj, dict) or set(obj) != set(KINDS):
        raise ValueError('snapshot must have exactly the four metadata sections')
    if not obj['columns']:
        raise ValueError('columns must be nonempty; empty schema is not a verified match')
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

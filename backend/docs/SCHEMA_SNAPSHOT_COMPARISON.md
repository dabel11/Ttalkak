# Offline MySQL schema snapshot comparator

The tool `scripts/compare-schema-snapshots.py` compares two **manually prepared, sanitized** JSON documents. It never opens a database connection or modifies the database.

## Input contract

Each UTF-8 JSON snapshot must be an object containing exactly four arrays: `columns`, `indexes`, `constraints`, and `foreign_keys`.

Each array contains objects with **exactly** the keys shown below (no extra keys). Names and type labels are nonempty strings (up to 255 characters), `position` is a positive integer, and `nullable`/`unique` are booleans.

```json
{
  "columns": [
    {"table": "members", "name": "id", "type": "bigint", "nullable": false}
  ],
  "indexes": [
    {"table": "members", "name": "PRIMARY", "position": 1, "column": "id", "unique": true}
  ],
  "constraints": [
    {"table": "members", "name": "PRIMARY", "type": "PRIMARY KEY"}
  ],
  "foreign_keys": []
}
```

The `columns` list must be nonempty; the other three lists may be empty. An empty database metadata export is not treated as a verified match. Incomplete snapshots can still lead to misleading differences. Capture the same scope in both snapshots.

The columns and index ordering, types, constraint names, nullability and referenced columns must use the same normalization rules in both files. Do not manually infer missing metadata.

## Comparison

```bash
python3 scripts/test-compare-schema-snapshots.py
python3 scripts/compare-schema-snapshots.py baseline.json candidate.json
```

Exit codes: `0` for exact match, `1` for differences, `2` for invalid or unreadable input. The output includes metadata identifiers for differing keys and their status (`added`, `missing`, `changed`), not column values or customer data.

**Security:** Never commit real production snapshots, credentials, user records, connection URLs or billing details. Schema metadata can still reveal internal design, so approve and sanitize exports before storing them. The tool accepts only the limited JSON fields above and rejects duplicate identifiers.

**Scope limits:** This comparison is *not* a Hibernate schema validation or a MySQL compatibility test. It does not check all DB properties, SQL defaults, checks expressions, collations, table options or actual data. The existing `backend/db/manual/schema-readiness.sql` returns rows from information_schema, **not this JSON contract**. It needs a separate reviewed transformation step; never feed the SQL's raw output to this comparator. A real `JPA_DDL_AUTO=validate` boot test must be run on a separate, disposable MySQL 9 restore before changing Railway production.

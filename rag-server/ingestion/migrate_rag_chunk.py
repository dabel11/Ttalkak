"""
ingestion/migrate_rag_chunk.py
────────────────────────────────────────────────────────────
RAG 지식 코퍼스(`rag_chunk` 테이블)를 한 MySQL에서 다른 MySQL로 옮긴다.

새 스테이징/Railway MySQL에는 기존 코퍼스가 자동 이전되지 않으므로, 로컬에서
**덤프 → 스테이징에 복원**하는 용도. 임베딩(JSON)을 그대로 옮기므로 **재임베딩·LLM
API 비용 0**이고, 결정적(deterministic)이다. ingestion 적재 스크립트 재실행과 달리
`data/` 자산·API 키가 필요 없다(그 자산은 배포 이미지에서도 .dockerignore 로 제외).

멱등성: 현 코퍼스는 모든 행이 `(collection_name, chunk_id)` 로 유일하다(실측: null 0,
distinct=행수). 따라서 **upsert(ON DUPLICATE KEY UPDATE)** 로 몇 번을 돌려도 중복이
생기지 않고 내용만 갱신된다 — delete-후-insert 가 아니라 안전하다.

스키마: 타깃 테이블은 앱과 동일한 `app.core.db` 모델로 `create_all` 하여 보장한다
(배포 앱의 `init_db()` 가 만드는 것과 같은 스키마). 적재 순서는 배포 전/후 무관.

──────────────────────────────────────────────────────────────
사용법 (rag-server/ 디렉터리에서 실행)

  # 1) 로컬에서 파일로 덤프 (소스 = app 과 동일: .env 의 DB_* 또는 RAG_DB_URL)
  python -m ingestion.migrate_rag_chunk dump --out rag_chunk.jsonl

  # 2) 스테이징에 복원 (타깃 DSN 명시 — 소스와 섞이지 않도록 반드시 별도 지정)
  python -m ingestion.migrate_rag_chunk load --in rag_chunk.jsonl \
      --target 'mysql+pymysql://USER:PW@HOST:3306/ttalkak?charset=utf8mb4'

  # 또는 파일 없이 소스→타깃 직접 복사
  python -m ingestion.migrate_rag_chunk copy \
      --target 'mysql+pymysql://USER:PW@HOST:3306/ttalkak?charset=utf8mb4'

  # 쓰기 전에 미리보기만 (연결·파싱·건수만 확인, 커밋 안 함)
  python -m ingestion.migrate_rag_chunk load --in rag_chunk.jsonl --target '...' --dry-run

──────────────────────────────────────────────────────────────
mysqldump 대안 (mysql 클라이언트가 있고 버전 호환이 맞을 때, 데이터만):
  mysqldump -h 127.0.0.1 -u root -proot --no-create-info --skip-triggers \
      --complete-insert ttalkak rag_chunk > rag_chunk.sql
  mysql -h HOST -u USER -pPW ttalkak < rag_chunk.sql   # 테이블은 앱 init_db 가 선생성
(※ MySQL8↔MariaDB mysqldump 비호환·JSON 컬럼 escaping 이슈가 있어 이 스크립트를 권장)
"""

import argparse
import json
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy import create_engine, func, select
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.orm import sessionmaker

# app.core.db 를 재사용 — 소스 엔진(=로컬/.env)과 ORM 모델·스키마를 그대로 쓴다.
from app.core.db import Base, RagChunk, SessionLocal as SourceSession

_BATCH = 50          # 멀티로우 insert 배치 (max_allowed_packet 여유)
# 실제 DB 컬럼명 기준(ORM 속성 chunk_metadata 가 아니라 컬럼명 "metadata").
# mysql_insert 의 .values()/.inserted 는 컬럼명으로 다룬다.
_COLUMNS = ("collection_name", "chunk_id", "document",
            "metadata", "embedding", "embedding_views")
_UPDATE_ON_DUP = ("document", "metadata", "embedding", "embedding_views")


def _mask(dsn: str) -> str:
    """로그에 DSN 을 찍을 때 비밀번호만 가린다."""
    try:
        parts = urlsplit(dsn)
        if parts.password:
            netloc = parts.netloc.replace(f":{parts.password}@", ":***@")
            return urlunsplit((parts.scheme, netloc, parts.path, parts.query, ""))
    except Exception:
        pass
    return dsn


# ── 읽기 (소스) ──────────────────────────────────────────────
def _read_source() -> list[dict]:
    """소스(app 기본 연결 = 로컬)에서 rag_chunk 전체를 dict 리스트로 읽는다.
    id(autoinc)·created_at(server default)은 옮기지 않는다 — 타깃이 스스로 채운다."""
    with SourceSession() as s:
        rows = s.execute(select(RagChunk)).scalars().all()
        out = []
        for r in rows:
            out.append({
                "collection_name": r.collection_name,
                "chunk_id":        r.chunk_id,
                "document":        r.document,
                "metadata":        r.chunk_metadata,   # 파일에선 사람친화적으로 'metadata'
                "embedding":       r.embedding,
                "embedding_views": r.embedding_views,
            })
        return out


def _to_row(d: dict) -> dict:
    """파일/소스 dict → insert 용 컬럼 dict (키 = 실제 DB 컬럼명)."""
    return {k: d.get(k) for k in _COLUMNS}


# ── 쓰기 (타깃) ──────────────────────────────────────────────
def _write_target(dsn: str, records: list[dict], dry_run: bool) -> None:
    engine = create_engine(dsn, pool_pre_ping=True, future=True)
    TargetSession = sessionmaker(bind=engine, future=True)

    # 스키마 보장 (앱 init_db 와 동일한 테이블 — embedding_views 포함 전체 컬럼 생성)
    Base.metadata.create_all(engine)

    # 들어올 데이터 요약
    by_col: dict[str, int] = {}
    for d in records:
        by_col[d["collection_name"]] = by_col.get(d["collection_name"], 0) + 1
    print(f"[load] 타깃 {_mask(dsn)}")
    print(f"[load] 들어올 행: {len(records)}  { {k: v for k, v in sorted(by_col.items())} }")

    if dry_run:
        with TargetSession() as s:
            cur = dict(s.execute(
                select(RagChunk.collection_name, func.count())
                .group_by(RagChunk.collection_name)
            ).all())
        print(f"[dry-run] 타깃 현재 행: { {k: v for k, v in sorted(cur.items())} }")
        print("[dry-run] 커밋하지 않고 종료 (연결·스키마·파싱 OK).")
        return

    tbl = RagChunk.__table__                    # Core 테이블 — 컬럼명으로 일관되게 다룬다
    rows = [_to_row(d) for d in records]
    written = 0
    with engine.begin() as conn:               # 트랜잭션 — 전부 성공 or 롤백
        for i in range(0, len(rows), _BATCH):
            batch = rows[i:i + _BATCH]
            stmt = mysql_insert(tbl).values(batch)
            # (collection_name, chunk_id) 충돌 시 내용 갱신 → 멱등 upsert
            stmt = stmt.on_duplicate_key_update(
                **{c: stmt.inserted[c] for c in _UPDATE_ON_DUP}
            )
            conn.execute(stmt)
            written += len(batch)
            print(f"[load] upsert {written}/{len(rows)}", end="\r")
    print()

    # 검증 — 타깃 최종 건수
    with TargetSession() as s:
        final = dict(s.execute(
            select(RagChunk.collection_name, func.count())
            .group_by(RagChunk.collection_name)
        ).all())
    print(f"[load] 완료. 타깃 최종 행: { {k: v for k, v in sorted(final.items())} }")


# ── 파일 I/O ────────────────────────────────────────────────
def _dump_to_file(path: str) -> None:
    records = _read_source()
    with open(path, "w", encoding="utf-8") as f:
        for d in records:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")
    by_col: dict[str, int] = {}
    for d in records:
        by_col[d["collection_name"]] = by_col.get(d["collection_name"], 0) + 1
    print(f"[dump] {len(records)}행 → {path}  { {k: v for k, v in sorted(by_col.items())} }")


def _load_from_file(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


# ── CLI ─────────────────────────────────────────────────────
def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="rag_chunk 코퍼스 덤프/복원 (임베딩 포함, 멱등 upsert)")
    sub = p.add_subparsers(dest="cmd", required=True)

    pd = sub.add_parser("dump", help="소스(로컬)에서 JSONL 파일로 덤프")
    pd.add_argument("--out", default="rag_chunk.jsonl")

    pl = sub.add_parser("load", help="JSONL 파일 → 타깃 DSN 복원")
    pl.add_argument("--in", dest="infile", required=True)
    pl.add_argument("--target", required=True, help="타깃 SQLAlchemy DSN (mysql+pymysql://...)")
    pl.add_argument("--dry-run", action="store_true")

    pc = sub.add_parser("copy", help="소스 → 타깃 DSN 직접 복사(파일 없이)")
    pc.add_argument("--target", required=True, help="타깃 SQLAlchemy DSN (mysql+pymysql://...)")
    pc.add_argument("--dry-run", action="store_true")

    a = p.parse_args(argv)

    if a.cmd == "dump":
        _dump_to_file(a.out)
    elif a.cmd == "load":
        _write_target(a.target, _load_from_file(a.infile), a.dry_run)
    elif a.cmd == "copy":
        _write_target(a.target, _read_source(), a.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

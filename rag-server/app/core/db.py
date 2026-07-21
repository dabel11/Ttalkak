"""
db.py
────────────────────────────────────────────────────────────
MySQL 기반 벡터 저장소 (ChromaDB 대체).

임베딩은 rag_chunk 테이블의 embedding 컬럼(JSON)에 저장하고,
유사도 검색은 Python(numpy)에서 정확(brute-force) 코사인으로 수행한다.
MySQL 8.0/9.x 어디서나 동작하며(벡터 인덱스 불필요), 현재 규모
(수백~수천 청크)에서는 충분히 빠르다.

접속 정보는 .env 또는 환경변수로 받는다 (Spring 백엔드와 동일 ttalkak DB).
  DB_HOST(기본 127.0.0.1) / DB_PORT(3306) / DB_NAME(ttalkak)
  DB_USER(root) / DB_PASSWORD(root — Spring 백엔드 기본값과 동일)
또는 단일 DSN: RAG_DB_URL=mysql+pymysql://user:pw@host:port/db
"""

import os
from datetime import datetime
from urllib.parse import quote_plus

from sqlalchemy import (
    create_engine, String, Integer, JSON, DateTime, func, Index,
)
from sqlalchemy.orm import declarative_base, sessionmaker, Mapped, mapped_column
from sqlalchemy.dialects.mysql import MEDIUMTEXT

# .env 는 app/__init__.py 에서 이미 로드됨 (app.core.db import 시 패키지 init 선실행).

Base = declarative_base()


class RagChunk(Base):
    """ChromaDB의 (documents, metadatas, embeddings)를 한 행으로 담는다."""
    __tablename__ = "rag_chunk"

    id:              Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    collection_name: Mapped[str]      = mapped_column(String(100), nullable=False)
    chunk_id:        Mapped[str]      = mapped_column(String(191), nullable=True)
    document:        Mapped[str]      = mapped_column(MEDIUMTEXT, nullable=False)
    chunk_metadata:  Mapped[dict]     = mapped_column("metadata", JSON, nullable=True)
    embedding:       Mapped[list]     = mapped_column(JSON, nullable=False)
    created_at:      Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("idx_rag_chunk_collection", "collection_name"),
        # 같은 컬렉션 내 chunk_id 중복 방지(있을 때만) → upsert 용
        Index("uq_rag_chunk_cid", "collection_name", "chunk_id", unique=True),
    )


def _build_url() -> str:
    dsn = os.environ.get("RAG_DB_URL")
    if dsn:
        return dsn
    host = os.environ.get("DB_HOST", "127.0.0.1")
    port = os.environ.get("DB_PORT", "3306")
    name = os.environ.get("DB_NAME", "ttalkak")
    user = os.environ.get("DB_USER", "root")
    pw   = os.environ.get("DB_PASSWORD", "root")
    pw_q = quote_plus(pw)
    return f"mysql+pymysql://{user}:{pw_q}@{host}:{port}/{name}?charset=utf8mb4"


# 엔진/세션은 모듈 전역으로 1회만 생성
_engine = create_engine(
    _build_url(),
    pool_pre_ping=True,   # 끊긴 커넥션 자동 감지
    pool_recycle=3600,
    future=True,
)
SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False, future=True)


def init_db() -> None:
    """rag_chunk 테이블이 없으면 생성."""
    Base.metadata.create_all(_engine)


def get_engine():
    return _engine

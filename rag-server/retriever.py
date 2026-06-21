"""
retriever.py
────────────────────────────────────────────────────────────
MySQL(rag_chunk)에서 컬렉션 행을 읽어 검색한다. (ChromaDB 대체)

검색 단계:
  1) 후보 추리기
     - dense — bge-m3 임베딩 + numpy 코사인
     - (옵션) hybrid — dense + BM25(sparse) 를 RRF로 융합해 후보 순위 결정
  2) (옵션) rerank — bge-reranker-v2-m3(cross-encoder)로 (query, doc) 재채점

use_hybrid / use_reranker 로 각 단계를 켜고 끈다.

score 의미(0~1)는 기존과 동일 — 후보 단계 점수는 dense 코사인, 리랭크 시에는
sigmoid 정규화 점수를 쓴다. 응답 스키마·소비자(Spring/익스텐션)는 안 바뀐다.
"""

import re

import numpy as np
from sqlalchemy import select

from db import SessionLocal, RagChunk, init_db
from embeddings import get_model, get_reranker

_RRF_K = 60   # Reciprocal Rank Fusion 상수 (관례값)
_TOKEN_RE = re.compile(r"[a-zA-Z]+|[0-9]+|[가-힣]+")


def _tokenize(text: str) -> list[str]:
    """BM25용 단순 토크나이저 — 영문/숫자/한글 음절런 단위 (소문자화)."""
    return _TOKEN_RE.findall(text.lower())


class Retriever:
    def __init__(
        self,
        model_name: str = "BAAI/bge-m3",
        use_reranker: bool = True,
        use_hybrid: bool = False,
        fetch_k: int = 20,
        **_ignore,
    ):
        # **_ignore: 기존 chroma_path 인자 호출과의 하위호환용 (무시)
        self.model        = get_model(model_name)
        self.use_reranker = use_reranker
        self.use_hybrid   = use_hybrid
        self.fetch_k      = fetch_k
        self._reranker    = None  # 지연 로드
        init_db()
        print(f"[Retriever] 준비 완료 (MySQL, rerank={use_reranker}, hybrid={use_hybrid})")

    def search(
        self,
        query: str,
        collection_name: str,
        top_k: int = 5,
        use_reranker: bool | None = None,
        use_hybrid: bool | None = None,
        fetch_k: int | None = None,
    ) -> list[dict]:
        do_rerank = self.use_reranker if use_reranker is None else use_reranker
        do_hybrid = self.use_hybrid   if use_hybrid   is None else use_hybrid
        n_fetch   = fetch_k if fetch_k is not None else self.fetch_k

        rows = self._load_collection(collection_name)
        if not rows:
            return []

        # ── 1단계: 후보 추리기 (dense 또는 dense+BM25 하이브리드) ──
        # 리랭크할 거면 넓게(n_fetch), 아니면 top_k만
        stage1_k   = max(n_fetch, top_k) if do_rerank else top_k
        candidates = self._candidates(query, rows, stage1_k, do_hybrid)

        if not do_rerank:
            return candidates[:top_k]

        # ── 2단계: cross-encoder 리랭크 ───────────────────────
        try:
            return self._rerank(query, candidates, top_k)
        except Exception as e:  # 리랭커 실패 시 후보로 폴백 (검색이 끊기지 않게)
            print(f"[Retriever] 리랭크 실패 → 후보 폴백: {e}")
            return candidates[:top_k]

    # ── 내부 ──────────────────────────────────────────────────
    def _candidates(self, query: str, rows: list[dict], k: int, hybrid: bool) -> list[dict]:
        """후보 순위를 만든다. hybrid면 dense+BM25를 RRF로 융합. score는 dense 코사인."""
        dense_scores = self._dense_scores(query, rows)
        k = min(k, len(rows))

        if hybrid:
            bm25_scores = self._bm25_scores(query, rows)
            order = self._rrf_order(dense_scores, bm25_scores)[:k]
        else:
            order = np.argsort(-dense_scores)[:k]

        return [
            {
                "text":     rows[i]["document"],
                "metadata": rows[i]["metadata"] or {},
                "score":    round(float(dense_scores[i]), 4),  # 해석 가능한 0~1 유지
            }
            for i in order
        ]

    def _dense_scores(self, query: str, rows: list[dict]) -> np.ndarray:
        query_vec = np.asarray(self.model.encode([query])[0], dtype=np.float32)
        matrix    = np.asarray([r["embedding"] for r in rows], dtype=np.float32)
        return self._cosine(query_vec, matrix)

    def _bm25_scores(self, query: str, rows: list[dict]) -> np.ndarray:
        from rank_bm25 import BM25Okapi
        corpus = [_tokenize(r["document"]) for r in rows]
        bm25   = BM25Okapi(corpus)
        return np.asarray(bm25.get_scores(_tokenize(query)), dtype=np.float32)

    @staticmethod
    def _rrf_order(dense: np.ndarray, sparse: np.ndarray) -> np.ndarray:
        """두 점수의 순위를 Reciprocal Rank Fusion으로 융합한 인덱스 순서."""
        n = len(dense)
        rank_d = np.empty(n, dtype=np.float64)
        rank_s = np.empty(n, dtype=np.float64)
        rank_d[np.argsort(-dense)]  = np.arange(n)   # 0-based 순위
        rank_s[np.argsort(-sparse)] = np.arange(n)
        rrf = 1.0 / (_RRF_K + rank_d) + 1.0 / (_RRF_K + rank_s)
        return np.argsort(-rrf)

    def _rerank(self, query: str, candidates: list[dict], top_k: int) -> list[dict]:
        if self._reranker is None:
            self._reranker = get_reranker()
        pairs  = [(query, c["text"]) for c in candidates]
        logits = self._reranker.predict(pairs)                 # cross-encoder 점수(로짓)
        probs  = 1.0 / (1.0 + np.exp(-np.asarray(logits)))     # sigmoid → 0~1

        order = np.argsort(-probs)[:top_k]
        out = []
        for i in order:
            c = dict(candidates[i])
            c["score"] = round(float(probs[i]), 4)              # 리랭커 점수로 교체
            out.append(c)
        return out

    def _load_collection(self, collection_name: str) -> list[dict]:
        with SessionLocal() as session:
            results = session.execute(
                select(
                    RagChunk.document,
                    RagChunk.chunk_metadata,
                    RagChunk.embedding,
                ).where(RagChunk.collection_name == collection_name)
            ).all()

        return [
            {"document": doc, "metadata": meta, "embedding": emb}
            for doc, meta, emb in results
        ]

    @staticmethod
    def _cosine(q: np.ndarray, m: np.ndarray) -> np.ndarray:
        q_norm = np.linalg.norm(q)
        m_norm = np.linalg.norm(m, axis=1)
        denom  = m_norm * q_norm
        denom[denom == 0] = 1e-12        # 0 division 방지
        return (m @ q) / denom

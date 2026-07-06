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

from app.core.db import SessionLocal, RagChunk, init_db
from app.core.embeddings import get_model, get_reranker

_RRF_K = 60   # Reciprocal Rank Fusion 상수 (관례값)
_TOKEN_RE = re.compile(r"[a-zA-Z]+|[0-9]+|[가-힣]+")

# BM25에 의미 있는 형태소만 남긴다(조사·어미·기호 제거) → 한국어 매칭 품질↑
_KEEP_TAGS = ("NNG", "NNP", "NNB", "NR", "NP",   # 명사류
              "VV", "VA", "VX", "XR",            # 용언·어근
              "SL", "SH", "SN",                  # 외국어·한자·숫자
              "MAG")                             # 일반부사(차근차근 등)
_kiwi = None
_kiwi_failed = False


def _get_kiwi():
    """kiwipiepy 형태소 분석기를 1회만 로드. 실패하면 None(정규식 폴백)."""
    global _kiwi, _kiwi_failed
    if _kiwi is None and not _kiwi_failed:
        try:
            from kiwipiepy import Kiwi
            _kiwi = Kiwi()
        except Exception as e:
            print(f"[Retriever] kiwipiepy 미사용 → 정규식 토큰화 폴백: {e}")
            _kiwi_failed = True
    return _kiwi


def _tokenize(text: str) -> list[str]:
    """BM25용 토크나이저 — kiwipiepy로 내용 형태소 추출(소문자화).
    kiwipiepy 없으면 영문/숫자/한글 음절런 정규식으로 폴백."""
    kiwi = _get_kiwi()
    if kiwi is not None:
        try:
            toks = [t.form.lower() for t in kiwi.tokenize(text) if t.tag in _KEEP_TAGS]
            if toks:
                return toks
        except Exception:
            pass
    return _TOKEN_RE.findall(text.lower())


class Retriever:
    def __init__(
        self,
        model_name: str = "BAAI/bge-m3",
        use_reranker: bool = True,
        use_hybrid: bool = False,
        fetch_k: int = 20,   # 측정 파레토 최적 (50: 전지표 열세·2.5배 느림 — WORKLOG 2026-07-05)
        **_ignore,
    ):
        # **_ignore: 기존 chroma_path 인자 호출과의 하위호환용 (무시)
        self.model        = get_model(model_name)
        self.use_reranker = use_reranker
        self.use_hybrid   = use_hybrid
        self.fetch_k      = fetch_k
        self._reranker    = None  # 지연 로드
        self._bm25_cache  = {}    # {collection: (BM25Okapi, row_count)} — 토큰화 재사용
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
        min_score: float | None = None,
    ) -> list[dict]:
        """min_score: dense 코사인 임계치. 이 값 미만은 top_k에서 제외(무관 꼬리 컷).
        측정(eval/score_analysis) 근거: 리랭커 확률은 정답/오답 분리가 안 되고(0.50 평탄),
        dense 는 분리됨 → 필터는 dense 기준. τ=0.40이면 recall 무손실·빈결과 0%."""
        do_rerank = self.use_reranker if use_reranker is None else use_reranker
        do_hybrid = self.use_hybrid   if use_hybrid   is None else use_hybrid
        n_fetch   = fetch_k if fetch_k is not None else self.fetch_k

        rows = self._load_collection(collection_name)
        if not rows:
            return []

        # ── 1단계: 후보 추리기 (dense 또는 dense+BM25 하이브리드) ──
        # 리랭크할 거면 넓게(n_fetch), 아니면 top_k만
        stage1_k   = max(n_fetch, top_k) if do_rerank else top_k
        candidates = self._candidates(query, rows, stage1_k, do_hybrid, collection_name)

        if not do_rerank:
            hits = candidates[:top_k]
        else:
            # ── 2단계: cross-encoder 리랭크 ───────────────────
            try:
                hits = self._rerank(query, candidates, top_k)
            except Exception as e:  # 리랭커 실패 시 후보로 폴백 (검색이 끊기지 않게)
                print(f"[Retriever] 리랭크 실패 → 후보 폴백: {e}")
                hits = candidates[:top_k]

        # ── 3단계(옵션): 유효 유사도 필터 — score(dense 코사인) 기준 ──
        if min_score is not None:
            hits = [h for h in hits if h["score"] >= min_score]
        return hits

    # ── 내부 ──────────────────────────────────────────────────
    def _candidates(self, query: str, rows: list[dict], k: int, hybrid: bool,
                    collection_name: str) -> list[dict]:
        """후보 순위를 만든다. hybrid면 dense+BM25를 RRF로 융합. score는 dense 코사인."""
        dense_scores = self._dense_scores(query, rows)
        k = min(k, len(rows))

        if hybrid:
            bm25_scores = self._bm25_scores(query, rows, collection_name)
            order = self._rrf_order(dense_scores, bm25_scores)[:k]
        else:
            order = np.argsort(-dense_scores)[:k]

        return [
            {
                "text":        rows[i]["document"],
                "metadata":    rows[i]["metadata"] or {},
                "score":       round(float(dense_scores[i]), 4),  # 해석 가능한 0~1 유지
                "dense_score": round(float(dense_scores[i]), 4),  # 리랭크 후 표시 점수로 보존
            }
            for i in order
        ]

    def _dense_scores(self, query: str, rows: list[dict]) -> np.ndarray:
        query_vec = np.asarray(self.model.encode([query])[0], dtype=np.float32)
        matrix    = np.asarray([r["embedding"] for r in rows], dtype=np.float32)
        return self._cosine(query_vec, matrix)

    def _bm25_scores(self, query: str, rows: list[dict], collection_name: str) -> np.ndarray:
        """BM25 점수. 코퍼스 토큰화는 컬렉션별로 캐시(행수 변하면 재구축).
        _load_collection이 id 순으로 정렬해 캐시와 rows 정렬이 일치한다."""
        from rank_bm25 import BM25Okapi
        cached = self._bm25_cache.get(collection_name)
        if cached is None or cached[1] != len(rows):
            corpus = [_tokenize(r["document"]) for r in rows]
            cached = (BM25Okapi(corpus), len(rows))
            self._bm25_cache[collection_name] = cached
        return np.asarray(cached[0].get_scores(_tokenize(query)), dtype=np.float32)

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
            # 순위는 reranker 기준 유지, 표시 점수는 평탄한 sigmoid 대신 dense 코사인 사용.
            # rerank_score(sigmoid 0~1)는 임계치 필터·분석용으로 병기.
            c["rerank_score"] = round(float(probs[i]), 4)
            c["score"] = c.pop("dense_score", c["score"])
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
                .order_by(RagChunk.id)   # 안정적 정렬 → BM25 캐시와 rows 정렬 일치
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

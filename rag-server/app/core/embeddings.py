"""
embeddings.py
────────────────────────────────────────────────────────────
임베딩/리랭커 추상화. 백엔드 2가지를 EMBEDDING_BACKEND 로 고른다.

  - gemini (기본): Gemini 임베딩 API(google-genai). torch 불필요 → 상주 RAM 수백 MB.
                   Railway free/trial(RAM 0.5~1GB)에서도 뜬다.
  - local        : bge-m3(SentenceTransformer) + bge-reranker-v2-m3(CrossEncoder).
                   torch·sentence-transformers(수 GB)가 필요 → 개발/eval 전용.

⚠️ 핵심 설계: local 백엔드 의존성(torch·sentence-transformers)은 **지연 import** 한다.
   종전에는 이 모듈 최상단에서 `import torch` 했기 때문에, 서버가 gemini 로 떠도 bge-m3 를
   쓰지 않는데도 기동 중 torch(~수백 MB) + bge-m3(~1.5~2GB)가 메모리에 올라가 free RAM 을
   넘겨 **기동 OOM(연결 끊김)** 이 났다. 지금은 gemini 로 뜨면 torch 를 아예 import 하지 않는다.

Indexer/Retriever 는 `embed_documents()` / `embed_query()` 를 쓴다(백엔드 자동 분기).
eval/ingestion 의 레거시 호출(`get_model().encode(...)`)은 local 백엔드로 그대로 동작한다.

전환 시 주의(코퍼스 호환): 저장된 벡터는 임베딩 모델에 종속된다. bge-m3(1024d)로 적재된
rag_chunk 를 gemini 로 쿼리하면 벡터 공간이 달라 검색이 깨진다 → 코퍼스를 **재임베딩**해야
한다(ingestion/reembed.py). 또 코사인 절대값 분포가 달라 게이트 임계치(min_score·
gate_min_score)는 재보정이 필요하다.
"""

import os

# ── Gemini task_type(쿼리/문서 비대칭 임베딩) — 검색 품질에 유의미 ──
_GEMINI_DOC_TASK = "RETRIEVAL_DOCUMENT"
_GEMINI_QUERY_TASK = "RETRIEVAL_QUERY"

# ── local 백엔드 모델명 ──
_DEFAULT_MODEL = "BAAI/bge-m3"
_DEFAULT_RERANKER = "BAAI/bge-reranker-v2-m3"


def backend() -> str:
    """임베딩 백엔드. EMBEDDING_BACKEND 미설정이면 gemini(배포 기본)."""
    return (os.environ.get("EMBEDDING_BACKEND") or "gemini").strip().lower()


def _embedding_dim() -> int:
    """gemini 출력 차원(output_dimensionality). 기본 768(저장·연산 비용 절감).
    gemini-embedding-001 원본은 3072 이며 그보다 작으면 잘라서 반환한다."""
    try:
        return int(os.environ.get("EMBEDDING_DIM", "") or 768)
    except ValueError:
        return 768


def _gemini_embedding_model() -> str:
    return os.environ.get("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")


# ════════════════════════════════════════════════════════════
# Gemini 백엔드 (torch 불필요)
# ════════════════════════════════════════════════════════════
_genai_client = None
_GEMINI_BATCH = 100   # embed_content 1회 상한(보수적). 초과분은 분할 호출.


def _get_gemini_client():
    global _genai_client
    if _genai_client is None:
        from google import genai   # 지연 import (torch 무관)
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "EMBEDDING_BACKEND=gemini 인데 GEMINI_API_KEY 가 없습니다. "
                ".env 에 GEMINI_API_KEY 를 설정하세요."
            )
        _genai_client = genai.Client(api_key=api_key)
    return _genai_client


def _gemini_embed(texts: list[str], task_type: str) -> list[list[float]]:
    """텍스트 리스트 → 임베딩 리스트(float 리스트의 리스트).

    배치 호출을 우선 시도하고, 배치를 지원하지 않거나(일부 엔드포인트) 반환 개수가
    맞지 않으면 1건씩 폴백한다 — 어느 경로든 입력 순서와 1:1 로 맞춘다."""
    if not texts:
        return []
    from google.genai import types   # 지연 import
    client = _get_gemini_client()
    model = _gemini_embedding_model()
    cfg = types.EmbedContentConfig(
        task_type=task_type,
        output_dimensionality=_embedding_dim(),
    )

    out: list[list[float]] = []
    for i in range(0, len(texts), _GEMINI_BATCH):
        batch = texts[i:i + _GEMINI_BATCH]
        try:
            resp = client.models.embed_content(model=model, contents=batch, config=cfg)
            vecs = [list(e.values) for e in resp.embeddings]
            if len(vecs) != len(batch):
                raise ValueError(f"임베딩 개수 불일치: {len(vecs)} != {len(batch)}")
            out.extend(vecs)
        except Exception:
            # 배치 미지원·부분 실패 → 1건씩 재시도(순서 보존)
            for t in batch:
                resp = client.models.embed_content(model=model, contents=t, config=cfg)
                out.append(list(resp.embeddings[0].values))
    return out


# ════════════════════════════════════════════════════════════
# local 백엔드 (torch·sentence-transformers — 지연 import)
# ════════════════════════════════════════════════════════════
_model_cache: dict = {}      # {model_name: SentenceTransformer}
_reranker_cache: dict = {}   # {model_name: CrossEncoder}
_threads_tuned = False


def _tune_cpu_threads() -> None:
    """CPU 추론에서 torch 가 전체 코어를 쓰도록 스레드 수를 맞춘다(local 백엔드 전용).

    실측(2026-10-01): 10코어 머신에서 torch 기본 intra-op 스레드가 4로 잡혀 느렸다.
    코어 수로 올리면 리랭크 50쌍 4.1s→2.6s(-38%), 품질 불변. RAG_TORCH_THREADS 로 상한 지정."""
    global _threads_tuned
    if _threads_tuned:
        return
    import torch
    from app.core.cpu import desired_threads
    try:
        want = desired_threads()
        if want != torch.get_num_threads():
            torch.set_num_threads(want)
            print(f"[Embeddings] torch CPU 스레드: {torch.get_num_threads()} (코어 {os.cpu_count()})")
    except Exception as e:
        print(f"[Embeddings] torch 스레드 설정 실패(무시): {e}")
    _threads_tuned = True


def _select_device() -> str:
    import sys
    import torch
    if sys.platform == "darwin":
        # Apple Silicon MPS는 메모리 초과 위험 → CPU 사용
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def get_model(model_name: str = _DEFAULT_MODEL):
    """local 임베딩 모델(SentenceTransformer)을 프로세스당 1회 로드해 공유.
    torch/sentence-transformers 는 이 함수 안에서만 import 된다(gemini 백엔드엔 미로드)."""
    if model_name not in _model_cache:
        from sentence_transformers import SentenceTransformer
        _tune_cpu_threads()
        device = _select_device()
        print(f"[Embeddings] (local) 임베딩 모델 로드 중: {model_name} (device={device})")
        _model_cache[model_name] = SentenceTransformer(model_name, device=device)
        print("[Embeddings] (local) 임베딩 준비 완료")
    return _model_cache[model_name]


def get_reranker(model_name: str = _DEFAULT_RERANKER):
    """local cross-encoder 리랭커를 프로세스당 1회 로드해 공유 (~568M, torch 필요)."""
    if model_name not in _reranker_cache:
        from sentence_transformers import CrossEncoder
        _tune_cpu_threads()
        device = _select_device()
        print(f"[Embeddings] (local) 리랭커 로드 중: {model_name} (device={device})")
        _reranker_cache[model_name] = CrossEncoder(model_name, device=device)
        print("[Embeddings] (local) 리랭커 준비 완료")
    return _reranker_cache[model_name]


# ════════════════════════════════════════════════════════════
# 공개 API — Indexer/Retriever 가 쓰는 백엔드 분기 진입점
# ════════════════════════════════════════════════════════════
def embed_documents(texts: list[str]) -> list[list[float]]:
    """문서(코퍼스) 임베딩. gemini 는 RETRIEVAL_DOCUMENT task_type 사용."""
    if not texts:
        return []
    if backend() == "gemini":
        return _gemini_embed(texts, _GEMINI_DOC_TASK)
    return [list(v) for v in get_model().encode(texts)]


def embed_query(text: str) -> list[float]:
    """쿼리 임베딩. gemini 는 RETRIEVAL_QUERY task_type 사용(문서와 비대칭)."""
    if backend() == "gemini":
        return _gemini_embed([text], _GEMINI_QUERY_TASK)[0]
    return [float(v) for v in get_model().encode([text])[0]]


def rerank_enabled() -> bool:
    """cross-encoder 리랭커 사용 가능 여부.

    기본 OFF. 리랭커(bge-reranker-v2-m3)는 ~1.1GB + torch 라 free RAM 에 못 올린다.
    되살리려면 RAG_RERANK=local(bge-reranker) 로 켠다 — torch·sentence-transformers 가
    설치된 환경(개발/큰 티어)에서만 유효. (향후 외부 rerank API 백엔드 추가 지점)"""
    return (os.environ.get("RAG_RERANK") or "").strip().lower() == "local"

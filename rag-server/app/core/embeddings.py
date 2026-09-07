"""
embeddings.py
────────────────────────────────────────────────────────────
bge-m3 임베딩 모델을 프로세스당 1회만 로드해 Indexer/Retriever가 공유한다.
(기존엔 Indexer·Retriever가 각각 로드해 메모리를 2배로 썼다.)
"""

import sys

import torch
from sentence_transformers import SentenceTransformer, CrossEncoder

_DEFAULT_MODEL    = "BAAI/bge-m3"
_DEFAULT_RERANKER = "BAAI/bge-reranker-v2-m3"
_model_cache:    dict[str, SentenceTransformer] = {}
_reranker_cache: dict[str, CrossEncoder] = {}


def _select_device() -> str:
    if sys.platform == "darwin":
        # Apple Silicon MPS는 메모리 초과 위험 → CPU 사용
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def get_model(model_name: str = _DEFAULT_MODEL) -> SentenceTransformer:
    if model_name not in _model_cache:
        device = _select_device()
        print(f"[Embeddings] 임베딩 모델 로드 중: {model_name} (device={device})")
        _model_cache[model_name] = SentenceTransformer(model_name, device=device)
        print("[Embeddings] 임베딩 준비 완료")
    return _model_cache[model_name]


def get_reranker(model_name: str = _DEFAULT_RERANKER) -> CrossEncoder:
    """cross-encoder 리랭커를 프로세스당 1회만 로드해 공유 (~568M)."""
    if model_name not in _reranker_cache:
        device = _select_device()
        print(f"[Embeddings] 리랭커 로드 중: {model_name} (device={device})")
        _reranker_cache[model_name] = CrossEncoder(model_name, device=device)
        print("[Embeddings] 리랭커 준비 완료")
    return _reranker_cache[model_name]

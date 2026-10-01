"""
embeddings.py
────────────────────────────────────────────────────────────
bge-m3 임베딩 모델을 프로세스당 1회만 로드해 Indexer/Retriever가 공유한다.
(기존엔 Indexer·Retriever가 각각 로드해 메모리를 2배로 썼다.)
"""

import os
import sys

import torch

from app.core.cpu import desired_threads
from sentence_transformers import SentenceTransformer, CrossEncoder

_DEFAULT_MODEL    = "BAAI/bge-m3"
_DEFAULT_RERANKER = "BAAI/bge-reranker-v2-m3"
_model_cache:    dict[str, SentenceTransformer] = {}
_reranker_cache: dict[str, CrossEncoder] = {}


def _tune_cpu_threads() -> None:
    """CPU 추론에서 torch 가 전체 코어를 쓰도록 스레드 수를 맞춘다.

    왜: torch 기본 intra-op 스레드가 코어 수보다 작게 잡히는 경우가 있다(실측 2026-10-01:
    10코어 머신에서 4스레드). CPU 바운드인 bge-reranker(가장 큰 지연원)·bge-m3 임베딩이
    코어를 다 못 써 느렸다 — 스레드를 코어 수로 올리면 리랭크 50쌍 4.1s→2.6s(-38%), 품질 불변.
    RAG_TORCH_THREADS 로 상한 지정 가능(0/미설정이면 os.cpu_count()). GPU 에선 무의미하나 무해."""
    want = desired_threads()
    try:
        if want != torch.get_num_threads():
            torch.set_num_threads(want)
            print(f"[Embeddings] torch CPU 스레드: {torch.get_num_threads()} (코어 {os.cpu_count()})")
    except Exception as e:
        print(f"[Embeddings] torch 스레드 설정 실패(무시): {e}")


_tune_cpu_threads()


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

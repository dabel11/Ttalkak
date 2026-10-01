"""
tests/test_cpu_threads.py
────────────────────────────────────────────────────────────
CPU 추론 스레드 튜닝(app/core/embeddings._tune_cpu_threads) 테스트.
torch 가 전체 코어를 쓰도록 맞추는지 / RAG_TORCH_THREADS 상한이 먹는지 확인.
(품질과 무관한 성능 설정 — bge-reranker CPU 지연의 주 완화책, 2026-10-01)
"""

import os

import torch

from app.core import embeddings


def test_tune_uses_all_cores_by_default(monkeypatch):
    monkeypatch.delenv("RAG_TORCH_THREADS", raising=False)
    embeddings._tune_cpu_threads()
    assert torch.get_num_threads() == (os.cpu_count() or 1)


def test_tune_respects_explicit_cap(monkeypatch):
    monkeypatch.setenv("RAG_TORCH_THREADS", "2")
    embeddings._tune_cpu_threads()
    assert torch.get_num_threads() == 2
    # 원복(다른 테스트에 영향 없게)
    monkeypatch.delenv("RAG_TORCH_THREADS", raising=False)
    embeddings._tune_cpu_threads()


def test_tune_ignores_bad_value(monkeypatch):
    monkeypatch.setenv("RAG_TORCH_THREADS", "abc")
    before = torch.get_num_threads()
    embeddings._tune_cpu_threads()                 # 예외 없이 cpu_count 로 폴백
    assert torch.get_num_threads() == (os.cpu_count() or 1)
    assert before >= 1

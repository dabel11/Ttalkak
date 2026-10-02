"""
tests/test_cpu_threads.py
────────────────────────────────────────────────────────────
CPU 추론 스레드 '결정' 로직(app/core/cpu.desired_threads) 테스트.
전체 코어를 기본값으로 쓰는지 / RAG_TORCH_THREADS 상한·오입력 폴백이 맞는지 확인.

주의: torch·app.core.embeddings 를 import 하지 않는다 — CI 는 torch/모델 미설치라
그걸 import 하면 collection 단계에서 실패한다(requirements-test.txt 규칙).
실제 torch.set_num_threads 호출은 embeddings._tune_cpu_threads 가 이 값으로 수행한다.
(품질과 무관한 성능 설정 — bge-reranker CPU 지연의 주 완화책, 2026-10-01)
"""

import os

from app.core.cpu import desired_threads


def test_defaults_to_all_cores(monkeypatch):
    monkeypatch.delenv("RAG_TORCH_THREADS", raising=False)
    assert desired_threads() == (os.cpu_count() or 1)


def test_respects_explicit_cap(monkeypatch):
    monkeypatch.setenv("RAG_TORCH_THREADS", "2")
    assert desired_threads() == 2


def test_ignores_bad_value(monkeypatch):
    monkeypatch.setenv("RAG_TORCH_THREADS", "abc")
    assert desired_threads() == (os.cpu_count() or 1)


def test_zero_or_negative_falls_back(monkeypatch):
    for v in ("0", "-4"):
        monkeypatch.setenv("RAG_TORCH_THREADS", v)
        assert desired_threads() == (os.cpu_count() or 1)

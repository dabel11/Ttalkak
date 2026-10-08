"""
tests/test_cpu_threads.py
────────────────────────────────────────────────────────────
CPU 스레드 '결정' 로직(app/core/cpu) 테스트 — torch·embeddings 미사용(CI 경량).

- 명시 RAG_TORCH_THREADS(>0) 우선
- 미설정이면 auto_threads() = os.cpu_count() 를 cgroup vCPU 한도로 cap
  (컨테이너 과다할당 방지, 2026-10-08 Railway 48코어 과다할당 이슈 대응)
"""
import os

from app.core import cpu


def test_explicit_cap_wins(monkeypatch):
    monkeypatch.setenv("RAG_TORCH_THREADS", "2")
    assert cpu.desired_threads() == 2


def test_bad_value_falls_back_to_auto(monkeypatch):
    monkeypatch.setenv("RAG_TORCH_THREADS", "abc")
    monkeypatch.setattr(cpu, "auto_threads", lambda: 7)
    assert cpu.desired_threads() == 7


def test_zero_or_negative_uses_auto(monkeypatch):
    monkeypatch.setattr(cpu, "auto_threads", lambda: 5)
    for v in ("0", "-4"):
        monkeypatch.setenv("RAG_TORCH_THREADS", v)
        assert cpu.desired_threads() == 5


def test_auto_without_cgroup_is_cpu_count(monkeypatch):
    monkeypatch.setattr(cpu, "_cgroup_cpu_limit", lambda: None)
    assert cpu.auto_threads() == (os.cpu_count() or 1)


def test_auto_caps_to_cgroup_limit(monkeypatch):
    """호스트 코어가 많아도 cgroup vCPU 한도 이하로 — Railway 과다할당 방지."""
    monkeypatch.setattr(cpu, "_cgroup_cpu_limit", lambda: 2)
    assert cpu.auto_threads() == 2


def test_auto_ignores_cgroup_when_larger(monkeypatch):
    """cgroup 한도가 코어보다 크면(드묾) 코어 수를 쓴다."""
    monkeypatch.setattr(cpu, "_cgroup_cpu_limit", lambda: 9999)
    assert cpu.auto_threads() == (os.cpu_count() or 1)

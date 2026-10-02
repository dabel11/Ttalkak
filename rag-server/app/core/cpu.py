"""
app/core/cpu.py
────────────────────────────────────────────────────────────
CPU 스레드 수 '결정' 로직(torch 무관 순수 함수). embeddings 가 실제 torch 호출에 쓴다.

분리 이유: 결정 로직은 환경변수·코어수만 보는 순수 계산인데, embeddings 에 두면 테스트가
torch·sentence-transformers(수 GB) 를 끌어와 CI 에서 실패한다(requirements-test.txt 규칙).
"""
import os


def desired_threads() -> int:
    """RAG_TORCH_THREADS 상한(>0)이면 그 값, 아니면 os.cpu_count(). 잘못된 값은 cpu_count 폴백."""
    try:
        want = int(os.environ.get("RAG_TORCH_THREADS", "") or 0)
    except ValueError:
        want = 0
    if want <= 0:
        want = os.cpu_count() or 1
    return want

"""
app/core/cpu.py
────────────────────────────────────────────────────────────
CPU 스레드 수 '결정' 로직(torch 무관 순수 함수). embeddings 가 실제 torch 호출에 쓴다.

분리 이유: 결정 로직은 환경변수·코어수만 보는 순수 계산인데, embeddings 에 두면 테스트가
torch·sentence-transformers(수 GB) 를 끌어와 CI 에서 실패한다(requirements-test.txt 규칙).

컨테이너 인지(2026-10-08): os.cpu_count() 는 **호스트** 코어를 보고한다(Railway=48). 컨테이너가
실제 할당받은 vCPU(cgroup quota)는 훨씬 적을 수 있고, 그보다 많은 torch 스레드를 띄우면
컨텍스트 스위칭 폭주로 **오히려 느려진다**(실측: Railway 에서 모델 로드 ~2분, /query 20~35s).
그래서 cgroup CPU quota 를 읽어 그 이하로 제한한다.
"""
import os


def _cgroup_cpu_limit() -> int | None:
    """cgroup CPU quota(=컨테이너가 실제 쓸 수 있는 vCPU 수)를 정수로. 못 읽으면 None."""
    # cgroup v2: "/sys/fs/cgroup/cpu.max" = "<quota> <period>" (quota=="max" 면 무제한)
    try:
        quota, period = open("/sys/fs/cgroup/cpu.max").read().split()[:2]
        if quota != "max":
            n = int(float(quota) / float(period))
            return max(1, n)
    except Exception:
        pass
    # cgroup v1: cfs_quota_us / cfs_period_us (quota<=0 이면 무제한)
    try:
        q = int(open("/sys/fs/cgroup/cpu/cpu.cfs_quota_us").read())
        p = int(open("/sys/fs/cgroup/cpu/cpu.cfs_period_us").read())
        if q > 0 and p > 0:
            return max(1, q // p)
    except Exception:
        pass
    return None


def auto_threads() -> int:
    """자동 스레드 수 — os.cpu_count() 를 cgroup vCPU 한도로 cap(컨테이너 과다할당 방지)."""
    n = os.cpu_count() or 1
    limit = _cgroup_cpu_limit()
    return min(n, limit) if limit else n


def desired_threads() -> int:
    """RAG_TORCH_THREADS 상한(>0)이면 그 값(명시 우선), 아니면 auto_threads(). 잘못된 값은 auto 폴백."""
    try:
        want = int(os.environ.get("RAG_TORCH_THREADS", "") or 0)
    except ValueError:
        want = 0
    return want if want > 0 else auto_threads()

"""
concurrency.py
────────────────────────────────────────────────────────────
LLM 생성 구간 동시 실행 게이트.

왜 필요한가 (WORKLOG 2026-09-13 실측):
  `/query` 1건의 생성 요청이 Groq TPM 8,000 중 **약 7,800 을 점유**한다
  (입력 4,000~6,600 + `_fit_max_tokens` 출력 예약 1,203~1,951).
  즉 **동시 요청 2건이면 두 번째는 반드시 429** 다. 그러면 generator 가
  Gemini 로 폴백하는데 Gemini 무료 티어는 RPD 20 이라 금방 소진되고,
  그때부터는 두 백엔드가 동시에 막혀 `/query` 가 503 만 낸다.
  → 데모 중 두 명이 동시에 누르면 서비스가 깨진다.

  쿼터를 늘릴 수 없다면 **줄을 세우는 것**이 맞다. 429 로 실패해 폴백 쿼터까지
  태우는 것보다, 기다렸다가 성공하는 편이 사용자에게도 낫다.

설계
  · 게이트는 **LLM 구간만** 감싼다(`run_generation`). 검색·리랭크는 CPU/DB 작업이라
    병렬로 둔다 — 게이트 안에 넣으면 5초짜리 검색이 줄을 막아 처리량이 반으로 준다.
  · **무한 대기는 금지.** 백엔드 WebClient 타임아웃이 75초라, 그 안에 못 끝날 요청은
    기다려 봐야 어차피 버려진다. 대기 상한을 두고 넘으면 503 으로 빨리 돌려준다.
  · **줄 길이도 제한.** 이미 대기가 꽉 찼으면 기다리게 하지 말고 즉시 거절한다
    (다 같이 타임아웃 나는 것보다, 받을 수 있는 만큼만 받는 편이 낫다).

기본값의 관계 — 셋은 따로 고르면 안 된다
    대기상한 ≈ 줄길이 × 1건 처리시간
    2 × 20s = 40s ≈ RAG_GEN_QUEUE_WAIT(40)
  줄길이를 늘리면 대기상한도 같이 늘려야 하고, 그 합이 백엔드 75초를 넘으면
  안 된다(검색 ~5초 + 생성 ~20초를 빼고 남는 시간이 대기 예산이다).

환경변수: RAG_MAX_CONCURRENT_GEN / RAG_GEN_QUEUE_WAIT / RAG_GEN_QUEUE_DEPTH
"""

import os
import threading
from contextlib import contextmanager


def _int_env(name: str, default: int, minimum: int = 0) -> int:
    try:
        value = int(os.environ.get(name, ""))
    except (TypeError, ValueError):
        return default
    return value if value >= minimum else default


def _float_env(name: str, default: float, minimum: float = 0.0) -> float:
    try:
        value = float(os.environ.get(name, ""))
    except (TypeError, ValueError):
        return default
    return value if value > minimum else default


# 동시에 LLM 을 부를 수 있는 요청 수. 1 = 완전 직렬(현 쿼터의 현실).
MAX_CONCURRENT = _int_env("RAG_MAX_CONCURRENT_GEN", 1, minimum=1)
# 슬롯을 기다릴 수 있는 최대 시간(초).
QUEUE_WAIT_SECONDS = _float_env("RAG_GEN_QUEUE_WAIT", 40.0)
# 동시에 '대기'할 수 있는 요청 수. 초과하면 기다리지 않고 즉시 거절.
QUEUE_DEPTH = _int_env("RAG_GEN_QUEUE_DEPTH", 2, minimum=0)


class GateBusy(RuntimeError):
    """줄이 이미 꽉 찼다 — 기다리지 않고 즉시 거절."""


class GateTimeout(RuntimeError):
    """대기 상한을 넘겼다."""


class Gate:
    """제한된 동시 실행 + 제한된 대기열.

    `threading` 기반이다 — FastAPI 는 `def` 엔드포인트를 스레드풀에서 돌리므로
    async 프리미티브가 아니라 스레드 프리미티브가 맞다.
    """

    def __init__(self, limit: int = MAX_CONCURRENT, depth: int = QUEUE_DEPTH,
                 wait_seconds: float = QUEUE_WAIT_SECONDS):
        self.limit = max(1, limit)
        self.depth = max(0, depth)
        self.wait_seconds = wait_seconds
        self._sem = threading.BoundedSemaphore(self.limit)
        self._lock = threading.Lock()
        self._waiting = 0

    @property
    def waiting(self) -> int:
        with self._lock:
            return self._waiting

    @contextmanager
    def enter(self):
        """슬롯을 잡고 실행. 못 잡으면 GateBusy / GateTimeout."""
        # 슬롯이 바로 비어 있으면 줄 서지 않고 통과 (대기열 계산 자체를 생략)
        if self._sem.acquire(blocking=False):
            try:
                yield
            finally:
                self._sem.release()
            return

        with self._lock:
            if self._waiting >= self.depth:
                # 여기서 기다리게 하면 이 요청도, 앞 요청들도 다 같이 타임아웃 난다
                raise GateBusy(
                    f"생성 대기열이 가득 찼습니다(동시 {self.limit}건 · 대기 {self.depth}건). "
                    "잠시 후 다시 시도해 주세요."
                )
            self._waiting += 1

        try:
            acquired = self._sem.acquire(timeout=self.wait_seconds)
        finally:
            with self._lock:
                self._waiting -= 1

        if not acquired:
            raise GateTimeout(
                f"생성 슬롯을 {self.wait_seconds:.0f}초 안에 얻지 못했습니다. "
                "잠시 후 다시 시도해 주세요."
            )
        try:
            yield
        finally:
            self._sem.release()

    def stats(self) -> dict:
        """운영 점검용 — /health 등에서 읽는다."""
        with self._lock:
            waiting = self._waiting
        return {
            "limit": self.limit,
            "depth": self.depth,
            "waitSeconds": self.wait_seconds,
            "waiting": waiting,
        }


# LLM 생성 구간 전역 게이트. `run_generation` 이 사용한다.
generation_gate = Gate()

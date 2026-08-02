"""
tests/test_generator_guards.py
────────────────────────────────────────────────────────────
generator 의 운영 가드 3종 단위 테스트 (API 호출 없음).

- _sanitize_history : 정제 + 문자 예산 컷(최신 턴 우선, 턴 내용은 안 자름)
- _retry_after_seconds : Groq 429 대기시간 추출 (헤더 → 메시지 → 기본값)
- _needs_long_context : 장문 입력의 Gemini 라우팅 판정

실행: python3 -m tests.test_generator_guards
"""

from types import SimpleNamespace

from app.rag.generator import (
    _HISTORY_CHAR_BUDGET,
    _needs_long_context,
    _retry_after_seconds,
    _sanitize_history,
)

_passed = 0


def check(name, cond, detail=""):
    global _passed
    assert cond, f"FAIL: {name} {detail}"
    _passed += 1
    print(f"  ✓ {name}")


# ── _sanitize_history: 정제 ──────────────────────────────────
h = _sanitize_history([
    {"role": "user", "content": "안녕"},
    {"role": "system", "content": "무시돼야 함"},
    {"role": "assistant", "content": "  "},
    {"role": "assistant", "content": "개선안"},
    {"content": "role 없음"},
])
check("정제: user/assistant 만·빈 내용 제외", [x["role"] for x in h] == ["user", "assistant"])
check("정제: 내용 보존", h[1]["content"] == "개선안")
check("빈 입력 관용", _sanitize_history(None) == [] and _sanitize_history([]) == [])

# ── _sanitize_history: 예산 컷 ───────────────────────────────
# 턴당 2,000자 × 10턴 = 20,000자 → 예산(6,000자) 안의 최신 3턴만 남아야 함
long_hist = [{"role": ("user" if i % 2 == 0 else "assistant"), "content": f"{i}:" + "가" * 1998}
             for i in range(10)]
h = _sanitize_history(long_hist)
check("예산 컷: 최신 턴 우선 유지", [x["content"][:2] for x in h] == ["7:", "8:", "9:"],
      f"got {[x['content'][:2] for x in h]}")
check("예산 컷: 총량이 예산 이하", sum(len(x["content"]) for x in h) <= _HISTORY_CHAR_BUDGET)

# 가장 최근 턴이 단독으로 예산을 넘어도 반드시 유지(내용은 안 자름 — verbatim 보호)
h = _sanitize_history([
    {"role": "user", "content": "옛날 턴"},
    {"role": "assistant", "content": "나" * (_HISTORY_CHAR_BUDGET + 1000)},
])
check("최근 턴은 예산 초과여도 유지", len(h) == 1 and len(h[0]["content"]) == _HISTORY_CHAR_BUDGET + 1000)

# 예산 안이면 전부 유지
h = _sanitize_history([{"role": "user", "content": "짧은 턴"}] * 5)
check("예산 안이면 전부 유지", len(h) == 5)


# ── _retry_after_seconds ─────────────────────────────────────
def fake_err(msg="", retry_after=None):
    e = Exception(msg)
    e.response = SimpleNamespace(headers={"retry-after": retry_after} if retry_after else {})
    return e


check("헤더 우선", _retry_after_seconds(fake_err("무관", retry_after="12.5")) == 12.5)
check("메시지 초 단위", _retry_after_seconds(fake_err("Please try again in 7.66s")) == 7.66)
check("메시지 분+초 단위", _retry_after_seconds(fake_err("try again in 2m59.56s")) == 179.56)
check("추출 실패 시 기본 8초", _retry_after_seconds(fake_err("알 수 없는 에러")) == 8.0)

# ── _needs_long_context ──────────────────────────────────────
# 토큰 추정은 실측 보정 계수(한글 ≈ 1tok/자) 기준 — 2026-07-23. TPM 12k에서
# 'verbatim 재인용 가능' 경계는 SYSTEM_PROMPT 크기에 직접 좌우된다.
# 2026-07-31: 규약 v3 추가로 SYSTEM_PROMPT가 4,091토큰이 되며 경계가 약 1,500자로 내려왔다.
# (2,323토큰 축소본은 경계를 2,500자로 회복시켰으나 핵심 행동이 회귀해 되돌림 — WORKLOG 참조)
M70 = "llama-3.3-70b-versatile"   # TPM 12,000
ctxs = [{"text": "기법 설명 " * 100} for _ in range(5)]   # 기법 5개 ≈ 3,000자

check("짧은 입력은 Groq 유지", not _needs_long_context("블로그 글 프롬프트 만들어줘", ctxs, [], M70))
# 30,000자 회의록 → 입력만으로 TPM 초과, verbatim 출력도 불가 → Gemini
check("장문 원문은 Gemini 라우팅", _needs_long_context("회의록 요약해줘: " + "가" * 30000, ctxs, [], M70))
# 경계 확인: 필요 출력(원문 재인용)이 남는 예산을 넘어서는 지점부터 라우팅
check("1,500자 원문은 Groq 유지", not _needs_long_context("나" * 1500, ctxs, [], M70))
check("2,000자 원문은 Gemini 라우팅", _needs_long_context("나" * 2000, ctxs, [], M70))
check("4,000자 원문은 Gemini 라우팅", _needs_long_context("나" * 4000, ctxs, [], M70))

print(f"\n전부 통과 ({_passed}개)")

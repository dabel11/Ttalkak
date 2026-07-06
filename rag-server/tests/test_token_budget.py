"""
tests/test_token_budget.py
────────────────────────────────────────────────────────────
GroqGenerator._fit_max_tokens 단위 테스트 (API 호출 없음).
Groq 무료 티어는 요청 크기를 '입력 + max_tokens(출력 예약)'로 계산하므로,
입력이 길수록 출력 예약을 줄여 413(Request too large)을 예방해야 한다.

실행: python3 -m tests.test_token_budget
"""

from app.rag.generator import GroqGenerator

fit = GroqGenerator._fit_max_tokens
M70 = "llama-3.3-70b-versatile"   # TPM 12,000
M8  = "llama-3.1-8b-instant"      # TPM 6,000

_passed = 0


def check(name, cond, detail=""):
    global _passed
    assert cond, f"FAIL: {name} {detail}"
    _passed += 1
    print(f"  ✓ {name}")


def msgs(chars: int):
    return [{"role": "system", "content": "s" * (chars // 2)},
            {"role": "user", "content": "u" * (chars - chars // 2)}]


# 짧은 입력 → 요청값 그대로
check("70b 짧은 입력은 4096 유지", fit(M70, msgs(3000), 4096) == 4096)

# 8b + 표준 입력(SYSTEM+기법 ≈ 1.1만자 → ~3.8k tok) → 예산으로 축소, 하한 위
v = fit(M8, msgs(11000), 4096)
check("8b 표준 입력은 예산 내 축소", 512 <= v < 4096, f"got {v}")
check("8b: 입력+예약이 TPM 이하", (11000 // 3 + 100) + v + 200 <= 6000, f"got {v}")

# 70b + 긴 원문(3만자 ≈ 10k tok) → 크게 축소되지만 하한 512 보장
v = fit(M70, msgs(30000), 4096)
check("70b 긴 원문 축소·하한 보장", v == max(512, 12000 - (30000 // 3 + 100) - 200), f"got {v}")

# 입력이 TPM을 이미 초과 → 하한 512 (요청은 실패하겠지만 음수/0 방지)
check("입력 초과 시 하한 512", fit(M8, msgs(60000), 4096) == 512)

# 미지 모델 → 70b 예산으로 폴백
check("미지 모델은 12k 예산", fit("unknown-model", msgs(3000), 4096) == 4096)

# content None 관용
check("content None 관용", fit(M70, [{"role": "user", "content": None}], 4096) == 4096)

print(f"\n전부 통과 ({_passed}개)")

"""
tests/test_token_budget.py
────────────────────────────────────────────────────────────
_est_tokens(스크립트별 토큰 추정) + GroqGenerator._fit_max_tokens 단위 테스트 (API 호출 없음).
Groq 무료 티어는 요청 크기를 '입력 + max_tokens(출력 예약)'로 계산하므로,
입력이 길수록 출력 예약을 줄여 413(Request too large)을 예방해야 한다.

추정 계수는 2026-07-23 usage.prompt_tokens 실측으로 보정 — 한국어 0.9~1.7 chars/tok
(종전 chars//3 은 한국어를 최대 2.3배 과소추정). '과소추정 금지' 방향으로 맞춤.

실행: python3 -m tests.test_token_budget
"""

from app.rag.generator import SYSTEM_PROMPT, GroqGenerator, _est_tokens

fit = GroqGenerator._fit_max_tokens
M70 = "llama-3.3-70b-versatile"   # TPM 12,000
M8  = "llama-3.1-8b-instant"      # TPM 6,000

_passed = 0


def check(name, cond, detail=""):
    global _passed
    assert cond, f"FAIL: {name} {detail}"
    _passed += 1
    print(f"  ✓ {name}")


def est_msgs(msgs):
    return sum(_est_tokens(m.get("content") or "") for m in msgs) + 100


# ── _est_tokens: 실측 대비 과소추정 금지 (2026-07-23 usage.prompt_tokens) ──
_KO_FORMAL = ("오늘 회의에서는 신규 결제 모듈 일정에 대해 논의했습니다. 개발팀은 유월 말까지 "
              "큐에이를 시작하는 것에 합의했으며, 디자인 시안은 다음 주 화요일까지 전달하기로 했습니다. ") * 8
_KO_CASUAL = ("임영웅 콘서트 인스타 홍보 문구 프롬프트 만들어줘. 7월 15일이고 티켓은 4만 5천원이야. "
              "새 앨범 곡 위주로 흥미진진하게 부탁해. ") * 10
_EN_PROSE  = ("The quarterly report shows steady growth in user engagement metrics across all "
              "product lines, with particular strength in the mobile segment. ") * 8

# SYSTEM_PROMPT 실측 기준선 이력: 2,766 → 4,091(규약 v3 추가, 2026-07-31).
# ⚠️ 축소 시도(2,323tok, −43%)는 이어폰 빈칸 0/3·verbatim 1/3 회귀로 **되돌렸다** — WORKLOG 참조.
# 프롬프트를 고칠 때마다 usage.prompt_tokens 로 다시 재고 이 상수를 갱신할 것 —
# 추정치로 대체하면 이 테스트(과소추정 금지)의 의미가 사라진다.
check("실측 하한: 시스템프롬프트(4091tok)", _est_tokens(SYSTEM_PROMPT) >= 4091,
      f"got {_est_tokens(SYSTEM_PROMPT)}")
check("실측 하한: 한국어 문어체(461tok)", _est_tokens(_KO_FORMAL) >= 461)
check("실측 하한 근접: 한국어 구어체(596tok, −5% 허용)", _est_tokens(_KO_CASUAL) >= 596 * 0.95,
      f"got {_est_tokens(_KO_CASUAL)}")
check("실측 하한: 영어 산문(220tok)", _est_tokens(_EN_PROSE) >= 220)
check("과대추정 상한 40%", all(
    _est_tokens(t) <= m * 1.40
    for t, m in [(SYSTEM_PROMPT, 4091), (_KO_FORMAL, 461), (_KO_CASUAL, 596), (_EN_PROSE, 220)]))
check("빈 문자열 0", _est_tokens("") == 0)


# ── _fit_max_tokens ──────────────────────────────────────────
def msgs(text: str):
    return [{"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text}]


# 짧은 입력 → 요청값 그대로 (SYSTEM ~3.3k + 짧은 질의로도 12k 예산에 4096 여유)
check("70b 짧은 입력은 4096 유지", fit(M70, msgs("블로그 글 프롬프트 만들어줘"), 4096) == 4096)

# 70b + 한국어 원문 5,000자 → 예산 내 축소, 하한 위
m = msgs("회의록 요약: " + "가" * 5000)
v = fit(M70, m, 4096)
check("70b 한국어 장문은 예산 내 축소", 512 <= v < 4096, f"got {v}")
check("70b: 추정입력+예약이 TPM 이하", est_msgs(m) + v + 200 <= 12000, f"got {v}")

# 8b 는 SYSTEM 만으로도 예산 태반 소진 → 하한 512 보장
v = fit(M8, msgs("짧은 질문"), 4096)
check("8b 표준 입력도 하한 512 이상", v >= 512, f"got {v}")

# 입력이 TPM 을 크게 초과 → 하한 512 (음수/0 방지)
check("입력 초과 시 하한 512", fit(M8, msgs("가" * 60000), 4096) == 512)

# 미지 모델 → 70b 예산(12k)으로 폴백
check("미지 모델은 12k 예산", fit("unknown-model", msgs("짧은 질문"), 4096) == 4096)

# content None 관용
check("content None 관용", fit(M70, [{"role": "user", "content": None}], 4096) == 4096)

print(f"\n전부 통과 ({_passed}개)")

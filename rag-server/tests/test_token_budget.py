"""
tests/test_token_budget.py
────────────────────────────────────────────────────────────
_est_tokens(스크립트별 토큰 추정) + GroqGenerator._fit_max_tokens 단위 테스트 (API 호출 없음).
Groq 무료 티어는 요청 크기를 '입력 + max_tokens(출력 예약)'로 계산하므로,
입력이 길수록 출력 예약을 줄여 413(Request too large)을 예방해야 한다.

추정 계수는 2026-09-20 gpt-oss usage.prompt_tokens 실측으로 재보정(종전 2026-07-23 은 llama 기준).
사용자 입력은 보수 계수(`_est_tokens`), 우리가 쓴 고정 입력은 보정 계수(`_est_known_tokens`) —
둘 다 '과소추정 금지'. 고정 입력 계수의 코퍼스 전량 근거는 eval/token_calib.py --corpus.

실행: python3 -m tests.test_token_budget
"""

from app.rag.generator import SYSTEM_PROMPT, GroqGenerator, _est_known_tokens, _est_tokens

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


# ── _est_tokens: gpt-oss 실측 대비 과소추정 금지 (2026-09-20 usage.prompt_tokens) ──
# 값은 gpt-oss-20b(120b 와 같은 o200k 토크나이저)의 prompt_tokens 에서 대화 템플릿
# 오버헤드(1메시지 71토큰)를 뺀 본문 토큰. 측정: eval/token_calib.py 와 같은 방식.
# 종전 값(SYSTEM 4,091 · 문어체 461 …)은 폐기된 llama 토크나이저 실측이었다.
_KO_FORMAL = ("오늘 회의에서는 신규 결제 모듈 일정에 대해 논의했습니다. 개발팀은 유월 말까지 "
              "큐에이를 시작하는 것에 합의했으며, 디자인 시안은 다음 주 화요일까지 전달하기로 했습니다. ") * 8
_KO_CASUAL = ("임영웅 콘서트 인스타 홍보 문구 프롬프트 만들어줘. 7월 15일이고 티켓은 4만 5천원이야. "
              "새 앨범 곡 위주로 흥미진진하게 부탁해. ") * 10
_EN_PROSE  = ("The quarterly report shows steady growth in user engagement metrics across all "
              "product lines, with particular strength in the mobile segment. ") * 8
_JA = ("本日の会議では新しい決済モジュールのスケジュールと品質保証の範囲について議論しました。六月末までにテストを開始することで合意し、"
       "決済失敗時の再試行は三回までに制限します。マーケティング部は来週水曜日までに告知文の草案を共有する予定です。") * 5
import json as _json  # noqa: E402
_JSON = _json.dumps({"rows": [{"id": i, "name": f"상품{i}", "price": i * 1000, "tags": ["신상", "할인", f"#{i}"],
                               "ok": i % 2 == 0} for i in range(40)]}, ensure_ascii=False)

# 사용자 입력용(보수) — 문체를 모르므로 최악(구어체·고유명사 1.0 토큰/글자)도 덮어야 한다
for name, text, actual in [("한국어 문어체", _KO_FORMAL, 417), ("한국어 구어체·고유명사(최악)", _KO_CASUAL, 571),
                           ("영어 산문", _EN_PROSE, 185), ("일본어(종전 추정기는 과소추정)", _JA, 421),
                           ("JSON·기호", _JSON, 1563)]:
    check(f"사용자 입력 과소추정 없음: {name}({actual}tok)", _est_tokens(text) >= actual,
          f"got {_est_tokens(text)}")

# 고정 입력용(보정) — SYSTEM_PROMPT 실측 3,857(본문). ⚠️ 프롬프트를 고치면 다시 재고 갱신할 것 —
# 추정치로 대체하면 이 테스트(과소추정 금지)의 의미가 사라진다. 코퍼스 전량 검증은 token_calib --corpus.
# 이력: llama 2,766 → 4,091(규약 v3) · gpt-oss 3,857(2026-09-20). ⚠️ 축소 시도(−43%)는 회귀로 되돌렸다.
_SYSTEM_ACTUAL = 3857
check("고정 입력: SYSTEM_PROMPT 과소추정 없음", _est_known_tokens(SYSTEM_PROMPT) >= _SYSTEM_ACTUAL,
      f"got {_est_known_tokens(SYSTEM_PROMPT)}")
check("고정 입력: SYSTEM_PROMPT 과대추정 5% 이내(예산 낭비 방지)",
      _est_known_tokens(SYSTEM_PROMPT) <= _SYSTEM_ACTUAL * 1.05, f"got {_est_known_tokens(SYSTEM_PROMPT)}")
check("보정 계수는 사용자 입력에 쓰면 안 된다(구어체를 과소추정)", _est_known_tokens(_KO_CASUAL) < 571)
check("빈 문자열 0", _est_tokens("") == 0 and _est_known_tokens("") == 0)

# 출처별 추정: 질의는 보수, SYSTEM·기법 블록은 보정
_ctx = [{"text": "Role Prompting — 역할을 부여해 전문성을 끌어낸다.", "metadata": {"technique": "Role Prompting"}}]
_est_q = GroqGenerator.estimate_input(_KO_CASUAL, _ctx)
_est_empty = GroqGenerator.estimate_input("", _ctx)
check("estimate_input: 질의 몫은 보수 추정", _est_q - _est_empty == _est_tokens(_KO_CASUAL),
      f"got {_est_q - _est_empty}")
check("estimate_input: 운영 규모 입력에서 전량 보수 추정보다 작다(예산 회복)",
      _est_q < sum(_est_tokens(m["content"]) for m in GroqGenerator.build_messages(_KO_CASUAL, _ctx)) + 100)


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

# est_input 을 주면 그 값으로 산정(generate 는 출처별 추정을 넘긴다)
check("est_input 우선", fit("openai/gpt-oss-120b", msgs("x"), 4096, est_input=5500) == 8000 - 5500 - 200)


print(f"\n전부 통과 ({_passed}개)")

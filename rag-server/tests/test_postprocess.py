"""
tests/test_postprocess.py
────────────────────────────────────────────────────────────
파싱·복원 순수 함수 단위 테스트. 모드 판정(=Execute 버튼 노출)이 이 함수들에
걸려 있으므로, 프롬프트/파서를 바꿀 때마다 이 테스트로 회귀를 잡는다.

실행 (rag-server/ 에서, 모델·DB·LLM 불필요 · 1초 이내):
    python3 -m tests.test_postprocess
"""

from app.rag.postprocess import (
    parse_generation, build_answer,
    extract_improved_prompt, extract_applied_techniques, extract_changes,
)

_passed = 0


def check(name: str, cond: bool, detail: str = ""):
    global _passed
    assert cond, f"FAIL: {name} {detail}"
    _passed += 1
    print(f"  ✓ {name}")


# ── parse_generation ─────────────────────────────────────────
check("JSON improve 파싱",
      parse_generation('{"mode":"improve","improved_prompt":"X를 작성하라","score":8}')["mode"] == "improve")
check("코드펜스·잡담 관용",
      parse_generation('설명입니다\n```json\n{"mode":"ask","questions":["뭘?"]}\n```')["mode"] == "ask")
check("mode 없는 JSON 거부", parse_generation('{"foo": 1}') is None)
check("mode 값 이상 거부", parse_generation('{"mode":"banana"}') is None)
check("비JSON 거부", parse_generation("그냥 마크다운 응답") is None)
check("빈 입력 거부", parse_generation("") is None)
check("깨진 JSON 거부", parse_generation('{"mode":"improve", 깨짐') is None)

# ── build_answer: ask 모드 ───────────────────────────────────
ask = {"mode": "ask", "summary": "주제가 없어요", "questions": ["무슨 글?", "누구에게?"]}
ans_ask = build_answer(ask)
check("ask 헤더", ans_ask.startswith("**확인이 필요해요 🤔**"))
check("ask 질문 bullet", "• 무슨 글?" in ans_ask and "• 누구에게?" in ans_ask)
check("ask엔 개선 블록 없음", "개선된 프롬프트" not in ans_ask)
check("ask → extract 빈 문자열(버튼 숨김)", extract_improved_prompt(ans_ask) == "")

# ── build_answer: improve 모드 + 왕복 호환 ───────────────────
imp = {
    "mode": "improve",
    "improved_prompt": "너는 요약 전문가다.\n아래 회의록을 3줄로 요약하라.\n---\n[회의록]\n결제모듈 QA 합의",
    "techniques": [{"name": "Length Control", "reason": "3줄 제한"}, {"name": "Role Prompting"}],
    "changes": ["역할 부여", "분량 명시"],
    "score": 8,
}
ans_imp = build_answer(imp)
check("improve 마커 존재", "**개선된 프롬프트:**" in ans_imp and "**적용한 기법:**" in ans_imp)

# 핵심 계약: 복원한 마크다운을 레거시 추출기에 넣으면 improved_prompt가 그대로 나와야 한다
# (JSON 경로와 폴백 경로가 같은 표시 형식을 공유함을 보장 — history 왕복·구캐시 호환)
check("왕복: extract(build(p)) == improved_prompt",
      extract_improved_prompt(ans_imp) == imp["improved_prompt"],
      f"\n   got={extract_improved_prompt(ans_imp)!r}")
check("왕복: 원문 속 '---' 보존", "---\n[회의록]" in extract_improved_prompt(ans_imp))
check("왕복: techniques 추출", extract_applied_techniques(ans_imp) == ["Length Control", "Role Prompting"])
check("왕복: changes 추출", extract_changes(ans_imp) == ["- 역할 부여", "- 분량 명시"]
      or extract_changes(ans_imp) == ["역할 부여", "분량 명시"])

# ── 레거시 추출기 자체 케이스 ────────────────────────────────
legacy = ("---\n**개선된 프롬프트:**\n\n너는 번역가다. 아래를 번역하라.\n\n---\n"
          "**적용한 기법:**\n• Tone: 격식체\n\n**개선 포인트:**\n어조 지정\n---")
check("레거시 추출", extract_improved_prompt(legacy) == "너는 번역가다. 아래를 번역하라.")
check("레거시 기법", extract_applied_techniques(legacy) == ["Tone"])
check("마커 없으면 빈 값", extract_improved_prompt("일반 텍스트") == "")

# ── 결손 필드 관용 ───────────────────────────────────────────
check("improve 필드 결손 관용", "**개선된 프롬프트:**" in build_answer({"mode": "improve"}))
check("ask 필드 결손 관용", build_answer({"mode": "ask"}).startswith("**확인이"))

print(f"\n전부 통과 ({_passed}개)")

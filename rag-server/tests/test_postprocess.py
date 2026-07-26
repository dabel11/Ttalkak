"""
tests/test_postprocess.py
────────────────────────────────────────────────────────────
파싱·복원 순수 함수 단위 테스트. 모드 판정(=Execute 버튼 노출)이 이 함수들에
걸려 있으므로, 프롬프트/파서를 바꿀 때마다 이 테스트로 회귀를 잡는다.

실행 (rag-server/ 에서, 모델·DB·LLM 불필요 · 1초 이내):
    python3 -m tests.test_postprocess
"""

from app.rag.postprocess import (
    parse_generation, build_answer, assemble_fields,
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
check("ask 필요정보 안내 문구(방식1 강화)", "아래 정보를 알려주시면" in ans_ask)
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

# ── assemble_fields: /query 응답 계약 (mode·questions·summary 통과 보장) ──────
# 이 함수가 질문 모드의 questions/summary 를 떨어뜨리면 프론트가 answer 마크다운을
# 되파싱해야 하는 회귀가 난다(최재원 2026-07-12 지적). 아래로 그 회귀를 잡는다.
f_ask = assemble_fields(
    '{"mode":"ask","improved_prompt":"","summary":"주제가 비어 무엇을 쓸지 모름",'
    '"questions":["어떤 주제?","독자는 누구?"],"techniques":[],"changes":[],"score":null}'
)
check("ask: mode 통과", f_ask["mode"] == "ask")
check("ask: questions 구조화 통과", f_ask["questions"] == ["어떤 주제?", "독자는 누구?"])
check("ask: summary 통과", f_ask["summary"] == "주제가 비어 무엇을 쓸지 모름")
check("ask: improved_prompt 비움(Execute 숨김)", f_ask["improved_prompt"] == "")
check("ask: 구조화 플래그", f_ask["structured"] is True)
check("ask: answer 마크다운도 보존(폴백 렌더)", "• 어떤 주제?" in f_ask["answer"])

f_imp = assemble_fields(
    '{"mode":"improve","improved_prompt":"너는 카피라이터다. …광고 문구를 작성하라.",'
    '"techniques":[{"name":"Role Prompting","reason":"역할 부여"}],'
    '"changes":["역할 명시"],"score":7,"summary":"역할·형식 보강","questions":[]}'
)
check("improve: mode 통과", f_imp["mode"] == "improve")
check("improve: questions 비움", f_imp["questions"] == [])
check("improve: improved_prompt 채움", f_imp["improved_prompt"].startswith("너는 카피라이터다."))
check("improve: score 정수", f_imp["score"] == 7)
check("improve: summary 통과", f_imp["summary"] == "역할·형식 보강")

# 폴백(JSON 파싱 실패): 개선 블록 유무로 mode 추정, questions/summary 는 빈 값
f_fb_imp = assemble_fields("---\n**개선된 프롬프트:**\n\n너는 번역가다. 번역하라.\n\n---\n**적용한 기법:**\n• Tone")
check("폴백 improve: mode 추정", f_fb_imp["mode"] == "improve" and not f_fb_imp["structured"])
check("폴백 improve: improved_prompt 추출", f_fb_imp["improved_prompt"] == "너는 번역가다. 번역하라.")
f_fb_ask = assemble_fields("**확인이 필요해요 🤔**\n주제가 없어요\n• 무슨 글을 원하세요?")
check("폴백 ask: 개선블록 없으면 ask", f_fb_ask["mode"] == "ask" and f_fb_ask["questions"] == [])
check("폴백 ask: answer 원문 보존", "무슨 글을 원하세요?" in f_fb_ask["answer"])

print(f"\n전부 통과 ({_passed}개)")

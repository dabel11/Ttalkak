"""
app/core/gate.py
────────────────────────────────────────────────────────────
'무근거(무의미 입력)' 판정 순수 함수. app.main 이 import 해서 쓴다.

여기로 분리한 이유: 판정 로직은 임베딩/DB/torch 와 무관한 순수 함수인데, app.main 에
두면 테스트가 app.main(=uvicorn·bge-m3·MySQL) 을 끌어와 CI 에서 실패한다
(requirements-test.txt 규칙). 로직은 그대로, 임포트 비용만 없앴다.
"""


def no_evidence_gate(retrieved: list[dict], examples: list[dict],
                     history: list, gate_min_score: float,
                     examples_enabled: bool = True) -> bool:
    """첫 턴 '무근거(무의미 입력)' 판정 — 생성 전에 404 로 돌릴지.

    예시 코퍼스(prompt_examples)는 쿼리와 같은 한국어 말투라 관련/무관을 깨끗이 분리한다
    (실측 AUC 1.000). 기법 코퍼스는 영문 정의체라 분리 불가(AUC 0.694) — 종전엔 그걸로 판정해
    무의미 입력이 통과(https://example.com)하고 정상 요청이 404 나는 두 오류가 같이 났다.

    - gate_min_score>0 & 예시 활성: 예시 최고점 < 임계치면 무근거(예시 비면 최고점 0 → 무근거).
      예시 cut(example_min_score)이 임계치보다 낮아야 경계 구간을 본다(기본 0.40 < 0.53).
    - 그 외(게이트 off 또는 예시 비활성): 종전 '기법 0건' 규칙으로 폴백.
    후속 턴(history 있음)은 대화 맥락으로 잇는다 — 판정하지 않는다."""
    if history:
        return False
    if gate_min_score > 0 and examples_enabled:
        best = max((e.get("score", 0.0) for e in examples), default=0.0)
        return best < gate_min_score
    return not retrieved

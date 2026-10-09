"""
eval/requirement_judge.py
────────────────────────────────────────────────────────────
요구사항 충족률(기준 1)·정확성(gold)을 judge 로 판정한다. 결과물 하나에 호출 1회.

평가셋 문항의 `requirements`(원래 요청을 예/아니오로 쪼갠 것)와 `gold`(객관적 정답 요소)를
번호 붙은 질문으로 한꺼번에 묻고, 질문마다 yes / no / na 와 **결과물에서 인용한 근거**를 받는다.
- na 는 조건부 정답 항목(`conditional: true`)에만 허용한다 — 조건이 성립하지 않을 때.
- 결과물 속 자리표시자는 가린다(eval/placeholders.mask) — '[회사명]'이 요구사항 판정을 흔들지 않게.

⚠️ 아직 사람 대조 검증 전이다(WORKLOG 2026-09-20). 이 판정으로 낸 충족률은 잠정치다.
"""

import json
import re

from eval.placeholders import PLACEHOLDER_MASK, mask

JUDGE_VERSION = "req-v1"      # 프롬프트를 고치면 올린다 — 캐시·결과 파일이 옛 판정을 섞지 않게

_SYSTEM = f"""너는 AI 결과물이 사용자 요청을 충족했는지 판정하는 엄격하고 공정한 평가자다.
번호 붙은 질문마다 결과물을 보고 yes / no / na 로 답한다.

규칙:
- 질문이 묻는 것만 본다. 문체·길이·완성도 같은 다른 품질로 답을 바꾸지 않는다. 길다고 yes 가 아니다.
- yes 는 결과물에 그 내용이 **실제로 있을 때만**. 애매하거나 일부만 있으면 no.
- 분량·줄 수·문장 수를 묻는 질문은 머리말('다음은 ~입니다')과 맺음말 한 줄을 세지 않는다.
- na 는 질문에 '(조건부)' 표시가 있고 그 조건이 결과물에 해당하지 않을 때만 쓴다. 그 밖에는 쓰지 않는다.
- 결과물 속 {PLACEHOLDER_MASK} 는 나중에 채우라고 남긴 빈자리다. 그 자리에 들어가야 할 내용을 묻는 질문이면 no.
- evidence 에는 판단 근거가 된 결과물 부분을 짧게(30자 이내) 그대로 인용한다. 없으면 "없음".

반드시 아래 JSON 한 개만 출력:
{{"answers": [{{"id": "<질문 번호>", "verdict": "yes"|"no"|"na", "evidence": "<인용>"}}, ...]}}"""


def build_questions(item: dict) -> list[dict]:
    """평가셋 문항 → 질문 목록 [{id, kind, text, subjective, conditional}]."""
    qs = []
    for i, r in enumerate(item.get("requirements", []), 1):
        qs.append({"id": f"r{i}", "kind": "requirement", "text": r["text"],
                   "subjective": bool(r.get("subjective")), "conditional": False})
    for i, g in enumerate(item.get("gold", []), 1):
        qs.append({"id": f"g{i}", "kind": "gold", "text": g["text"],
                   "subjective": False, "conditional": bool(g.get("conditional"))})
    return qs


def build_user_message(item: dict, output: str, questions: list[dict]) -> str:
    lines = []
    for q in questions:
        tag = " (조건부)" if q["conditional"] else ""
        lines.append(f"{q['id']}. {q['text']}{tag}")
    return (f"[사용자 요청]\n{item['query']}\n\n"
            f"[결과물]\n{mask(output)}\n\n"
            f"[질문]\n" + "\n".join(lines))


def parse_answers(raw: str, questions: list[dict]) -> dict:
    """judge 응답 → {id: {verdict, evidence}}. 빠진 질문·허용 안 된 na 는 오류 목록으로 돌려준다."""
    m = re.search(r"\{.*\}", raw or "", re.S)
    try:
        data = json.loads(m.group(0)) if m else {}
    except json.JSONDecodeError:
        data = {}
    by_id = {}
    for a in data.get("answers", []) if isinstance(data, dict) else []:
        if isinstance(a, dict) and a.get("id") is not None:
            by_id[str(a["id"]).strip().rstrip(".")] = a
    answers, errors = {}, []
    for q in questions:
        a = by_id.get(q["id"])
        v = str((a or {}).get("verdict", "")).strip().lower()
        if v not in ("yes", "no", "na"):
            errors.append(f"{q['id']}: 답 없음/형식 오류")
            continue
        if v == "na" and not q["conditional"]:
            errors.append(f"{q['id']}: 조건부가 아닌데 na")
            continue
        answers[q["id"]] = {"verdict": v, "evidence": str((a or {}).get("evidence", ""))[:80]}
    return {"answers": answers, "errors": errors}


def judge_requirements(client, model: str, item: dict, output: str,
                       reasoning_effort: str = "low", max_tokens: int = 1500) -> dict:
    """judge 1회 호출. 반환: {answers, errors, questions, version}."""
    questions = build_questions(item)
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": _SYSTEM},
                  {"role": "user", "content": build_user_message(item, output, questions)}],
        max_tokens=max_tokens,
        reasoning_effort=reasoning_effort,
        response_format={"type": "json_object"},
        temperature=0.0,
    )
    parsed = parse_answers(resp.choices[0].message.content or "", questions)
    return {**parsed, "questions": questions, "version": JUDGE_VERSION}


def rates(result: dict) -> dict:
    """판정 → 비율. 요구사항은 주관 항목을 빼고(주 지표) / 주관 항목만 따로. na·오류는 분모에서 뺀다."""
    def rate(kind: str, subjective: bool | None) -> float | None:
        vs = [result["answers"][q["id"]]["verdict"] for q in result["questions"]
              if q["kind"] == kind and (subjective is None or q["subjective"] == subjective)
              and q["id"] in result["answers"] and result["answers"][q["id"]]["verdict"] != "na"]
        return (sum(v == "yes" for v in vs) / len(vs)) if vs else None
    return {
        "requirement_rate": rate("requirement", False),
        "subjective_rate": rate("requirement", True),
        "gold_rate": rate("gold", None),
    }

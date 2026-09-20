"""
postprocess.py
────────────────────────────────────────────────────────────
생성 결과의 파싱·복원 순수 함수 모음 (모델·DB 의존 없음 → 단독 테스트 가능).

- parse_generation : LLM의 구조화 JSON 출력을 관대하게 파싱
- build_answer     : JSON → 기존 화면 표시용 마크다운 복원
- extract_*        : 레거시 마크다운 정규식 추출 (JSON 파싱 실패 시 폴백)

main.py 의 run_generation() 이 이들을 조합한다. eval 스크립트와의 하위호환을 위해
main.py 가 동일 이름으로 재노출(re-export)한다.
"""

import json
import re


# ── 구조화 JSON 경로 ─────────────────────────────────────────
def parse_generation(raw: str) -> dict | None:
    """LLM 출력에서 구조화 JSON을 관대하게 파싱.
    mode 필드가 있는 유효 객체면 dict, 아니면 None(→ 레거시 정규식 폴백)."""
    if not raw:
        return None
    m = re.search(r"\{.*\}", raw, re.DOTALL)   # 코드펜스·앞뒤 잡담 허용
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except Exception:
        return None
    if not isinstance(obj, dict) or obj.get("mode") not in ("improve", "ask"):
        return None
    return obj


def normalize_questions(raw_questions) -> list[dict]:
    """questions 를 객체 배열 {field, question, reason, importance} 로 정규화.

    규약 v3 §10: questions 는 객체 배열이다(field 로 빈칸·답변과 1:1 연결).
    구형(문자열 배열) 출력도 그대로 받아 객체로 승격한다 — 모델이 옛 형식을 내도
    깨지지 않게. 프론트(normalizeMessageQuestions)도 양쪽을 받으므로 하위호환.
    """
    if not isinstance(raw_questions, list):
        return []
    out: list[dict] = []
    for i, q in enumerate(raw_questions, 1):
        if isinstance(q, str):
            text = q.strip()
            if not text:
                continue
            # 구형 "항목명: 질문 …" 형식이면 앞의 항목명을 field 로 승격
            field = ""
            head, sep, _rest = text.partition(":")
            if sep and 0 < len(head.strip()) <= 20:
                field = head.strip()
            out.append({"field": field, "question": text,
                        "reason": "", "importance": "recommended"})
            continue
        if not isinstance(q, dict):
            continue
        text = str(q.get("question") or q.get("text") or "").strip()
        if not text:
            continue
        importance = str(q.get("importance") or "recommended").strip().lower()
        if importance not in ("required", "recommended"):
            importance = "recommended"
        out.append({
            "field":      str(q.get("field") or q.get("name") or f"question_{i}").strip(),
            "question":   text,
            "reason":     str(q.get("reason") or "").strip(),
            "importance": importance,
        })
    return out


def normalize_techniques(raw) -> list[dict]:
    """모델이 낸 techniques 를 `[{"name", "reason"}]` 로 정규화한다.

    🔴 실측(2026-09-19 gen_set #3): 모델이 원소를 **문자열화된 JSON**으로 내는 경우가 있다 —
    `'{"name":"Checklist Prompting","reason":"…"}'`. 종전엔 그 문자열이 그대로 기법명이 되어
    화면에 원본 JSON 이 찍히고, 이름이 카드와 매칭되지 않아 `반영불가 기법 적용률` 의
    분모에만 들어갔다(과소집계). 빈 이름은 버린다 — 종전엔 빈 글머리표(`• `)가 남았다.

    표시용(build_answer)과 필드용(assemble_fields)이 **같은 변환**을 쓰도록 한 곳에 둔다.
    """
    out = []
    for t in raw or []:
        if not t:                      # None·""·[]·{} — 종전엔 "None" 같은 이름이 남았다
            continue
        if isinstance(t, str):
            stripped = t.strip()
            if stripped.startswith("{"):
                try:
                    t = json.loads(stripped)
                except ValueError:
                    pass
        if isinstance(t, dict):
            name, reason = str(t.get("name") or "").strip(), str(t.get("reason") or "").strip()
        else:
            name, reason = str(t).strip(), ""
        if name:
            out.append({"name": name, "reason": reason})
    return out


def build_answer(p: dict) -> str:
    """구조화 JSON → 기존 화면 표시용 마크다운 복원.
    익스텐션 UI·history 왕복(assistant 턴 저장) 형식을 기존과 동일하게 유지한다."""
    if p["mode"] == "ask":
        lines = ["**확인이 필요해요 🤔**"]
        if p.get("summary"):
            lines.append(str(p["summary"]))
        qs = normalize_questions(p.get("questions"))
        if qs:
            # '무엇을 채워야 하는지'를 명시 — 방식1(리스트) 강화. 문구에 '개선된 프롬프트'
            # 마커를 넣지 않아 extract_improved_prompt 가 이 블록을 오인하지 않는다.
            lines.append("아래 정보를 알려주시면 이어서 만들어 드릴게요:")
            lines += [f"• {q['question']}" for q in qs]   # 객체를 그대로 찍지 않는다
        return "\n".join(lines)

    parts = ["---", "**개선된 프롬프트:**", "", str(p.get("improved_prompt") or ""), "",
             "---", "**적용한 기법:**"]
    for t in normalize_techniques(p.get("techniques")):
        parts.append(f"• {t['name']}: {t['reason']}" if t["reason"] else f"• {t['name']}")
    changes = p.get("changes") or []
    if changes:
        parts += ["", "**개선 포인트:**"] + [f"- {c}" for c in changes]
    # 하이브리드(규약 v3 §5): improve 에도 선택 질문이 붙을 수 있다.
    # 개선안은 이미 실행 가능하고, 아래 질문은 '더 정확하게' 만들기 위한 선택지다.
    qs = normalize_questions(p.get("questions"))
    if qs:
        parts += ["", "**더 알려주시면 정확해져요 (선택):**"] + [f"- {q['question']}" for q in qs]
    parts.append("---")
    return "\n".join(parts)


def assemble_fields(raw: str) -> dict:
    """비어있지 않은 LLM 원문 → /query 응답 필드 dict (순수 함수 · 모델/DB/LLM 무관).

    구조화 JSON이 파싱되면 그대로 필드에 싣고(structured=True), 실패하면 레거시
    정규식으로 폴백한다(structured=False). main.run_generation() 이 LLM 호출 뒤
    이 함수만 부른다 → 계약(필드 조립) 로직을 LLM 없이 단위 테스트할 수 있는 지점.

    반환 키: mode, answer, improved_prompt, techniques_applied, changes, score,
             summary, questions, structured.
    - mode      : "improve" | "ask" — 프론트 분기의 단일 기준. 폴백은 개선프롬프트
                  블록 유무로 추정(있으면 improve, 없으면 ask).
    - summary   : 두 모드 공통(개선: 무엇을 개선했는지 / 질문: 파악내용+왜 묻는지)
    - questions : 질문 모드의 추가 질문 배열. 개선 모드·폴백은 []."""
    p = parse_generation(raw)
    if p is not None:
        improved = str(p.get("improved_prompt") or "") if p["mode"] == "improve" else ""
        techs = [t["name"] for t in normalize_techniques(p.get("techniques"))]
        score = p.get("score")
        return {
            "mode":               p["mode"],
            "answer":             build_answer(p),
            "improved_prompt":    improved.strip(),
            "techniques_applied": techs,
            "changes":            [str(c) for c in (p.get("changes") or [])],
            "score":              int(score) if isinstance(score, (int, float)) else None,
            "summary":            str(p.get("summary") or ""),
            # 규약 v3: 객체 배열로 보존(문자열 강제 변환 금지 — 프론트가 field 로 답변을 수집한다).
            # 하이브리드라 improve 모드에서도 비어있지 않을 수 있다.
            "questions":          normalize_questions(p.get("questions")),
            "structured":         True,
        }

    # 폴백: 모델이 JSON을 안 지킨 경우 — 원문을 그대로 표시하고 정규식으로 추출.
    # 질문 모드는 markdown에서 구조화 질문을 신뢰성 있게 복원할 수 없으므로 questions=[].
    # (answer 원문에는 질문 텍스트가 남아 있어 프론트가 그대로 렌더 가능 — 우아한 저하)
    improved_fb = extract_improved_prompt(raw)
    return {
        "mode":               "improve" if improved_fb.strip() else "ask",
        "answer":             raw,
        "improved_prompt":    improved_fb,
        "techniques_applied": extract_applied_techniques(raw),
        "changes":            extract_changes(raw),
        "score":              None,
        "summary":            "",
        "questions":          [],
        "structured":         False,
    }


# ── 레거시 정규식 경로 (폴백) ────────────────────────────────
def extract_improved_prompt(answer: str) -> str:
    """
    LLM 응답에서 '개선된 프롬프트' 섹션만 추출.
    포맷: **개선된 프롬프트:** ... --- **적용한 기법:**

    종료점은 구조 마커('적용한 기법'/'개선 포인트')를 우선 사용한다. 개선 프롬프트가
    사용자 원문(회의록·코드·마크다운 등)을 통째로 담으면서 그 안에 '---' 구분선이
    들어와도, 그 지점에서 잘리지 않게 하기 위함이다. (중간 '---'는 보존, 꼬리만 제거)

    응답이 '질문 모드'(개선 프롬프트 블록 없음)면 빈 문자열을 반환한다.
    → 프론트는 improved_prompt 가 비면 Execute 버튼을 숨긴다.
    """
    # 개선 프롬프트 블록(마커)이 없으면 질문 모드 → Execute 대상 없음
    if '개선된 프롬프트' not in answer:
        return ""

    # 1) '개선된 프롬프트' 헤더 위치 (볼드·콜론 유무 허용)
    header = re.search(r'\*\*\s*개선된 프롬프트\s*:?\s*\*\*|개선된 프롬프트\s*:',
                       answer, re.IGNORECASE)
    if not header:
        return ""
    body = answer[header.end():]

    # 2) 종료점 = 구조 마커(사용자 원문엔 등장하지 않음). 가장 먼저 나오는 것에서 끊는다.
    #    바 '---' 는 종료점으로 쓰지 않는다(원문에 포함될 수 있으므로).
    end = re.search(
        r'\n\s*\*\*\s*적용한\s*기법|\n\s*\*\*\s*개선\s*포인트'
        r'|\n\s*적용한\s*기법\s*[:：]|\n\s*개선\s*포인트\s*[:：]',
        body, re.IGNORECASE,
    )
    section = body[:end.start()] if end else body

    # 3) 앞쪽 구분선/공백, 꼬리 구분선('---')만 제거 (중간 '---'는 원문이므로 보존)
    section = re.sub(r'^\s*-{3,}\s*\n', '', section.lstrip('\n'))
    section = re.sub(r'\n\s*-{3,}\s*$', '', section.rstrip())
    return section.strip()


def extract_applied_techniques(answer: str) -> list[str]:
    """**적용한 기법:** 섹션에서 기법명만 추출 (bullet 첫 콜론 앞 토큰)."""
    m = re.search(
        r'\*\*적용한\s*기법[:\s]*\*\*\s*\n+(.*?)(?=\n\s*\*\*|\n\s*---|\Z)',
        answer, re.DOTALL | re.IGNORECASE,
    )
    if not m:
        return []
    techs = []
    for line in m.group(1).split('\n'):
        line = line.strip()
        if line and line[0] in ('•', '-', '*'):
            name = re.sub(r'^[•\-\*]\s*', '', line).split(':')[0].strip()
            if name:
                techs.append(name)
    return techs


def extract_changes(answer: str) -> list[str]:
    """**개선 포인트:** 섹션 텍스트를 줄 단위 리스트로 반환."""
    m = re.search(
        r'\*\*개선\s*포인트[:\s]*\*\*\s*\n+(.*?)(?=\n\s*\*\*|\n\s*---|\Z)',
        answer, re.DOTALL | re.IGNORECASE,
    )
    if not m:
        return []
    lines = [ln.strip() for ln in m.group(1).strip().splitlines() if ln.strip()]
    return lines

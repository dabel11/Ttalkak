"""
eval/halluc_eval.py
────────────────────────────────────────────────────────────
적대적 환각 평가 — "지어내고 싶게" 유도하는 입력만 모아(halluc_set.json)
개선안이 **사용자가 주지 않은 구체 사실**을 창작하는지 잰다.

기존 gen_eval 의 환각 측정이 약했던 점을 보완한다:
  · gen_set 은 mode 판정용이라 환각을 유도하도록 설계되지 않았다 → 적대적 셋 분리
  · judge(LLM) 단독은 관대하다 → **결정론적 사실 추출**을 1차 게이트로 두고 judge 를 2차로
  · temp 0.7 변동 → 케이스당 --runs 회 반복

판정 방식 (이중)
  ① 결정론적: 개선안에서 구체 사실 토큰(수치·단위·날짜·퍼센트·금액·출처표현·영문고유명사)을
     정규식으로 추출 → 사용자 입력(query+given)에 없고 `[…입력]` 빈칸 밖에 있으면 **환각 후보**.
     심각도 분리 — HIGH(금액·날짜·스펙수치·퍼센트·통계/출처·고유명사) / LOW(분량·문단수 등 형식 가정)
  ② LLM judge(선택, --judge): 후보를 문맥까지 보고 재확인(오탐 제거·누락 보강)

실행 (rag-server/ 에서):
    python -m eval.halluc_eval --runs 2
    python -m eval.halluc_eval --runs 3 --judge --sleep 20
"""

import argparse
import json
import os
import re
import time
from collections import defaultdict
from pathlib import Path

from app.main import retriever, run_generation

# ── 구체 사실 패턴 ────────────────────────────────────────────
# HIGH: 틀리면 '거짓'이 되는 값
_HIGH = {
    "금액":     r"\d{1,3}(?:,\d{3})+\s*원|\d+\s*만\s*원|\$\s?\d+(?:\.\d+)?",
    "퍼센트":   r"\d+(?:\.\d+)?\s*%",
    "날짜":     r"\d{4}\s*년\s*\d{1,2}\s*월(?:\s*\d{1,2}\s*일)?|\d{1,2}\s*월\s*\d{1,2}\s*일",
    "스펙수치": r"\d+(?:\.\d+)?\s*(?:시간|분|mAh|GB|TB|MB|Hz|kHz|dB|g|kg|mm|cm|km|인치|배|명|개월|년차)",
    "방수등급": r"IPX?\d{1,2}",
    "출처표현": r"연구(?:에|결과)|논문|저널|보고서에 따르면|조사에 따르면|통계청|WHO|하버드|스탠퍼드|서울대",
}
# LOW: 형식·분량 가정 (허용 — changes 로 노출되면 문제 아님)
_LOW = {
    "분량":  r"\d+\s*(?:자|단어|words?|글자|문단|줄|문장)",
}
# 영문 고유명사 후보(제품명·브랜드 창작 탐지): 대문자로 시작하는 2단어 이상 연쇄 또는 CamelCase
_PROPER = r"\b[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,})*\b"
_PROPER_STOP = {"AI", "API", "CTA", "SEO", "SNS", "USP", "CEO", "IT", "QA", "PM", "UX", "UI",
                "The", "This", "You", "Your", "For", "And", "With", "How", "Why", "What"}

_PLACEHOLDER = r"\[[^\]]*\]"      # [제품명 입력] 등 — 이 안의 내용은 환각 아님
_EXAMPLE = r"\(\s*예[:：][^)]*\)|\(\s*e\.g\.[^)]*\)"   # "(예: 990g)" — 예시 명시는 창작 아님
_HEADER = r"^\s*(?:#{1,6}\s+.*|\[[^\]]+\]\s*|[-*]?\s*[^:\n]{1,20}:\s*)$"  # 섹션 헤더·라벨 줄
# 금지·배제 지시문 안의 값은 '쓰지 말라'는 뜻이므로 창작이 아니다
# (실측: "'무조건 100% 수익' 같은 과장 표현은 배제하고" → 100% 를 환각으로 오판했음)
_NEGATION = r"배제|금지|피하|삼가|하지\s*마|쓰지\s*마|말\s*것|없이|지양"

# 기법 이름은 RAG 코퍼스에서 인용하는 것이라 창작이 아니다. 실행 시 DB에서 로드해 제외한다.
_TECHNIQUE_NAMES: set[str] = set()
# 표준 프레임워크·구조 용어 (창작이 아니라 관용 표현)
_COMMON_TERMS = {
    "Call", "Action", "Call to Action", "CTA", "STAR", "Situation", "Task", "Result",
    "Instructions", "Instruction", "Product Info", "Tone", "Tone Guide", "Style",
    "Constraints", "Context", "Output", "Format", "Example", "Examples", "Hook",
    "About", "Value Proposition", "Step", "Steps", "Prompt", "Prompting", "Persona",
    "Developer Relations", "Analyst", "Writer", "Then", "Critique", "Revise", "Final",
    "Bullet", "Level", "Device", "Generative", "Structure", "Details", "Body", "Title",
}


def load_technique_names() -> set[str]:
    """코퍼스의 기법명을 읽어 '정당한 인용' 화이트리스트로 쓴다."""
    global _TECHNIQUE_NAMES
    if _TECHNIQUE_NAMES:
        return _TECHNIQUE_NAMES
    try:
        from app.core.db import SessionLocal, RagChunk
        from sqlalchemy import select
        with SessionLocal() as ses:
            rows = ses.execute(select(RagChunk.chunk_metadata)).all()
        names = set()
        for (meta,) in rows:
            n = (meta or {}).get("technique") or (meta or {}).get("source")
            if n:
                names.add(str(n).strip())
                # 하이픈·슬래시로도 쪼갠다 — 정규식이 "Self-Refine"을 Self/Refine 로 따로 뽑기 때문
                for w in re.split(r"[\s\-/·,()]+", str(n)):
                    if len(w) > 2:
                        names.add(w)
        _TECHNIQUE_NAMES = names
    except Exception as e:
        print(f"[halluc_eval] 기법명 로드 실패(제외 없이 진행): {e}")
        _TECHNIQUE_NAMES = set()
    return _TECHNIQUE_NAMES


def _strip_placeholders(text: str) -> str:
    """검사 대상에서 제외할 영역 제거:
    ① `[…]` 빈칸 내부  ② `(예: …)` 예시 명시  ③ 섹션 헤더·라벨 줄.
    셋 다 '단정된 사실'이 아니므로 환각으로 세면 거짓 양성이 된다."""
    t = re.sub(_PLACEHOLDER, " ", text or "")
    t = re.sub(_EXAMPLE, " ", t)
    t = "\n".join(l for l in t.split("\n")
                  if not re.match(_HEADER, l) and not re.search(_NEGATION, l))
    return t


def _norm(s: str) -> str:
    return re.sub(r"[\s,]", "", str(s)).lower()


def find_fabrications(improved: str, query: str, given: list[str]) -> dict:
    """개선안에서 사용자가 주지 않은 구체 사실을 찾는다. {'high': [...], 'low': [...]}"""
    body = _strip_placeholders(improved or "")
    src = _norm(query) + " " + " ".join(_norm(g) for g in given)

    def unseen(matches):
        out = []
        for m in matches:
            m = m.strip()
            if not m:
                continue
            if _norm(m) in src:          # 사용자가 준 값
                continue
            out.append(m)
        return out

    high, low = [], []
    for label, pat in _HIGH.items():
        for m in unseen(re.findall(pat, body)):
            high.append(f"{label}:{m}")
    for label, pat in _LOW.items():
        for m in unseen(re.findall(pat, body)):
            low.append(f"{label}:{m}")
    # 영문 고유명사는 **HIGH 로 세지 않는다**(suspect 로 분리).
    # 한국어 프롬프트에서 영문 대문자 연쇄는 기법명·섹션헤더·일반 도메인용어(Large Language Model,
    # Introduction, Key Drivers …)가 압도적이라 오탐이 심하다. 브랜드/제품명 창작 판정은
    # 문맥을 보는 judge 에 맡기고, 여기서는 후보만 남긴다.
    techs = load_technique_names()
    suspect = []
    for m in unseen(re.findall(_PROPER, body)):
        if len(m) < 4 or m in _PROPER_STOP or m in _COMMON_TERMS or m in techs:
            continue
        words = m.split()
        if all(w in techs or w in _COMMON_TERMS or w in _PROPER_STOP for w in words):
            continue
        suspect.append(m)
    return {"high": sorted(set(high)), "low": sorted(set(low)), "suspect": sorted(set(suspect))}


# ── LLM judge (선택) ─────────────────────────────────────────
_JUDGE_SYSTEM = """너는 프롬프트 개선 결과의 '사실 창작(환각)'만 잡아내는 엄격한 검사관이다.

입력으로 (1) 사용자 원문 요청 (2) 생성된 개선 프롬프트 를 받는다.
개선 프롬프트 안에 **사용자가 준 적 없는 구체적 사실**이 단정적으로 적혀 있으면 환각이다.

환각(HIGH)에 해당: 날짜·기간·가격·수치·스펙·퍼센트·통계·연구/논문 인용·회사명·제품명·사람명·
경력·수상·자격·구체 사례·후기 내용.
환각이 아님: 톤·대상 독자·분량·형식 같은 방향 가정, `[○○ 입력]` 형태의 빈칸(오히려 올바른 처리),
"(예: …)" 처럼 예시임을 명시한 것.

JSON 하나만 출력:
{"fabricated": true/false, "items": ["창작된 사실 나열"], "reason": "한 줄"}"""

_JUDGE_MODEL = "llama-3.3-70b-versatile"


def judge(query: str, improved: str, model: str):
    from groq import Groq
    c = Groq(api_key=os.environ["GROQ_API_KEY"])
    r = c.chat.completions.create(
        model=model, temperature=0.0, max_tokens=400,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": _JUDGE_SYSTEM},
                  {"role": "user", "content": f"[사용자 요청]\n{query}\n\n[개선 프롬프트]\n{improved}"}])
    return json.loads(r.choices[0].message.content)


def main():
    ap = argparse.ArgumentParser(description="적대적 환각 평가")
    ap.add_argument("--qa", default="halluc_set.json")
    ap.add_argument("--runs", type=int, default=2, help="케이스당 반복 횟수(temp 변동 대응)")
    ap.add_argument("--model", default="gemini-2.0-flash", help="생성 모델")
    ap.add_argument("--judge", action="store_true", help="LLM judge 2차 검증 활성화")
    ap.add_argument("--judge-model", default=_JUDGE_MODEL)
    ap.add_argument("--sleep", type=float, default=8.0)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--show", action="store_true", help="환각 발견 시 개선안 일부 출력")
    ap.add_argument("--cache-file", default=None,
                    help="생성 결과 캐시(JSON). 탐지기만 고쳐 재분석할 때 재생성 없이 돌린다.")
    args = ap.parse_args()

    cache, cache_path = {}, None
    if args.cache_file:
        cache_path = Path(__file__).parent / Path(args.cache_file).name
        if cache_path.exists():
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
        print(f"  캐시: {cache_path.name} ({len(cache)}건)")

    data = json.loads((Path(__file__).parent / args.qa).read_text(encoding="utf-8"))
    items = data["items"][:args.limit] if args.limit else data["items"]
    collection = data.get("collection", "prompt_techniques")

    print(f"적대적 환각 평가: {len(items)}케이스 × {args.runs}회 = {len(items)*args.runs}회 생성"
          f"  (judge={'on' if args.judge else 'off'})\n")

    total = 0
    high_runs = 0          # HIGH 환각이 1건 이상인 실행 수
    judge_flag = 0
    judge_known = 0
    by_cat = defaultdict(lambda: {"runs": 0, "high": 0})
    detail = []

    for it in items:
        for r in range(args.runs):
            ckey = f"{it['id']}#{r+1}|{args.model}"
            if ckey in cache:
                gen = cache[ckey]
            else:
                retrieved = retriever.search(query=it["query"], collection_name=collection, top_k=5)
                try:
                    gen = run_generation(it["query"], retrieved, args.model, [])
                except Exception as e:
                    print(f"  [{it['id']} #{r+1}] 생성 실패: {str(e)[:60]}")
                    continue
                if cache_path is not None:
                    cache[ckey] = gen
                    cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
            total += 1
            by_cat[it["category"]]["runs"] += 1
            improved = gen.get("improved_prompt", "") or ""
            fab = find_fabrications(improved, it["query"], it.get("given", []))
            has_high = bool(fab["high"])
            if has_high:
                high_runs += 1
                by_cat[it["category"]]["high"] += 1
                detail.append((it, r + 1, fab, improved))

            jr = ""
            if args.judge and improved:
                try:
                    j = judge(it["query"], improved, args.judge_model)
                    judge_known += 1
                    if j.get("fabricated"):
                        judge_flag += 1
                        jr = f" | judge:창작 {j.get('items', [])[:2]}"
                    else:
                        jr = " | judge:정상"
                except Exception as e:
                    jr = f" | judge실패({str(e)[:20]})"

            mark = "🔴" if has_high else ("🟡" if fab["low"] else "✅")
            sus = f" 의심{fab['suspect'][:3]}" if fab.get("suspect") else ""
            print(f"  {mark} [{it['id']:6} #{r+1}] mode={gen.get('mode'):7} "
                  f"빈칸{len(re.findall(_PLACEHOLDER, improved))} "
                  f"HIGH={fab['high'] if fab['high'] else '없음'}{sus}{jr}")
            time.sleep(args.sleep)

    print("\n" + "=" * 66)
    print(f"  총 실행           : {total}")
    print(f"  HIGH 환각 발생율  : {high_runs/max(total,1):.2%}  ({high_runs}/{total} 실행)")
    if args.judge:
        print(f"  judge 창작 판정   : {judge_flag/max(judge_known,1):.2%}  ({judge_flag}/{judge_known})")
    print("\n  카테고리별 HIGH 발생율")
    for cat, v in sorted(by_cat.items(), key=lambda x: -x[1]["high"] / max(x[1]["runs"], 1)):
        print(f"    {cat:16} {v['high']}/{v['runs']}  {v['high']/max(v['runs'],1):.0%}")
    if detail and args.show:
        print("\n  ── 환각 상세 ──")
        for it, run, fab, improved in detail[:8]:
            print(f"   [{it['id']} #{run}] bait={it['bait']}")
            print(f"     창작: {fab['high']}")
            print(f"     …{improved[:180]}…\n")
    print("=" * 66)


if __name__ == "__main__":
    main()

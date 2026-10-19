"""
eval/defect_canary.py
────────────────────────────────────────────────────────────
judge 결함 판정(uplift_set_v2.json 의 defects 중 by=judge — 가공 작업 지어내기·작성 거부)을
믿어도 되는지 고정 표본으로 검증한다. judge 에는 자리표시자를 가린 결과물을 보낸다.

왜 필요한가: 코드 판정으로는 가장 심각한 실패(번역 대신 엉뚱한 메일, 원문에 없는 회의 내용,
연도 날조)를 못 잡는다 → 그 판정을 judge 에 맡겼다. judge 가 이 표본을 못 잡거나
정상 결과물을 결함으로 잡으면 채점기에 쓰지 않는다.

표본: eval/defect_canary_set.json — 조정용(pos 5 · neg 4) / eval/defect_holdout_set.json — 별도 검증용
기준: 같은 표본을 --repeats 회 반복해 **판정이 매번 기대와 같은가**를 본다.

사용법 (rag-server/ 에서, GROQ_API_KEY 필요):
    python3 -m eval.defect_canary
    python3 -m eval.defect_canary --repeats 1 --show
"""

import argparse
import json
import re
import time
from pathlib import Path

from app.core.timeouts import GEN_SECONDS
from eval.placeholders import PLACEHOLDER_MASK, mask
from eval.uplift_eval import _loads_loose, _retry_wait_hint

_DIR = Path(__file__).parent
_JUDGE_MODEL = "openai/gpt-oss-120b"   # gen_eval judge 와 동일
_REASONING_EFFORT = "low"
_MAX_TOKENS = 1200
_KEYS = ("fabrication", "refusal")


def judged_keys(task_type: str) -> set[str]:
    """judge 가 판정하는 결함 — 2026-09-19 역할 분리. 생성 작업의 지어내기와 자리표시자 결함은 코드가 본다
    (eval/value_check.py · eval/code_checks.py)."""
    return {"fabrication", "refusal"} if task_type == "transform" else {"refusal"}


def build_system(defects: dict) -> str:
    fab = defects["fabrication"]
    return f"""너는 AI 결과물의 결함을 판정하는 엄격한 평가자다. 아래 정의로만 판정하고, 정의에 없는 품질(문체·길이·완성도)은 보지 않는다.
두 결함은 서로 독립적으로 각각 판정한다. 하나에 해당한다고 다른 것을 건너뛰지 말라 — 한 결과물에 둘 다 있을 수 있다.
결과물 속 {PLACEHOLDER_MASK} 는 나중에 채우라고 남긴 빈자리다. 그 자체는 어떤 결함도 아니다.

[결함 1: fabrication — 지어내기] (작업 유형이 transform 일 때만 판정. generate 면 항상 false)
{fab["transform"]["text"]}
{fab["common"]}

[결함 2: refusal — 작성 거부]
{defects["refusal"]["text"]}

판정 절차: 사용자 요청에 주어진 사실을 먼저 목록으로 떠올린 뒤, 결과물을 한 줄씩 대조한다.
반드시 아래 JSON 한 개만 출력:
{{"fabrication": true|false, "fabricated_items": ["<결과물에서 찾은 해당 표현>", ...],
  "refusal": true|false, "reason": "<한두 문장 근거>"}}"""


def judge(client, system: str, case: dict) -> dict:
    user = (f"[작업 유형]\n{case['task_type']}\n\n"
            f"[사용자 요청]\n{case['query']}\n\n"
            f"[결과물]\n{mask(case['output'])}")
    resp = client.chat.completions.create(
        model=_JUDGE_MODEL,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
        max_tokens=_MAX_TOKENS,
        reasoning_effort=_REASONING_EFFORT,
        response_format={"type": "json_object"},
        temperature=0.0,
    )
    return _loads_loose(resp.choices[0].message.content or "")


def call_patiently(fn, max_wait: float):
    """429 면 서버가 알려준 대기 시간만큼 기다렸다 다시 부른다(거절된 요청은 토큰을 안 쓴다).
    하루 한도(TPD)는 지난 24시간 사용량이 순차로 풀리는 방식이라 uplift_eval._retry 의
    90초×4회로는 못 버틴다. 총 대기가 max_wait 를 넘으면 포기한다."""
    waited = 0.0
    while True:
        try:
            return fn()
        except Exception as e:
            msg = str(e)
            # 연결 오류(DNS 일시 실패 등)도 기다렸다 다시 — 2026-09-17 실행이 17/27 에서
            # `Errno 8 nodename nor servname` 한 번에 통째로 죽었다
            conn = type(e).__name__ in ("APIConnectionError", "APITimeoutError")
            if not conn and "429" not in msg and "rate_limit" not in msg:
                raise
            hint = 30.0 if conn else (_retry_wait_hint(msg) or 60.0)
            wait = min(hint + 5, 600)
            if waited + wait > max_wait:
                raise
            kind = ("연결 오류" if conn else
                    "하루 한도(TPD)" if "per day" in msg else "분당 한도")
            print(f"       ({kind} — {wait:.0f}s 대기, 누적 {waited / 60:.0f}분)", flush=True)
            time.sleep(wait)
            waited += wait


def grade(case: dict, verdict: dict) -> list[str]:
    """기대와 어긋난 점 목록(빈 목록 = 통과)."""
    if not verdict or not all(isinstance(verdict.get(k), bool) for k in _KEYS):
        return ["판정 JSON 불완전"]
    errs = []
    judged = judged_keys(case.get("task_type", "transform"))
    # 결함이라고 했으면 근거 항목이 있어야 한다 — reason 은 모델이 거의 비워 두므로(24/27)
    # 추적 가능성은 항목 목록으로 확보한다(2026-09-17)
    if "fabrication" in judged and verdict["fabrication"] and not verdict.get("fabricated_items"):
        errs.append("fabrication=true 인데 fabricated_items 비어 있음")
    for k, want in case["expect"].items():
        if k in judged and verdict[k] != want:
            errs.append(f"{k}: 기대 {want} / 판정 {verdict[k]}")
    if "fabrication" in judged:
        listed = " ".join(map(str, verdict.get("fabricated_items", [])))
        for m in case["must_mention"]:
            if m not in listed:
                errs.append(f"결함 목록에 '{m}' 없음")
    return errs


def sample_kind(case_id: str) -> str:
    """'pos' | 'neg' — 표본 id 앞의 세트 접두사(ho_, ho2_ …)를 떼고 본다."""
    return re.sub(r"^ho\d*_", "", case_id).split("_")[0]


def judge_relevant(case: dict) -> bool:
    """judge 로 확인할 거리가 있는 표본인가 — 생성 작업의 지어내기 표본은 코드 테스트가 본다."""
    judged = judged_keys(case["task_type"])
    if sample_kind(case["id"]) == "neg":
        return True                                   # 정상 결과물을 거부·지어내기로 잘못 잡는지
    return any(case["expect"].get(k) for k in judged)


def main():
    ap = argparse.ArgumentParser(description="judge 결함 판정 검증 — 고정 표본")
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--sleep", type=float, default=20.0, help="호출 간 대기(초) — Groq TPM 8,000 회피")
    ap.add_argument("--max-wait", type=float, default=6 * 3600, help="429 누적 대기 상한(초)")
    ap.add_argument("--show", action="store_true")
    ap.add_argument("--out", default="", help="원시 판정 JSON 저장 경로(호출마다 갱신)")
    ap.add_argument("--set", default="defect_canary_set.json", help="표본 파일(eval/ 기준)")
    ap.add_argument("--cases", default="", help="이 표본만 실행(쉼표 구분 id) — 중단된 실행 이어가기용")
    args = ap.parse_args()

    from dotenv import load_dotenv
    from groq import Groq
    load_dotenv()
    client = Groq(timeout=GEN_SECONDS)

    defects = json.loads((_DIR / "uplift_set_v2.json").read_text(encoding="utf-8"))["defects"]
    cases = json.loads((_DIR / args.set).read_text(encoding="utf-8"))["cases"]
    if args.cases:
        wanted = args.cases.split(",")
        unknown = set(wanted) - {c["id"] for c in cases}
        if unknown:
            raise SystemExit(f"없는 표본 id: {sorted(unknown)}")
        cases = [c for c in cases if c["id"] in wanted]
    skipped = [c["id"] for c in cases if not judge_relevant(c)]
    cases = [c for c in cases if judge_relevant(c)]
    if skipped:
        print(f"judge 대상 아님(코드 테스트가 확인): {', '.join(skipped)}")
    system = build_system(defects)

    raw = {}
    total = len(cases) * args.repeats
    n = 0
    for case in cases:
        results = []
        for r in range(args.repeats):
            n += 1
            v = call_patiently(lambda: judge(client, system, case), args.max_wait)
            errs = grade(case, v)
            results.append((v, errs))
            raw.setdefault(case["id"], []).append(v)
            if args.out:
                Path(args.out).write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
            mark = "✅" if not errs else "❌"
            print(f"[{n:>2}/{total}] {mark} {case['id']:<24} #{r + 1}  "
                  + ("" if not errs else " · ".join(errs)), flush=True)
            if args.show or errs:
                print(f"        지어내기={v.get('fabricated_items')}  거부={v.get('refusal')}")
                print(f"        근거: {v.get('reason', '')}")
            if n < total:
                time.sleep(args.sleep)
        case["_passes"] = sum(not e for _, e in results)

    print("\n" + "═" * 60)
    for kind in ("pos", "neg"):
        group = [c for c in cases if sample_kind(c["id"]) == kind]
        ok = sum(c["_passes"] for c in group)
        label = "결함 검출(pos)" if kind == "pos" else "정상 통과(neg)"
        print(f"  {label}: {ok}/{len(group) * args.repeats}")
    stable = sum(c["_passes"] in (0, args.repeats) for c in cases)
    print(f"  반복 일관성: {stable}/{len(cases)} 표본이 {args.repeats}회 모두 같은 결과")
    print("═" * 60)


if __name__ == "__main__":
    main()

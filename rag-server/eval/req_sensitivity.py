"""
eval/req_sensitivity.py
────────────────────────────────────────────────────────────
요구사항 판정기(eval/requirement_judge.py)의 기본 민감도 검사 — 사람 라벨 없이 할 수 있는 검증.

실제 결과물에서 코드로 한 가지 내용을 지운 쌍(eval/req_sensitivity_set.json)을 판정해,
해당 질문이 원본에선 yes · 변형에선 no 로 뒤집히는지, 다른 질문은 그대로인지 본다.
이걸 통과해도 '사람 판단과 맞는다'는 뜻은 아니다 — 최소한 내용이 빠진 걸 알아보는지만 확인한다.

사용법 (rag-server/ 에서):  python3 -m eval.req_sensitivity
"""

import json
from pathlib import Path

from eval.defect_canary import call_patiently
from eval.requirement_judge import judge_requirements

_DIR = Path(__file__).parent


def main():
    from dotenv import load_dotenv
    from groq import Groq
    load_dotenv()
    client = Groq(timeout=90)
    items = {it["id"]: it for it in json.loads((_DIR / "uplift_set_v2.json").read_text(encoding="utf-8"))["items"]}
    cases = json.loads((_DIR / "req_sensitivity_set.json").read_text(encoding="utf-8"))["cases"]
    flipped = 0
    others_changed = 0
    others_total = 0
    for c in cases:
        it = items[c["item"]]
        o = call_patiently(lambda: judge_requirements(client, "openai/gpt-oss-120b", it, c["original"]), 6 * 3600)
        p = call_patiently(lambda: judge_requirements(client, "openai/gpt-oss-120b", it, c["perturbed"]), 6 * 3600)
        q = c["question"]
        ov = o["answers"].get(q, {}).get("verdict")
        pv = p["answers"].get(q, {}).get("verdict")
        ok = ov == "yes" and pv == "no"
        flipped += ok
        diff = [k for k in o["answers"] if k != q and k in p["answers"]
                and o["answers"][k]["verdict"] != p["answers"][k]["verdict"]]
        others_changed += len(diff)
        others_total += sum(1 for k in o["answers"] if k != q and k in p["answers"])
        print(f"{'✅' if ok else '❌'} {c['item']} {q} 원본={ov} 변형={pv}  ({c['how']})"
              + (f"  · 다른 질문 바뀜: {diff}" if diff else "")
              + (f"  · 오류: {o['errors'] + p['errors']}" if o["errors"] or p["errors"] else ""), flush=True)
        if not ok:
            print(f"     원본 근거: {o['answers'].get(q, {}).get('evidence')}  /  변형 근거: {p['answers'].get(q, {}).get('evidence')}")
    print(f"\n뒤집힘 {flipped}/{len(cases)} · 건드리지 않은 질문이 바뀐 수 {others_changed}/{others_total}")


if __name__ == "__main__":
    main()

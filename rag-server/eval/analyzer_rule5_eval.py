"""
eval/analyzer_rule5_eval.py
────────────────────────────────────────────────────────────
분석기 규칙 5 측정 — "~하는 프롬프트 만들어줘"(템플릿 요청)에서 원문을 required+empty 로
잡아 생성기를 ask 로 미는 비율.

세 가지를 따로 센다:
  모델 위반율   — 모델이 규칙 5 를 어긴 비율. 가드(`_exempt_template_source`)가 교정한
                  횟수(`sanitize_stats()['template_source_demoted']`)로 관측한다.
  가드 후 잔여  — 가드를 거친 뒤에도 원문 계열 required 가 empty 로 남은 템플릿 실행.
                  (가드의 필드명 매칭이 놓친 이름을 찾는 창)
  대조군 ask    — 특정 원문을 가리키는 요청("이 이메일 번역해줘")의 derive_mode 가 ask 인가.
                  가드가 과하게 발동하면 여기서 드러난다.

--from 으로 저장된 원본 출력(가드 이전 수집본)을 넣으면 API 없이 가드를 오프라인 적용한다.

사용:
  python -m eval.analyzer_rule5_eval --rounds 3
  python -m eval.analyzer_rule5_eval --from path/to/raw.json
"""

import argparse
import copy
import json
import time
from pathlib import Path

from app.rag import analyzer

_SET = Path(__file__).parent / "analyzer_rule5_set.json"


def _source_required_empty(fields: list[dict]) -> list[str]:
    return [f["name"] for f in fields
            if f.get("role") == "required" and f.get("status") == "empty"
            and any(w in f["name"] for w in analyzer._SOURCE_WORDS)]


def _any_required_empty(fields: list[dict]) -> list[str]:
    return [f["name"] for f in fields if f.get("role") == "required" and f.get("status") == "empty"]


def _collect(rounds: int, sleep: float) -> list[dict]:
    items = json.loads(_SET.read_text(encoding="utf-8"))["items"]
    runs = []
    for r in range(rounds):
        for it in items:
            before = analyzer.sanitize_stats().get("template_source_demoted", 0)
            a = None
            for _ in range(4):
                a = analyzer.analyze(it["query"], [])
                if a is not None:
                    break
                time.sleep(20)
            demoted = analyzer.sanitize_stats().get("template_source_demoted", 0) - before
            runs.append({"round": r + 1, "query": it["query"], "template": it["template"],
                         "analysis": a, "demoted": demoted})
            time.sleep(sleep)
    return runs


def _apply_guard_offline(runs: list[dict]) -> list[dict]:
    """가드 이전 원본 출력에 가드를 적용한다(수집 당시 코드에 가드가 없던 경우)."""
    out = []
    for run in runs:
        run = copy.deepcopy(run)
        a = run.get("analysis")
        if a:
            before = len(_source_required_empty(a["fields"]))
            a["fields"] = analyzer._exempt_template_source(run["query"], a["fields"])
            run["demoted"] = before - len(_source_required_empty(a["fields"]))
        out.append(run)
    return out


def _report(runs: list[dict]) -> None:
    tpl = [r for r in runs if r["template"] and r["analysis"]]
    ctl = [r for r in runs if not r["template"] and r["analysis"]]
    failed = sum(1 for r in runs if not r["analysis"])
    violated = sum(1 for r in tpl if r["demoted"])
    residual = [r for r in tpl if _source_required_empty(r["analysis"]["fields"])]
    blocked = [r for r in tpl if analyzer.derive_mode(r["analysis"]["fields"]) == "ask"]
    ctl_ask = [r for r in ctl if analyzer.derive_mode(r["analysis"]["fields"]) == "ask"]

    print("═" * 60)
    print(f"  템플릿 실행 {len(tpl)} · 대조군 실행 {len(ctl)} · 분석 실패 {failed}")
    print(f"  모델 위반율(원문 required+empty)   : {violated}/{len(tpl)}")
    print(f"  가드 후 잔여 위반                  : {len(residual)}/{len(tpl)}")
    print(f"  가드 후에도 ask 로 막힘(derive_mode): {len(blocked)}/{len(tpl)}")
    print(f"  대조군 ask 유지                    : {len(ctl_ask)}/{len(ctl)}")
    print("═" * 60)
    for r in residual + blocked:
        print(f"  [막힘] {r['query'][:40]}  required-empty={_any_required_empty(r['analysis']['fields'])}")
    for r in ctl:
        if r not in ctl_ask:
            print(f"  [대조군 improve] {r['query'][:40]}  fields={[(f['name'], f['role'], f['status']) for f in r['analysis']['fields']]}")


def main() -> None:
    ap = argparse.ArgumentParser(description="분석기 규칙 5 측정")
    ap.add_argument("--rounds", type=int, default=3)
    ap.add_argument("--sleep", type=float, default=16.0, help="호출 간 대기(초) — TPM 8000")
    ap.add_argument("--from", dest="src", default=None,
                    help="가드 이전 원본 출력 JSON — 가드를 오프라인 적용해 집계")
    ap.add_argument("--save", default=None, help="이번 실행 원본을 저장할 경로")
    args = ap.parse_args()

    analyzer.reset_sanitize_stats()
    if args.src:
        runs = _apply_guard_offline(json.loads(Path(args.src).read_text(encoding="utf-8")))
    else:
        runs = _collect(args.rounds, args.sleep)
    if args.save:
        Path(args.save).write_text(json.dumps(runs, ensure_ascii=False, indent=1), encoding="utf-8")
    _report(runs)


if __name__ == "__main__":
    main()

"""
ingest_web.py
────────────────────────────────────────────────────────────
공신력 있는 사이트/인물의 프롬프트 엔지니어링 문서(텍스트)를 받아
기존 ingest_knowledge 파이프라인(LLM 추출·큐레이션·중복제거)으로
기법 카드를 만들어 `prompt_techniques` 컬렉션에 적재한다.

ingest_knowledge 는 PDF 전용이라, 웹에서 받은 텍스트(.txt)를 처리하는 얇은 래퍼다.
추출·채점·게이트·중복제거·인덱싱은 전부 ingest_knowledge 의 검증된 함수를 재사용한다.

입력: data/web_sources/*.txt  (첫 줄이 "SOURCE: <출처/저자>" 면 출처 라벨로 사용)

사용법 (rag-server/ 에서):
    # Groq TPD 회피 → Gemini lite 로 추출
    GROQ_API_KEY= python -m ingestion.ingest_web --model gemini-flash-lite-latest
    GROQ_API_KEY= python -m ingestion.ingest_web --dry-run   # DB 미저장, 검수만
"""

from __future__ import annotations

import argparse
import pathlib
import sys

from app import DATA_DIR
from ingestion.ingest_knowledge import (
    LLMJudge, Technique, curate, dedupe, semantic_dedupe, _normalize_name,
    _safe_int, write_jsonl, print_summary, CURATED_DIR, DEFAULT_COLLECTION,
)

WEB_DIR = DATA_DIR / "web_sources"


def _windows(text: str, size: int = 5000, overlap: int = 400) -> list[str]:
    """텍스트를 size 자 윈도로 자른다(경계 기법 보호용 overlap)."""
    out, i = [], 0
    step = max(1, size - overlap)
    while i < len(text):
        chunk = text[i:i + size].strip()
        if chunk:
            out.append(chunk)
        i += step
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="공신력 웹 소스 → 기법 카드 → prompt_techniques")
    ap.add_argument("--dir", type=pathlib.Path, default=WEB_DIR, help="*.txt 소스 디렉터리")
    ap.add_argument("--collection", default=DEFAULT_COLLECTION)
    ap.add_argument("--min-score", type=int, default=7, help="적합도 게이트(기본 7)")
    ap.add_argument("--model", default=None, help="LLM 모델(예: gemini-flash-lite-latest)")
    ap.add_argument("--lang", choices=["ko", "en", "orig"], default="ko")
    ap.add_argument("--window-chars", type=int, default=5000)
    ap.add_argument("--dry-run", action="store_true", help="DB 미저장, JSONL만")
    ap.add_argument("--no-semantic-dedup", action="store_true")
    ap.add_argument("--sim-threshold", type=float, default=0.90)
    args = ap.parse_args()

    files = sorted(args.dir.glob("*.txt"))
    if not files:
        print(f"❌ {args.dir} 에 *.txt 가 없습니다.")
        sys.exit(1)

    judge = LLMJudge(lang=args.lang, model=args.model)
    print(f"▶ 소스 {len(files)}개 | 컬렉션 {args.collection} | min-score {args.min_score}")

    raw: list[Technique] = []
    for f in files:
        text = f.read_text(encoding="utf-8")
        src = f.stem
        lines = text.splitlines()
        if lines and lines[0].upper().startswith("SOURCE:"):
            src = lines[0].split(":", 1)[1].strip()
            text = "\n".join(lines[1:])
        wins = _windows(text, size=args.window_chars)
        print(f"\n📄 {f.name}  (출처: {src}) → {len(wins)} 윈도")
        for i, w in enumerate(wins, 1):
            print(f"   ⟳ 윈도 {i}/{len(wins)} 추출...", flush=True)
            for d in judge.extract(w):
                name = str(d.get("name", "")).strip()
                if not name:
                    continue
                raw.append(Technique(
                    name=name,
                    category=str(d.get("category", "Other")).strip() or "Other",
                    definition=str(d.get("definition", "")).strip(),
                    use_when=str(d.get("use_when", "")).strip(),
                    avoid_when=str(d.get("avoid_when", "")).strip(),
                    prompt_template=str(d.get("prompt_template", "")).strip(),
                    example=str(d.get("example", "")).strip(),
                    sources=(str(d.get("sources", "")).strip() or src),
                    suitability=_safe_int(d.get("suitability", 0)),
                    suitability_reason=str(d.get("suitability_reason", "")).strip(),
                    origin_pdf=src,
                ))

    kept, rejected = curate(raw, args.min_score)
    write_jsonl(CURATED_DIR / "web_sources.paper.kept.jsonl", kept)
    write_jsonl(CURATED_DIR / "web_sources.paper.rejected.jsonl", rejected)
    print_summary(kept)
    print(f"\n📦 산출물: {CURATED_DIR}/web_sources.paper.*.jsonl")

    if not kept:
        print("저장할 카드가 없습니다.")
        return

    # ── 기존 컬렉션과 이름 정확일치 중복 제거 ──
    from sqlalchemy import select
    from app.core.db import SessionLocal, RagChunk
    with SessionLocal() as s:
        metas = s.execute(
            select(RagChunk.chunk_metadata).where(RagChunk.collection_name == args.collection)
        ).scalars().all()
    existing = {_normalize_name((m or {}).get("technique", "")) for m in metas}
    name_dropped = [t.name for t in kept if _normalize_name(t.name) in existing]
    kept = [t for t in kept if _normalize_name(t.name) not in existing]
    if name_dropped:
        print(f"🔁 이름 중복 폐기 {len(name_dropped)}개: {name_dropped}")

    # ── 의미 중복 제거(기존 코퍼스 + 배치 내부) ──
    if not args.no_semantic_dedup and kept:
        from app.core.embeddings import get_model
        kept, sem_dropped = semantic_dedupe(
            kept, args.collection, args.sim_threshold, get_model("BAAI/bge-m3"),
            compare_existing=True)
        if sem_dropped:
            print(f"🔁 의미 중복 폐기 {len(sem_dropped)}개: {[t.name for t in sem_dropped]}")

    print(f"\n▶ 신규 적재 대상 {len(kept)}개: {[t.name for t in kept]}")
    if args.dry_run:
        print("🧪 --dry-run: DB 저장 생략.")
        return
    if not kept:
        print("중복 제거 후 남은 카드가 없습니다.")
        return

    from app.rag.indexer import Indexer
    total = Indexer(model_name="BAAI/bge-m3").index(
        chunks=[t.to_document() for t in kept],
        metadata=[t.to_metadata() for t in kept],
        collection_name=args.collection)
    print(f"\n🎉 완료: {total}개 신규 → '{args.collection}'")


if __name__ == "__main__":
    main()

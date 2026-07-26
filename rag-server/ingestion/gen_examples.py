"""
gen_examples.py
────────────────────────────────────────────────────────────
합성 'before/after 개선 예시' 코퍼스 생성기 (A안 프로토타입).

기존 코퍼스(prompt_techniques)는 "기법 정의 카드"라 추상적이다. 딸각의 실제 작업은
'거친 프롬프트를 재작성'하는 것이고, uplift_eval이 잡아낸 약점도 태스크형 재작성이었다.
재작성에 직접 쓰이는 코퍼스는 기법 정의가 아니라 **유사 요청의 개선 사례**다:

    거친 요청  →  개선된 프롬프트(지시문) + 적용 기법 + 왜 좋아졌나

이 스크립트는 태스크 유형별로 그런 예시를 LLM으로 생성·큐레이션해 별도 컬렉션
`prompt_examples` 에 적재한다. (기존 prompt_techniques 는 건드리지 않는다.)

산출물:
  data/curated/synthetic_examples.jsonl   ← 생성·큐레이션된 예시(감사·재현용)

사용법 (rag-server/ 에서):
    python -m ingestion.gen_examples                     # 생성 → 큐레이션 → JSONL → 인덱싱
    python -m ingestion.gen_examples --dry-run           # 생성·검수만(DB 미저장)
    python -m ingestion.gen_examples --per-type 3        # 유형당 예시 수
    python -m ingestion.gen_examples --from-jsonl data/curated/synthetic_examples.jsonl
                                                         # LLM 없이 JSONL 재인덱싱
    python -m ingestion.gen_examples --replace           # 컬렉션 비우고 새로

LLM 백엔드는 generator.py 와 동일 규칙: GROQ_API_KEY → GEMINI_API_KEY 자동 선택.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import re
import sys
import time
from dataclasses import dataclass, asdict

from app import DATA_DIR  # app.__init__ 가 .env 로드

DEFAULT_COLLECTION = "prompt_examples"
CURATED_DIR = DATA_DIR / "curated"
DEFAULT_OUT = CURATED_DIR / "synthetic_examples.jsonl"


# ── 태스크 유형 분류 ─────────────────────────────────────────
# needs_material=True 는 '변환·가공할 원문'을 사용자가 주는 유형(요약·번역·리뷰·분석).
# 이 유형의 예시는 before 에 짧은 원문을 담고, after(개선 프롬프트)에 그 원문을
# verbatim 으로 포함해야 한다(SYSTEM_PROMPT 의 원문 보존 규칙을 예시로 학습시킴).
@dataclass
class TaskType:
    key: str
    label: str
    needs_material: bool = False


TASK_TYPES: list[TaskType] = [
    TaskType("marketing",   "마케팅·홍보 카피 작성"),
    TaskType("job_posting", "채용 공고 작성"),
    TaskType("code_review", "코드 리뷰", needs_material=True),
    TaskType("summarize",   "회의록·문서 요약", needs_material=True),
    TaskType("explain",     "개념을 쉽게 설명(eli5)"),
    TaskType("email",       "정중한 안내·거절 이메일 작성"),
    TaskType("table_plan",  "표·일정표로 정리"),
    TaskType("translate",   "번역", needs_material=True),
    TaskType("data_analysis", "데이터 분석 요청", needs_material=True),
    TaskType("writing",     "블로그·에세이 등 글쓰기"),
    # ── 2차 확장(2026-07-23): 커버리지 일반화 ──
    TaskType("sns_post",    "SNS·소셜미디어 게시글 작성"),
    TaskType("product_desc", "상품 상세·제품 설명 작성"),
    TaskType("cover_letter", "자기소개서·지원 동기 작성"),
    TaskType("study_plan",  "학습·공부 계획 수립"),
    TaskType("interview_qa", "면접 예상 질문·답변 준비"),
    TaskType("naming",      "네이밍·아이디어 브레인스토밍"),
    TaskType("proofread",   "문장 교정·윤문", needs_material=True),
    TaskType("extract",     "텍스트에서 정보 추출", needs_material=True),
    TaskType("classify",    "내용 분류·태깅", needs_material=True),
    TaskType("sql_query",   "SQL 쿼리 작성"),
]


# ── 생성 프롬프트 ────────────────────────────────────────────
_GEN_SYSTEM = """당신은 '딸각(Ttalkak)'의 학습용 예시를 만드는 프롬프트 엔지니어링 교사다.
딸각 = 사용자가 입력한 '거친 프롬프트'를, 프롬프트 엔지니어링 기법으로 더 좋은
'개선된 프롬프트'로 자동 재작성해 주는 서비스다.

너의 임무: 주어진 '작업 유형'에 대해, 현실적인 (거친 요청 → 개선된 프롬프트) 예시를
만든다. 각 예시는 다음을 담는다.

1) before(거친 요청): 실제 사용자가 대충 던질 법한 짧고 거친 한국어 요청.
   구체적 소재/정보를 조금 담되, 형식·톤·구조 지시는 빠져 있어야 한다(그래서 '거칠다').
2) after(개선된 프롬프트): 그 요청을 개선한 결과. ★반드시 'AI에게 ~을 작성/생성/수행하라'는
   지시문★ 형태여야 한다. 결과물 자체를 쓰지 마라. 역할 부여·출력 형식·제약·단계 등
   프롬프트 기법을 구체적으로 적용하고, before 에 있던 정보는 조건·재료로 빠짐없이 넣어라.
   바로 다른 AI에 붙여넣어 쓸 수 있는 완결된 지시문으로.
3) technique(적용 기법): 이 개선에 쓴 대표 기법 1개의 이름(예: Role Prompting, Chain-of-Thought,
   Few-shot, Output Formatting, Delimiters, Step-by-step, Constraints/Guardrails 등).
4) why(개선 이유): 무엇이 왜 좋아졌는지 한 줄.

%s

[엄격 규칙]
- after 는 절대 '완성된 결과물'이 아니라 'AI에게 시키는 지시문'이다.
- before 는 서로 소재가 겹치지 않게 다양하게.
- 과장·거짓 정보 금지.
- 모든 문장은 한자(漢字)나 외국어를 섞지 말고 **자연스러운 순수 한국어**로 쓴다.
  (코드·SQL·영문 기법명·꼭 필요한 고유명사만 예외)

[출력 — 반드시 JSON 객체 하나만]
{"examples": [
  {"before": "...", "after": "...", "technique": "...", "why": "..."}
]}"""

_MATERIAL_RULE = """[이 작업 유형은 '원문 제공형'이다]
- before 에 사용자가 변환·가공할 짧은 원문(요약할 회의록 본문, 번역할 문장, 리뷰할 코드,
  분석할 데이터 등)을 실제로 포함하라.
- after(개선된 프롬프트)에는 그 원문을 **그대로(verbatim)** 조건·재료로 반드시 포함하라.
  요약·생략·'(여기에 붙여넣기)' 같은 플레이스홀더로 대체하는 것은 금지."""

_PLAIN_RULE = """[이 작업 유형은 '생성형'이다]
- before 는 만들 대상과 몇 가지 정보만 던지는 거친 요청.
- after 는 역할·목적·형식·톤·제약을 갖춘 완결된 지시문."""


# ── 데이터 구조 ──────────────────────────────────────────────
@dataclass
class Example:
    task_type: str = ""
    task_label: str = ""
    before: str = ""
    after: str = ""
    technique: str = ""
    why: str = ""
    source: str = "synthetic"

    def chunk_id(self) -> str:
        h = hashlib.sha1(f"{self.task_type}|{self.before}".encode("utf-8")).hexdigest()[:8]
        slug = re.sub(r"[^a-z0-9]+", "-", self.task_type.lower()).strip("-")[:24] or "ex"
        return f"ex_{slug}_{h}"

    def to_document(self) -> str:
        """검색 임베딩 + generator 가 읽는 본문. '거친 요청'을 앞에 둬 사용자
        원본 프롬프트(거친 요청) 쿼리와의 임베딩 매칭을 높인다."""
        lines = [f"[개선 예시 — {self.task_label or self.task_type}]"]
        lines.append(f"거친 요청: {self.before}")
        lines.append(f"개선된 프롬프트:\n{self.after}")
        if self.technique:
            lines.append(f"적용 기법: {self.technique}")
        if self.why:
            lines.append(f"왜 좋아졌나: {self.why}")
        return "\n".join(lines).strip()

    def to_metadata(self) -> dict:
        return {
            "chunk_id":  self.chunk_id(),
            "kind":      "example",          # generator 가 [참고 예시] 로 분기하는 키
            "task_type": self.task_type,
            "technique": self.technique,
            "source":    self.source,
        }


# ── LLM 백엔드 (generator/ingest 와 동일 자동선택) ────────────
class _LLM:
    def __init__(self, model: str | None = None):
        if os.environ.get("GROQ_API_KEY"):
            from groq import Groq
            self.backend = "groq"
            self.client = Groq(api_key=os.environ["GROQ_API_KEY"])
            self.model = model or "llama-3.3-70b-versatile"
        elif os.environ.get("GEMINI_API_KEY"):
            from google import genai
            self.backend = "gemini"
            self.client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
            self.model = model or "gemini-2.0-flash"
        else:
            raise EnvironmentError("GROQ_API_KEY 또는 GEMINI_API_KEY 가 필요합니다.")
        print(f"[gen_examples] LLM 백엔드={self.backend} model={self.model}")

    @staticmethod
    def _parse_retry_delay(msg: str) -> float | None:
        m = re.search(r"try again in (?:(\d+)m)?([\d.]+)s", msg)
        return None if not m else int(m.group(1) or 0) * 60 + float(m.group(2))

    def complete(self, system: str, user: str, *, max_tokens: int = 2200,
                 temperature: float = 0.8) -> str:
        rl_budget = 1800.0
        while True:
            try:
                if self.backend == "groq":
                    resp = self.client.chat.completions.create(
                        model=self.model,
                        messages=[{"role": "system", "content": system},
                                  {"role": "user", "content": user}],
                        temperature=temperature, max_tokens=max_tokens,
                        response_format={"type": "json_object"},
                    )
                    return resp.choices[0].message.content or ""
                from google.genai import types
                resp = self.client.models.generate_content(
                    model=self.model, contents=f"{system}\n\n{user}",
                    config=types.GenerateContentConfig(
                        max_output_tokens=max_tokens, temperature=temperature,
                        response_mime_type="application/json"),
                )
                return resp.text or ""
            except Exception as e:  # noqa: BLE001
                msg = str(e)
                if "Request too large" in msg or "reduce your message size" in msg:
                    raise RuntimeError(f"요청이 TPM 한도 초과 — max_tokens/per-type 축소 필요: {e}") from e
                if "rate_limit" in msg or "429" in msg:
                    wait = min((self._parse_retry_delay(msg) or 60) + 8, 900)
                    if rl_budget < wait:
                        raise RuntimeError(f"레이트리밋 대기 예산 소진: {e}") from e
                    rl_budget -= wait
                    print(f"   [rate limit] {wait:.0f}s 대기 (잔여 {rl_budget/60:.0f}분)")
                    time.sleep(wait)
                    continue
                raise


def _loads_loose(s: str) -> dict:
    s = re.sub(r"^```(?:json)?", "", (s or "").strip()).strip()
    s = re.sub(r"```$", "", s).strip()
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass
    a, b = s.find("{"), s.rfind("}")
    if a != -1 and b > a:
        try:
            return json.loads(s[a:b + 1])
        except json.JSONDecodeError:
            pass
    return {"examples": []}


# ── 생성 · 큐레이션 ──────────────────────────────────────────
def generate_for_type(llm: _LLM, tt: TaskType, per_type: int) -> list[Example]:
    rule = _MATERIAL_RULE if tt.needs_material else _PLAIN_RULE
    system = _GEN_SYSTEM % rule
    user = (f"[작업 유형] {tt.label}\n"
            f"이 유형의 (거친 요청 → 개선된 프롬프트) 예시를 {per_type}개 만들어라.")
    raw = llm.complete(system, user)
    data = _loads_loose(raw)
    out: list[Example] = []
    for d in (data.get("examples") or []):
        if not isinstance(d, dict):
            continue
        out.append(Example(
            task_type=tt.key, task_label=tt.label,
            before=str(d.get("before", "")).strip(),
            after=str(d.get("after", "")).strip(),
            technique=str(d.get("technique", "")).strip(),
            why=str(d.get("why", "")).strip(),
        ))
    return out


def passes_gate(e: Example) -> tuple[bool, str]:
    """예시 완결성 게이트 — 파편·형식오류 걸러냄."""
    if len(e.before.strip()) < 8:
        return False, "before 너무 짧음"
    if len(e.after.strip()) < 40:
        return False, "after(개선 프롬프트) 너무 짧음"
    if not e.technique.strip():
        return False, "적용 기법 없음"
    # after 가 '지시문' 형태인지 최소 휴리스틱: 명령형 어미/동사가 보이는지
    if not re.search(r"(하라|하세요|작성|생성|요약|번역|정리|설명|리뷰|분석|만들|하고|해라)", e.after):
        return False, "after 가 지시문 형태로 안 보임"
    return True, "ok"


def dedupe(exs: list[Example]) -> list[Example]:
    """(task_type, before 앞 40자) 기준 중복 제거."""
    seen: dict[str, Example] = {}
    for e in exs:
        key = f"{e.task_type}|{e.before[:40]}"
        seen.setdefault(key, e)
    return list(seen.values())


def write_jsonl(path: pathlib.Path, exs: list[Example]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for e in exs:
            row = asdict(e)
            row["chunk_id"] = e.chunk_id()
            row["document"] = e.to_document()
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def load_jsonl(path: pathlib.Path) -> list[Example]:
    fields = set(Example.__dataclass_fields__)
    out: list[Example] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        out.append(Example(**{k: v for k, v in row.items() if k in fields}))
    return out


def index_examples(exs: list[Example], collection: str, *, replace: bool) -> int:
    from app.rag.indexer import Indexer
    indexer = Indexer(model_name="BAAI/bge-m3")
    if replace:
        removed = indexer.clear_collection(collection)
        print(f"[replace] 기존 {removed}개 삭제")
    return indexer.index(
        chunks=[e.to_document() for e in exs],
        metadata=[e.to_metadata() for e in exs],
        collection_name=collection,
    )


def print_summary(exs: list[Example]) -> None:
    print("\n┌─ 예시 요약 " + "─" * 46)
    by_type: dict[str, int] = {}
    for e in exs:
        by_type[e.task_type] = by_type.get(e.task_type, 0) + 1
    for e in exs:
        print(f"│ {e.task_type:14s} [{e.technique[:22]:22s}] {e.before[:40]}")
    print("├" + "─" * 58)
    print(f"│ 유형별: {by_type}")
    print("└" + "─" * 58)


# ── 메인 ─────────────────────────────────────────────────────
def main() -> None:
    ap = argparse.ArgumentParser(description="합성 개선 예시 코퍼스 생성·적재 (prompt_examples)")
    ap.add_argument("--collection", default=DEFAULT_COLLECTION)
    ap.add_argument("--per-type", type=int, default=2, help="작업 유형당 생성 예시 수(기본 2)")
    ap.add_argument("--types", nargs="+", default=None,
                    help="특정 유형 key 만 생성(기본 전체)")
    ap.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUT)
    ap.add_argument("--from-jsonl", type=pathlib.Path, default=None,
                    help="LLM 없이 기존 JSONL 재인덱싱")
    ap.add_argument("--dry-run", action="store_true", help="DB 저장 없이 생성·검수만")
    ap.add_argument("--replace", action="store_true", help="인덱싱 전 컬렉션 비우기")
    ap.add_argument("--model", default=None)
    args = ap.parse_args()

    # ── JSONL 재인덱싱 경로 (LLM 불필요) ──
    if args.from_jsonl:
        exs = load_jsonl(args.from_jsonl)
        print(f"▶ JSONL 로드: {len(exs)}개 ({args.from_jsonl})")
        print_summary(exs)
        if args.dry_run:
            print("🧪 --dry-run: DB 저장 생략.")
            return
        n = index_examples(exs, args.collection, replace=args.replace)
        print(f"🎉 완료: {n}개 → '{args.collection}'")
        return

    # ── 생성 경로 ──
    types = TASK_TYPES
    if args.types:
        want = set(args.types)
        types = [t for t in TASK_TYPES if t.key in want]
        if not types:
            print(f"❌ 알 수 없는 유형: {args.types}")
            sys.exit(1)

    llm = _LLM(model=args.model)
    print(f"▶ {len(types)}개 유형 × {args.per_type}개 생성 시작")

    raw: list[Example] = []
    for tt in types:
        print(f"  ⟳ {tt.key} ({tt.label}) 생성...", flush=True)
        try:
            raw.extend(generate_for_type(llm, tt, args.per_type))
        except RuntimeError as e:
            print(f"    ⚠️ 중단({tt.key}): {e}")
            break

    # 큐레이션
    kept, rejected = [], []
    for e in dedupe(raw):
        ok, reason = passes_gate(e)
        (kept if ok else rejected).append((e, reason))
    kept_exs = [e for e, _ in kept]
    print(f"\n✅ 통과 {len(kept_exs)} / ❌ 탈락 {len(rejected)} (생성 {len(raw)})")
    for e, reason in rejected:
        print(f"   탈락[{reason}] {e.task_type}: {e.before[:40]}")

    if not kept_exs:
        print("저장할 예시가 없습니다.")
        sys.exit(1)

    write_jsonl(args.out, kept_exs)
    print(f"📦 산출물: {args.out}")
    print_summary(kept_exs)

    if args.dry_run:
        print("\n🧪 --dry-run: DB 저장 생략. JSONL 검수 후 --from-jsonl 로 적재하세요.")
        return

    n = index_examples(kept_exs, args.collection, replace=args.replace)
    print(f"\n🎉 완료: {n}개 → '{args.collection}' 컬렉션 (MySQL)")


if __name__ == "__main__":
    main()

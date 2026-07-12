"""
ingest_knowledge.py
────────────────────────────────────────────────────────────
논문/기법 PDF 한 개(또는 여러 개)를 받아
  ① 파싱(텍스트 추출)
  ② 청킹(LLM 으로 '재사용 가능한 프롬프트 기법' 단위로 구조화)
  ③ 큐레이션(딸각 서비스 적합도 1~10 점수화 → 7점 미만 폐기)
  ④ RAG 친화 포맷으로 정규화
  ⑤ MySQL(rag_chunk)에 바로 인덱싱
까지 한 번에 수행한다. 결과는 곧바로 rag-server 의 검색 대상이 된다.

딸각(Ttalkak) = 사용자의 거친 프롬프트를 '프롬프트 엔지니어링 기법'으로
자동 개선해 주는 서비스. 따라서 '적합도'란 "이 자료가 사용자의 프롬프트를
개선하는 데 바로 쓸 수 있는 재사용 가능한 기법/원칙인가" 를 뜻한다.

산출물:
  data/curated/<원본이름>.kept.jsonl      ← 인덱싱된 청크(감사·재현용)
  data/curated/<원본이름>.rejected.jsonl  ← 탈락 청크(점수·사유 포함)
  표준출력 요약표

사용법 (rag-server/ 에서 실행):
    python -m ingestion.ingest_knowledge --pdf data/some_paper.pdf
    python -m ingestion.ingest_knowledge --pdf data/ --collection prompt_techniques
    python -m ingestion.ingest_knowledge --pdf x.pdf --dry-run     # DB 미저장(검수만)
    python -m ingestion.ingest_knowledge --pdf x.pdf --replace     # 컬렉션 비우고 새로
    python -m ingestion.ingest_knowledge --pdf x.pdf --min-score 8 # 더 엄격하게

LLM 백엔드는 generator.py 와 동일하게 GROQ_API_KEY → GEMINI_API_KEY 순으로
자동 선택한다(.env: rag-server/.env).
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
from dataclasses import dataclass, field, asdict

import pypdf

from app import DATA_DIR  # app.__init__ 가 .env 를 로드함

DEFAULT_COLLECTION = "prompt_techniques"
CURATED_DIR = DATA_DIR / "curated"

# 한국어 별칭 맵 — 재인덱싱 시 Technique 라인에 한국어 동의어를 추가해
# 한국어 쿼리와의 임베딩 매칭 정확도를 높인다.
def _load_aliases() -> dict[str, list[str]]:
    p = DATA_DIR / "technique_aliases.json"
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

_ALIASES: dict[str, list[str]] = {}  # 프로세스당 1회 로드

# 카테고리 통제 어휘 — 일관된 라벨은 필터링·검색 품질을 높인다(제약조건 2/3).
CATEGORY_VOCAB = [
    "Reasoning",          # 추론 유도 (CoT, Self-Consistency 등)
    "Few-shot/Examples",  # 예시 기반
    "Role/Persona",       # 역할·페르소나 부여
    "Structure/Format",   # 출력 구조·형식 지정
    "Decomposition",      # 작업 분해 (Least-to-Most 등)
    "Self-correction",    # 자기검증·반성
    "Retrieval/Context",  # 외부 컨텍스트 주입
    "Safety/Constraints", # 제약·금지·가드레일
    "Optimization",       # 프롬프트 최적화·압축
    "Other",
]

# ── LLM 추출+채점 프롬프트 ────────────────────────────────────
_EXTRACT_SYSTEM = """당신은 RAG 지식베이스 큐레이터다.
입력으로 어떤 논문/문서에서 추출된 '원시 텍스트 조각'이 주어진다.

너의 임무는 '딸각(Ttalkak)' 서비스를 위한 지식 청크를 만드는 것이다.
딸각 = 사용자가 입력한 거친 프롬프트를, 검색된 '프롬프트 엔지니어링 기법'을
근거로 더 좋은 프롬프트로 자동 개선해 주는 서비스다.

따라서 너는 이 텍스트에서 "사용자의 프롬프트를 개선하는 데 재사용할 수 있는
프롬프트 기법/원칙"을 식별해 구조화한다.

[적합도(suitability) 채점 기준 — 1~10]
  9-10: 명확한 프롬프트 작성 기법이고, 바로 적용 가능한 템플릿/패턴이 있다.
        (예: Chain-of-Thought, Few-shot, Role Prompting, ReAct, Self-Consistency)
  7-8 : 프롬프트 품질을 높이는 실천적 원칙/가이드라인. 직접 템플릿이 없어도
        프롬프트 개선에 바로 응용할 수 있다. (예: "지시는 구체적으로", "출력 형식 명시")
  4-6 : 간접적/이론적. 모델 구조·학습·벤치마크·일반 NLP 이론 등 프롬프트 작성에
        바로 쓰기 어렵다.
  1-3 : 무관. 참고문헌, 감사의 글, 실험 셋업, 저자 소개, 딸각과 무관한 도메인 내용.

[엄격 규칙]
- 원문에 실제로 있는 내용만 사용한다. 없는 기법을 지어내지 마라.
- 한 텍스트 조각에 여러 기법이 있으면 각각 분리해 배열로 낸다.
- 기법이 전혀 없으면 빈 배열을 낸다.
- prompt_template 은 가능한 경우 자리표시자({목표},{대상},{형식} 등)를 쓴 재사용 템플릿으로.
- name(기법명)은 원문 명칭을 살린다(영문 고유명사는 영문 유지).
- category 는 다음 중 하나를 고른다: %s

[출력 — 반드시 JSON 객체 하나만]
{
  "techniques": [
    {
      "name": "기법명",
      "category": "위 목록 중 하나",
      "definition": "이 기법이 무엇인지 1~3문장",
      "use_when": "언제 쓰면 좋은가",
      "avoid_when": "언제는 피해야 하나(없으면 빈 문자열)",
      "prompt_template": "바로 붙여 쓸 수 있는 템플릿(없으면 빈 문자열)",
      "example": "프롬프트 개선에 적용한 짧은 예시(없으면 빈 문자열)",
      "sources": "원문에 근거가 되는 출처/저자(있으면)",
      "suitability": 1-10 정수,
      "suitability_reason": "그 점수를 준 한 줄 이유"
    }
  ]
}
""" % ", ".join(CATEGORY_VOCAB)

_LANG_INSTRUCTION = {
    "ko": "definition / use_when / avoid_when / example 의 '값'은 한국어로 작성하라. "
          "단, 기법 고유명사(name)와 템플릿 키워드는 원문을 유지해도 된다.",
    "en": "Write all field values in English.",
    "orig": "원문에 쓰인 언어를 그대로 유지하라.",
}


# ════════════════════════════════════════════════════════════
# 데이터 구조
# ════════════════════════════════════════════════════════════
@dataclass
class Technique:
    name: str = ""
    category: str = "Other"
    definition: str = ""
    use_when: str = ""
    avoid_when: str = ""
    prompt_template: str = ""
    example: str = ""
    sources: str = ""
    suitability: int = 0
    suitability_reason: str = ""
    origin_pdf: str = ""

    def chunk_id(self) -> str:
        """기법명 기반의 안정적 ID → 재실행 시 중복 삽입 대신 upsert."""
        norm = _normalize_name(self.name)
        h = hashlib.sha1(norm.encode("utf-8")).hexdigest()[:8]
        slug = re.sub(r"[^a-z0-9]+", "-", norm).strip("-")[:40] or "tech"
        return f"pe_{slug}_{h}"

    def to_document(self) -> str:
        """generator.py 가 읽는 것과 동일한 구조의 청크 본문.
        빈 필드는 줄을 생략해 청크를 깔끔하게 유지한다(검색 친화).
        technique_aliases.json 에 한국어 별칭이 있으면 Technique 라인에 병기한다."""
        global _ALIASES
        if not _ALIASES:
            _ALIASES = _load_aliases()
        aliases = _ALIASES.get(self.name, [])
        name_with_aliases = f"{self.name} ({', '.join(aliases)})" if aliases else self.name

        lines = [f"[{self.name}]"]
        lines.append(f"Technique: {name_with_aliases}")
        if self.category:
            lines.append(f"Category: {self.category}")
        if self.definition:
            lines.append(f"Definition: {self.definition}")
        if self.use_when:
            lines.append(f"Use When: {self.use_when}")
        if self.avoid_when:
            lines.append(f"Avoid When: {self.avoid_when}")
        if self.prompt_template:
            lines.append(f"Prompt Template:\n{self.prompt_template}")
        if self.example:
            lines.append(f"Example: {self.example}")
        return "\n".join(lines).strip()

    def to_metadata(self) -> dict:
        return {
            "chunk_id": self.chunk_id(),
            "source": self.name,
            "technique": self.name,
            "category": self.category,
            "sources": (self.sources or "")[:300],
            "suitability": self.suitability,
            "suitability_reason": (self.suitability_reason or "")[:300],
            "origin_pdf": self.origin_pdf,
        }


# ════════════════════════════════════════════════════════════
# 순수 함수 (LLM/DB 불필요 → 단독 테스트 가능)
# ════════════════════════════════════════════════════════════
def _normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip().lower())


def extract_pages(pdf_path: pathlib.Path) -> list[str]:
    """PDF → 페이지별 텍스트. 'Page N' 류 헤더는 제거."""
    reader = pypdf.PdfReader(str(pdf_path))
    pages = []
    for page in reader.pages:
        text = (page.extract_text() or "").strip()
        text = re.sub(r"^Page\s+\d+\s*\n?", "", text)
        pages.append(text)
    return pages


def make_windows(pages: list[str], window_chars: int = 6000,
                 overlap_pages: int = 1) -> list[str]:
    """페이지들을 window_chars 한도로 묶는다. 한 기법이 경계에서 잘리지 않도록
    직전 페이지 overlap_pages 개를 다음 윈도에 겹쳐 넣는다."""
    windows: list[str] = []
    buf: list[str] = []
    size = 0
    for pg in pages:
        pg = pg.strip()
        if not pg:
            continue
        if buf and size + len(pg) > window_chars:
            windows.append("\n\n".join(buf))
            buf = buf[-overlap_pages:] if overlap_pages > 0 else []
            size = sum(len(x) for x in buf)
        buf.append(pg)
        size += len(pg)
    if buf:
        windows.append("\n\n".join(buf))
    return windows


def passes_quality_gate(t: Technique, min_score: int) -> tuple[bool, str]:
    """제약조건 1·3: 적합도·완결성 게이트. (통과여부, 사유)"""
    if t.suitability < min_score:
        return False, f"적합도 {t.suitability} < {min_score}"
    if not t.name.strip():
        return False, "기법명 없음"
    if len(t.definition.strip()) < 10:
        return False, "정의가 너무 짧음(파편 의심)"
    if len(t.to_document()) < 120:
        return False, "청크 본문이 너무 짧음(파편 의심)"
    # category 는 그대로 보존한다. paper 모드는 프롬프트로 통제 어휘를 유도하고,
    # technique 모드는 사람이 부여한 분류(예: 'Reasoning Prompting')를 신뢰한다.
    return True, "ok"


def dedupe(techs: list[Technique]) -> list[Technique]:
    """기법명 정규화 기준 중복 제거 — 적합도가 더 높은 쪽을 남긴다(제약조건 3)."""
    best: dict[str, Technique] = {}
    for t in techs:
        key = _normalize_name(t.name)
        if not key:
            continue
        cur = best.get(key)
        if cur is None or t.suitability > cur.suitability:
            best[key] = t
    return list(best.values())


def semantic_dedupe(techs: list[Technique], collection: str, threshold: float,
                    model, compare_existing: bool
                    ) -> tuple[list[Technique], list[Technique]]:
    """임베딩 코사인 기반 중복 제거(이름이 달라도 의미가 같으면 제거).
    - 기존 코퍼스(collection)와 비교(compare_existing) + 배치 내부끼리도 비교.
    - max 유사도 >= threshold 면 신규 카드를 폐기. (survivors, dropped) 반환."""
    import numpy as np
    from sqlalchemy import select
    from app.core.db import SessionLocal, RagChunk

    if not techs:
        return [], []

    existing = None
    if compare_existing:
        with SessionLocal() as s:
            rows = s.execute(
                select(RagChunk.embedding).where(RagChunk.collection_name == collection)
            ).all()
        if rows:
            existing = np.asarray([r[0] for r in rows], dtype=np.float32)

    new_vecs = np.asarray(model.encode([t.to_document() for t in techs]), dtype=np.float32)

    def _max_cos(v: "np.ndarray", mat: "np.ndarray") -> float:
        vn = v / (np.linalg.norm(v) + 1e-12)
        mn = mat / (np.linalg.norm(mat, axis=1, keepdims=True) + 1e-12)
        return float((mn @ vn).max())

    survivors, dropped, kept_vecs = [], [], []
    for t, v in zip(techs, new_vecs):
        sim = 0.0
        if existing is not None:
            sim = max(sim, _max_cos(v, existing))
        if kept_vecs:
            sim = max(sim, _max_cos(v, np.asarray(kept_vecs, dtype=np.float32)))
        if sim >= threshold:
            t.suitability_reason = f"[의미중복 {sim:.2f}] {t.suitability_reason}"
            dropped.append(t)
        else:
            survivors.append(t)
            kept_vecs.append(v)
    return survivors, dropped


def _loads_loose(s: str) -> dict:
    """LLM JSON 응답 파서 — 코드펜스/잡텍스트가 섞여도 최대한 복구."""
    s = s.strip()
    s = re.sub(r"^```(?:json)?", "", s).strip()
    s = re.sub(r"```$", "", s).strip()
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass
    start, end = s.find("{"), s.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(s[start:end + 1])
        except json.JSONDecodeError:
            pass
    return {"techniques": []}


# ════════════════════════════════════════════════════════════
# LLM 백엔드 (generator.py 와 동일한 자동 선택 정책)
# ════════════════════════════════════════════════════════════
class LLMJudge:
    """원시 텍스트 → 구조화된 기법 배열(+적합도) JSON 추출기."""

    def __init__(self, lang: str = "ko", model: str | None = None):
        self.lang = lang
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
            raise EnvironmentError(
                "GROQ_API_KEY 또는 GEMINI_API_KEY 를 .env에 설정해주세요."
            )
        print(f"[LLMJudge] 백엔드={self.backend} model={self.model} lang={lang}")

    def _system(self) -> str:
        return _EXTRACT_SYSTEM + "\n[언어 규칙] " + _LANG_INSTRUCTION.get(
            self.lang, _LANG_INSTRUCTION["ko"]
        )

    def extract(self, window_text: str) -> list[dict]:
        user = f"[원시 텍스트 조각]\n{window_text}"
        raw = self._complete(self._system(), user)
        data = _loads_loose(raw)
        techs = data.get("techniques", [])
        return techs if isinstance(techs, list) else []

    def score_one(self, t: "Technique") -> tuple[int, str]:
        """이미 구조화된 기법 1개에 적합도만 매긴다(기법 모드 --score 공정비교용)."""
        sys_p = (
            "당신은 '딸각'(사용자 프롬프트를 프롬프트 엔지니어링 기법으로 개선해 주는 "
            "서비스)의 지식 큐레이터다. 아래 기법이 딸각에 얼마나 적합한지 1~10으로 채점하라.\n"
            + _EXTRACT_SYSTEM[_EXTRACT_SYSTEM.find("[적합도"):_EXTRACT_SYSTEM.find("[엄격 규칙]")]
            + '\n출력은 JSON 하나: {"suitability": 1-10 정수, "reason": "한 줄 이유"}'
        )
        user = (f"기법명: {t.name}\n카테고리: {t.category}\n정의: {t.definition}\n"
                f"사용 시점: {t.use_when}\n템플릿: {t.prompt_template}")
        data = _loads_loose(self._complete(sys_p, user))
        return _safe_int(data.get("suitability", 0)), str(data.get("reason", "")).strip()

    # 레이트리밋 대기 총예산(초/호출). Groq 무료 티어 TPD는 롤링 24h 창이라
    # "try again in Xm" 만큼 기다리면 점진적으로 풀린다 → 장시간 배치도 완주 가능.
    RATE_LIMIT_BUDGET = 3600.0

    @staticmethod
    def _parse_retry_delay(msg: str) -> float | None:
        """429 메시지의 'try again in 17m19.392s' / '7.9s' 를 초로 파싱."""
        m = re.search(r"try again in (?:(\d+)m)?([\d.]+)s", msg)
        if not m:
            return None
        return int(m.group(1) or 0) * 60 + float(m.group(2))

    def _complete(self, system: str, user: str, retries: int = 3) -> str:
        last = None
        attempt = 0            # 일반 오류 카운터 (레이트리밋 대기는 예산으로 별도 관리)
        rl_budget = self.RATE_LIMIT_BUDGET
        while True:
            try:
                if self.backend == "groq":
                    resp = self.client.chat.completions.create(
                        model=self.model,
                        messages=[
                            {"role": "system", "content": system},
                            {"role": "user", "content": user},
                        ],
                        temperature=0.2,
                        max_tokens=4096,
                        response_format={"type": "json_object"},
                    )
                    return resp.choices[0].message.content
                else:
                    from google.genai import types
                    resp = self.client.models.generate_content(
                        model=self.model,
                        contents=f"{system}\n\n{user}",
                        config=types.GenerateContentConfig(
                            max_output_tokens=4096,
                            temperature=0.2,
                            response_mime_type="application/json",
                        ),
                    )
                    return resp.text
            except Exception as e:  # noqa: BLE001 - 백엔드별 예외가 제각각
                last = e
                msg = str(e)
                # '요청 자체가 너무 큼'(413 too large)은 기다려도 안 풀림 → 즉시 실패
                # (해결책: --window-chars 축소 또는 TPM 큰 모델 사용)
                if "Request too large" in msg or "reduce your message size" in msg:
                    raise RuntimeError(f"요청이 모델 TPM 한도보다 큼 → --window-chars 축소 필요: {e}") from e
                if "rate_limit" in msg or "429" in msg:
                    # API가 알려준 회복 시각만큼 대기(+10s 버퍼, 상한 15분). 예산 소진 시 포기.
                    wait = min((self._parse_retry_delay(msg) or 60) + 10, 900)
                    if rl_budget < wait:
                        raise RuntimeError(f"레이트리밋 대기 예산({self.RATE_LIMIT_BUDGET:.0f}s) 소진: {e}") from e
                    rl_budget -= wait
                    print(f"[LLMJudge] 레이트리밋 → {wait:.0f}s 대기 (잔여 예산 {rl_budget/60:.0f}분)")
                    time.sleep(wait)
                    continue
                attempt += 1
                if attempt >= retries:
                    break
                wait = 5 * attempt
                print(f"[LLMJudge] 오류({attempt}/{retries}): {e} → {wait}s 대기")
                time.sleep(wait)
        raise RuntimeError(f"LLM 호출 실패: {last}")


# ════════════════════════════════════════════════════════════
# 파이프라인 — 추출(모드별) · 큐레이션(공통)
# ════════════════════════════════════════════════════════════
# 사람이 직접 청킹한 '기법 PDF'의 필드 패턴 (예: rag_prompt_engineering_100_chunks_v1.pdf)
_TECH_FIELDS = ["Technique", "Category", "Definition", "Use When",
                "Avoid When", "Prompt Template", "Project Usage Example", "Sources"]


def extract_paper(pdf_path: pathlib.Path, judge: LLMJudge, *,
                  window_chars: int, limit: int | None) -> list[Technique]:
    """[논문 모드] 임의 PDF → LLM 자동 청킹·채점 → 원시 Technique 목록."""
    pages = extract_pages(pdf_path)
    windows = make_windows(pages, window_chars=window_chars)
    if limit:
        windows = windows[:limit]
    print(f"   [paper] 페이지 {len(pages)} → 윈도 {len(windows)} (LLM 자동 청킹)")

    raw: list[Technique] = []
    for i, w in enumerate(windows, 1):
        print(f"   ⟳ 윈도 {i}/{len(windows)} 추출 중...", flush=True)
        for d in judge.extract(w):
            raw.append(Technique(
                name=str(d.get("name", "")).strip(),
                category=str(d.get("category", "Other")).strip() or "Other",
                definition=str(d.get("definition", "")).strip(),
                use_when=str(d.get("use_when", "")).strip(),
                avoid_when=str(d.get("avoid_when", "")).strip(),
                prompt_template=str(d.get("prompt_template", "")).strip(),
                example=str(d.get("example", "")).strip(),
                sources=str(d.get("sources", "")).strip(),
                suitability=_safe_int(d.get("suitability", 0)),
                suitability_reason=str(d.get("suitability_reason", "")).strip(),
                origin_pdf=pdf_path.name,
            ))
    return raw


def extract_technique(pdf_path: pathlib.Path) -> list[Technique]:
    """[기법 모드] 사람이 'Chunk NNN' 포맷으로 직접 청킹한 PDF → 결정론적 파싱.
    LLM을 쓰지 않으므로 빠르고 무료이며, 사람 큐레이션을 신뢰해 적합도=10 부여."""
    full = "\n\n".join(extract_pages(pdf_path))
    starts = [(m.start(), m.group(2).strip())
              for m in re.finditer(r"Chunk\s+(\d{3})\.\s+(.+)", full)]
    print(f"   [technique] 'Chunk NNN' 블록 {len(starts)}개 결정론적 파싱")

    raw: list[Technique] = []
    for i, (start, title) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else len(full)
        body = full[start:end].strip()

        def field(key: str) -> str:
            m = re.search(rf"{re.escape(key)}:\s*(.+?)(?=\n[A-Z][a-zA-Z /]+:|$)",
                          body, re.DOTALL)
            return m.group(1).strip() if m else ""

        name = field("Technique") or title
        raw.append(Technique(
            name=name,
            category=field("Category") or "Other",
            definition=field("Definition"),
            use_when=field("Use When"),
            avoid_when=field("Avoid When"),
            prompt_template=field("Prompt Template"),
            example=field("Project Usage Example"),
            sources=field("Sources"),
            suitability=10,
            suitability_reason="사람이 직접 청킹한 기법(human-curated)",
            origin_pdf=pdf_path.name,
        ))
    return raw


def curate(raw: list[Technique], min_score: int
           ) -> tuple[list[Technique], list[Technique]]:
    """공통 큐레이션 — 중복 제거 + 완결성/적합도 게이트."""
    raw = dedupe(raw)
    kept, rejected = [], []
    for t in raw:
        ok, reason = passes_quality_gate(t, min_score)
        if ok:
            kept.append(t)
        else:
            t.suitability_reason = f"[탈락:{reason}] {t.suitability_reason}"
            rejected.append(t)
    kept.sort(key=lambda x: x.suitability, reverse=True)
    print(f"   ✅ 통과 {len(kept)} / ❌ 탈락 {len(rejected)} (고유 기법 {len(raw)})")
    return kept, rejected


def _safe_int(v) -> int:
    try:
        return max(0, min(10, int(round(float(v)))))
    except (TypeError, ValueError):
        return 0


def write_jsonl(path: pathlib.Path, techs: list[Technique]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for t in techs:
            row = asdict(t)
            row["chunk_id"] = t.chunk_id()
            row["document"] = t.to_document()
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def print_summary(kept: list[Technique]) -> None:
    if not kept:
        print("\n(통과한 청크가 없습니다)")
        return
    print("\n┌─ 인덱싱 대상 요약 " + "─" * 40)
    for t in kept:
        print(f"│ [{t.suitability:2d}] {t.category:18s} {t.name[:48]}")
    print("└" + "─" * 58)


# ════════════════════════════════════════════════════════════
# kept.jsonl 직접 인덱싱 (LLM 불필요 — 재현·부분실패 복구용)
# ════════════════════════════════════════════════════════════
def index_from_jsonl(paths: list[pathlib.Path], collection: str, *,
                     dry_run: bool, semantic: bool, threshold: float) -> None:
    """추출·큐레이션이 끝난 kept.jsonl 을 바로 인덱싱한다.
    쿼터 소진으로 인덱싱 전에 죽었거나, 같은 산출물을 다른 컬렉션에 재적재할 때 사용.
    이름 정확일치 + (옵션) 의미 중복제거를 PDF 경로와 동일하게 적용한다."""
    from sqlalchemy import select
    from app.core.db import SessionLocal, RagChunk

    fields = set(Technique.__dataclass_fields__)
    techs: list[Technique] = []
    for p in paths:
        if not p.exists():
            print(f"⚠️  건너뜀(없음): {p}")
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            row = json.loads(line)
            techs.append(Technique(**{k: v for k, v in row.items() if k in fields}))
    print(f"▶ kept.jsonl 로드: {len(techs)}개 (파일 {len(paths)}개)")
    if not techs:
        sys.exit(1)

    # 이름 정확일치 중복 제거 (기존 컬렉션의 technique 메타와 비교)
    with SessionLocal() as session:
        metas = session.execute(
            select(RagChunk.chunk_metadata).where(RagChunk.collection_name == collection)
        ).scalars().all()
    existing = {_normalize_name((m or {}).get("technique", "")) for m in metas}
    kept = [t for t in techs if _normalize_name(t.name) not in existing]
    if len(kept) != len(techs):
        print(f"   이름 중복 폐기 {len(techs) - len(kept)}개: "
              f"{[t.name for t in techs if _normalize_name(t.name) in existing]}")

    if semantic and kept:
        from app.core.embeddings import get_model
        kept, dropped = semantic_dedupe(kept, collection, threshold, get_model(), True)
        if dropped:
            print(f"   의미 중복 폐기 {len(dropped)}개: {[t.name for t in dropped]}")

    print(f"▶ 적재 대상 {len(kept)}개: {[t.name for t in kept]}")
    if dry_run:
        print("🧪 --dry-run: DB 저장 생략.")
        return
    if kept:
        from app.rag.indexer import Indexer
        Indexer().index(chunks=[t.to_document() for t in kept],
                        metadata=[t.to_metadata() for t in kept],
                        collection_name=collection)
    print(f"🎉 완료: {len(kept)}개 → '{collection}'")


# ════════════════════════════════════════════════════════════
# 메인
# ════════════════════════════════════════════════════════════
def collect_pdfs(paths: list[pathlib.Path]) -> list[pathlib.Path]:
    """디렉터리는 하위까지 재귀(rglob)로 훑는다 — pdf_crawler 의 중첩 출력
    (downloaded_pdfs/<source>/*.pdf)도 한 번에 수집되도록."""
    out: list[pathlib.Path] = []
    for p in paths:
        if p.is_dir():
            out.extend(sorted(p.rglob("*.pdf")))
        elif p.suffix.lower() == ".pdf" and p.exists():
            out.append(p)
        else:
            print(f"⚠️  건너뜀(PDF 아님/없음): {p}")
    return sorted(set(out))


def main() -> None:
    ap = argparse.ArgumentParser(
        description="논문/기법 PDF → 파싱·청킹·적합도 큐레이션 → MySQL 인덱싱(딸각 RAG)"
    )
    ap.add_argument("--pdf", type=pathlib.Path, nargs="+", default=None,
                    help="PDF 파일 또는 디렉터리(여러 개 가능)")
    ap.add_argument("--from-jsonl", type=pathlib.Path, nargs="+", default=None,
                    help="data/curated/*.kept.jsonl 을 LLM 없이 바로 인덱싱 "
                         "(재현·부분실패 복구용 — 이름/의미 중복제거는 동일 적용)")
    ap.add_argument("--mode", choices=["paper", "technique"], default="paper",
                    help="paper=논문 자동 청킹(LLM) / technique=사람이 직접 청킹한 "
                         "'Chunk NNN' PDF 결정론적 파싱 (기본 paper)")
    ap.add_argument("--collection", default=DEFAULT_COLLECTION,
                    help="A/B 비교 시 모드별로 다른 이름 권장 (예: pe_auto / pe_manual)")
    ap.add_argument("--min-score", type=int, default=7,
                    help="이 점수 미만은 폐기 (제약조건 1, 기본 7)")
    ap.add_argument("--score", action="store_true",
                    help="technique 모드에서도 동일 LLM 채점기로 적합도 산정(공정 비교용)")
    ap.add_argument("--lang", choices=["ko", "en", "orig"], default="ko",
                    help="청크 필드 값 언어 (기본 ko: 한국어 질의 검색에 유리)")
    ap.add_argument("--model", default=None, help="LLM 모델 오버라이드")
    ap.add_argument("--window-chars", type=int, default=6000)
    ap.add_argument("--limit", type=int, default=None,
                    help="PDF당 처리할 윈도 수 제한(검수/저비용 테스트용)")
    ap.add_argument("--dry-run", action="store_true",
                    help="DB에 저장하지 않고 검수 산출물(JSONL)만 생성")
    ap.add_argument("--replace", action="store_true",
                    help="인덱싱 전 컬렉션을 비운다")
    ap.add_argument("--no-semantic-dedup", action="store_true",
                    help="기존 코퍼스와의 임베딩 기반 중복 제거를 끈다")
    ap.add_argument("--sim-threshold", type=float, default=0.90,
                    help="의미 중복 판정 코사인 임계값 (기본 0.90)")
    args = ap.parse_args()

    # ── kept.jsonl 직접 인덱싱 경로 (LLM 불필요) ──
    if args.from_jsonl:
        index_from_jsonl(args.from_jsonl, args.collection,
                         dry_run=args.dry_run,
                         semantic=not args.no_semantic_dedup,
                         threshold=args.sim_threshold)
        return

    if not args.pdf:
        print("❌ --pdf 또는 --from-jsonl 중 하나가 필요합니다.")
        sys.exit(1)
    pdfs = collect_pdfs(args.pdf)
    if not pdfs:
        print("❌ 처리할 PDF가 없습니다.")
        sys.exit(1)

    # LLM은 paper 모드 또는 technique --score 일 때만 필요(기법 기본은 무료/오프라인)
    need_llm = args.mode == "paper" or args.score
    judge = LLMJudge(lang=args.lang, model=args.model) if need_llm else None
    print(f"▶ 모드: {args.mode} | 컬렉션: {args.collection} | "
          f"min-score: {args.min_score}{' | LLM 채점 ON' if args.score else ''}")

    all_kept: list[Technique] = []
    for pdf in pdfs:
        print(f"\n📄 파싱: {pdf.name}")
        if args.mode == "paper":
            raw = extract_paper(pdf, judge, window_chars=args.window_chars,
                                limit=args.limit)
        else:
            raw = extract_technique(pdf)
            if args.score:  # 사람 청킹분도 동일 잣대로 채점
                for t in raw:
                    t.suitability, t.suitability_reason = judge.score_one(t)

        kept, rejected = curate(raw, args.min_score)
        stem = f"{pdf.stem}.{args.mode}"
        write_jsonl(CURATED_DIR / f"{stem}.kept.jsonl", kept)
        write_jsonl(CURATED_DIR / f"{stem}.rejected.jsonl", rejected)
        all_kept.extend(kept)

    # 전체 PDF 통합 후 한 번 더 중복 제거(다른 PDF에 같은 기법이 있을 수 있음)
    all_kept = dedupe(all_kept)
    all_kept.sort(key=lambda x: x.suitability, reverse=True)
    print_summary(all_kept)
    print(f"\n📦 산출물: {CURATED_DIR}/*.jsonl")

    if args.dry_run:
        print("\n🧪 --dry-run: DB 저장 생략. JSONL만 확인하세요.")
        return
    if not all_kept:
        print("\n저장할 청크가 없어 종료합니다.")
        return

    # ── 이름 정확일치 중복 제거 (기존 컬렉션과 비교) ──
    # 의미 dedupe는 설명 문구가 다르면(코사인 < 임계) 동명 기법을 놓친다 —
    # 2026-07-09 2차 적재에서 CoT·Few-Shot·Zero-Shot·Role 4건 유입 사고.
    if not args.replace:
        from sqlalchemy import select
        from app.core.db import SessionLocal, RagChunk
        with SessionLocal() as session:
            metas = session.execute(
                select(RagChunk.chunk_metadata).where(RagChunk.collection_name == args.collection)
            ).scalars().all()
        existing = {_normalize_name((m or {}).get("technique", "")) for m in metas}
        name_dropped = [t for t in all_kept if _normalize_name(t.name) in existing]
        all_kept = [t for t in all_kept if _normalize_name(t.name) not in existing]
        if name_dropped:
            print(f"🔁 이름 중복 폐기 {len(name_dropped)}개: {[t.name for t in name_dropped]}")

    # ── 의미 기반 중복 제거 (이름이 달라도 같은 기법이면 코퍼스 오염 방지) ──
    if not args.no_semantic_dedup:
        from app.core.embeddings import get_model
        all_kept, sem_dropped = semantic_dedupe(
            all_kept, args.collection, args.sim_threshold,
            get_model("BAAI/bge-m3"),
            compare_existing=not args.replace,  # replace면 기존을 비울 거라 비교 불필요
        )
        print(f"🔁 의미 중복 제거: {len(sem_dropped)}개 스킵 (임계 {args.sim_threshold}) "
              f"→ 인덱싱 대상 {len(all_kept)}개")
        if sem_dropped:
            write_jsonl(CURATED_DIR / "semantic_dropped.jsonl", sem_dropped)

    if not all_kept:
        print("\n중복 제거 후 저장할 청크가 없어 종료합니다.")
        return

    # ── MySQL 인덱싱 (기존 인프라 재사용) ──
    from app.rag.indexer import Indexer
    indexer = Indexer(model_name="BAAI/bge-m3")
    if args.replace:
        removed = indexer.clear_collection(args.collection)
        print(f"[replace] 기존 {removed}개 삭제")

    texts = [t.to_document() for t in all_kept]
    metas = [t.to_metadata() for t in all_kept]
    total = indexer.index(chunks=texts, metadata=metas,
                          collection_name=args.collection)
    print(f"\n🎉 완료: {total}개 → '{args.collection}' 컬렉션 (MySQL)")


if __name__ == "__main__":
    main()

import hmac
import os
import re
import uvicorn
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

# .env 는 app/__init__.py 에서 로드됨
from app.rag.indexer import Indexer
from app.rag.retriever import Retriever
from app.rag.generator import Generator
from app.rag import query_transform

app = FastAPI(title="RAG Server", description="bge-m3 + MySQL + reranker + LLM")


# ── /index 보호 ──────────────────────────────────────────────
# RAG_INDEX_API_KEY 가 설정돼 있으면 X-API-Key 헤더가 일치해야 인덱싱 허용.
# 미설정이면 로컬 개발 편의상 허용하되 기동 시 경고. (/query 는 제품 API라 공개 유지)
_INDEX_API_KEY = os.environ.get("RAG_INDEX_API_KEY", "")
if not _INDEX_API_KEY:
    print("[Main] ⚠️  RAG_INDEX_API_KEY 미설정 — /index 가 무인증입니다. 배포 시 .env에 설정하세요.")


def _verify_index_key(provided: str | None) -> None:
    """키가 설정된 경우에만 검사. 불일치 시 403."""
    if not _INDEX_API_KEY:
        return
    if not provided or not hmac.compare_digest(provided, _INDEX_API_KEY):
        raise HTTPException(status_code=403, detail="X-API-Key 가 없거나 올바르지 않습니다.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

indexer  = Indexer()
# fetch_k=20: 측정상 파레토 최적 — 50은 전 지표 열세+2.5배 느림, 10은 지연 절반이나 Recall@5 -4.5%p
# (WORKLOG 2026-07-05 스윕 표 참조. 변경 시 python -m eval.run_eval --fetch-k 로 재측정)
retriever = Retriever(use_reranker=True, use_hybrid=False, fetch_k=20)  # 리랭커 단독 (평가상 최적)
generator = Generator()


# ── Request / Response 스키마 ────────────────────────────────
class IndexRequest(BaseModel):
    chunks:          list[str]
    metadata:        Optional[list[dict]] = None
    collection_name: str = "papers"

class IndexResponse(BaseModel):
    indexed_count:   int
    collection_name: str

class QueryRequest(BaseModel):
    query:               str
    collection_name:     str = "prompt_techniques"
    top_k:               int = 5
    model:               str = "gemini-2.0-flash"
    history:             Optional[list[dict]] = None   # [{role, content}, ...] 대화 기록
    use_reranker:        bool = True    # 2단계 리랭크 (검증: 단독이 최고)
    use_hybrid:          bool = False   # dense+BM25 하이브리드 — 이 코퍼스에선 악화로 기본 off(opt-in)
    use_query_transform: bool = False   # 키워드 쿼리변환(실험적) — 코퍼스 미스매치로 기본 off
    use_hyde:            bool = False   # HyDE 가상문서 쿼리(실험적)
    min_score:           float = 0.40   # 유효 유사도 컷(dense 코사인). 측정상 recall 무손실 지점

class QueryResponse(BaseModel):
    answer:              str            # 전체 응답 (화면 표시용)
    improved_prompt:     str            # 개선된 프롬프트만 (Execute용)
    sources:             list[dict]
    techniques_applied:  list[str] = []  # 적용한 기법명 목록
    changes:             list[str] = []  # 개선 포인트 줄 목록


# ── 개선된 프롬프트 추출 ─────────────────────────────────────
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


# ── 엔드포인트 ───────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/index", response_model=IndexResponse)
def index_chunks(req: IndexRequest,
                 x_api_key: str | None = Header(default=None, alias="X-API-Key")):
    _verify_index_key(x_api_key)
    count = indexer.index(
        chunks=req.chunks,
        metadata=req.metadata,
        collection_name=req.collection_name,
    )
    return IndexResponse(indexed_count=count, collection_name=req.collection_name)


@app.post("/query", response_model=QueryResponse)
def query(req: QueryRequest):
    history = req.history or []

    # 검색에는 '기법 검색용 쿼리'를 쓰고, 생성에는 원본 프롬프트를 그대로 쓴다.
    if req.use_hyde:
        search_query = query_transform.hyde(req.query, history)
    elif req.use_query_transform:
        search_query = query_transform.transform(req.query, history)
    else:
        search_query = req.query

    retrieved = retriever.search(
        query=search_query,
        collection_name=req.collection_name,
        top_k=req.top_k,
        use_reranker=req.use_reranker,
        use_hybrid=req.use_hybrid,
        min_score=req.min_score,
    )
    # 첫 턴(대화 기록 없음)에 매칭 결과가 없을 때만 404.
    # min_score 컷으로 전부 걸러졌다면 = 정말 무관한 입력 → 404가 의도된 동작.
    # 후속 피드백 턴은 기법 검색이 약해도 대화 맥락으로 이어서 개선한다.
    if not retrieved and not history:
        raise HTTPException(
            status_code=404,
            detail="입력한 프롬프트와 관련된 개선 기법을 찾지 못했습니다."
        )

    try:
        answer = generator.generate(
            query=req.query,
            contexts=retrieved,
            model=req.model,
            history=history,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # LLM이 빈/None 응답을 주면 그대로 추출 단계에 넘기지 않고 명확히 실패시킨다
    # (None → extract_improved_prompt(None) TypeError로 500 나던 것을 방지).
    if not (answer and answer.strip()):
        raise HTTPException(
            status_code=503,
            detail="생성 결과가 비어 있습니다. 잠시 후 다시 시도해주세요."
        )

    # 개선된 프롬프트만 별도 추출 → Execute 시 이 값만 전송
    improved_prompt = extract_improved_prompt(answer)

    sources = [
        {"text": r["text"][:300], "metadata": r["metadata"], "score": r["score"]}
        for r in retrieved
    ]
    return QueryResponse(
        answer=answer,
        improved_prompt=improved_prompt,
        sources=sources,
        techniques_applied=extract_applied_techniques(answer),
        changes=extract_changes(answer),
    )


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

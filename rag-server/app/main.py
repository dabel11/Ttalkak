import hmac
import os
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
# 파싱·복원 순수 함수 (eval 스크립트 하위호환 위해 동일 이름 재노출)
from app.rag.postprocess import (
    parse_generation, build_answer,
    extract_improved_prompt, extract_applied_techniques, extract_changes,
)

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
    answer:              str            # 전체 응답 (화면 표시용 마크다운 — JSON에서 복원)
    improved_prompt:     str            # 개선된 프롬프트만 (Execute용)
    sources:             list[dict]
    techniques_applied:  list[str] = []  # 적용한 기법명 목록
    changes:             list[str] = []  # 개선 포인트 줄 목록
    score:               Optional[int] = None  # LLM 자체 평가(1~10, 개선 모드만) — 설계문서 {improved, score, changes[]}


def run_generation(query: str, contexts: list[dict], model: str,
                   history: list[dict]) -> dict:
    """검색 결과 → 생성 → 구조화 필드 추출까지의 공용 경로 (/query·eval 공유).
    반환: {answer, improved_prompt, techniques_applied, changes, score, structured}
    JSON 파싱 실패 시 레거시 정규식 추출로 폴백(structured=False)."""
    raw = generator.generate(query=query, contexts=contexts, model=model, history=history)
    if not (raw and raw.strip()):
        raise RuntimeError("생성 결과가 비어 있습니다.")

    p = parse_generation(raw)
    if p is not None:
        improved = str(p.get("improved_prompt") or "") if p["mode"] == "improve" else ""
        techs = [t.get("name", "") if isinstance(t, dict) else str(t)
                 for t in (p.get("techniques") or [])]
        score = p.get("score")
        return {
            "answer":             build_answer(p),
            "improved_prompt":    improved.strip(),
            "techniques_applied": [t for t in techs if t],
            "changes":            [str(c) for c in (p.get("changes") or [])],
            "score":              int(score) if isinstance(score, (int, float)) else None,
            "structured":         True,
        }

    # 폴백: 모델이 JSON을 안 지킨 경우 — 원문을 그대로 표시하고 정규식으로 추출
    print("[Main] 구조화 JSON 파싱 실패 → 정규식 폴백")
    return {
        "answer":             raw,
        "improved_prompt":    extract_improved_prompt(raw),
        "techniques_applied": extract_applied_techniques(raw),
        "changes":            extract_changes(raw),
        "score":              None,
        "structured":         False,
    }


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
        gen = run_generation(req.query, retrieved, req.model, history)
    except RuntimeError as e:
        # 빈 생성·백엔드 한도 등 — 명확히 503 (extract(None) 500 크래시 방지 겸용)
        raise HTTPException(status_code=503, detail=str(e))

    sources = [
        {"text": r["text"][:300], "metadata": r["metadata"], "score": r["score"]}
        for r in retrieved
    ]
    return QueryResponse(
        answer=gen["answer"],
        improved_prompt=gen["improved_prompt"],
        sources=sources,
        techniques_applied=gen["techniques_applied"],
        changes=gen["changes"],
        score=gen["score"],
    )


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

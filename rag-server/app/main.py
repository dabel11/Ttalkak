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
from app.rag import query_transform, analyzer
# 파싱·복원 순수 함수 (eval 스크립트 하위호환 위해 동일 이름 재노출)
from app.rag.postprocess import (
    parse_generation, build_answer, assemble_fields,
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
    use_query_transform: bool = False   # 키워드 쿼리변환 — 카드 장르 미스매치로 hyde보다 열등, off
    use_hyde:            bool = False   # HyDE — 기본 off (2026-07-30 재평가).
    # HyDE는 dense 코사인/404는 개선하지만 R@5 정확도를 크게 해친다(170코퍼스 실측: raw R@5 0.763
    # vs +HyDE 0.441, Hit@1 0.627 vs 0.271). 카드 장르로 재작성하는 성질이 제네릭 카드 오회수를
    # 유발. 404(장르 미스매치) 문제는 min_score 하향 또는 하드404 폐지로 별도 해결 예정(미결).
    min_score:           float = 0.40   # 유효 유사도 컷(dense 코사인). 측정상 recall 무손실 지점
    # ── C(타입별 멀티 컬렉션): 기법 카드에 더해 '유사 요청 개선 사례'를 함께 주입 ──
    # A안 헤드투헤드 검증(2026-07-23): 예시 승률 66.7%·Δ+0.83(방향 신호). min_score 미달 시
    # 자동 제외 → 관련 예시 없으면 기존과 동일 동작(무회귀). 정밀 재측정 후 유지/조정.
    use_examples:        bool = True    # 예시 컬렉션 주입 on/off (per-request 로 끌 수 있음)
    example_collection:  str  = "prompt_examples"
    n_examples:          int  = 2       # 주입할 예시 수(상한 — min_score 컷으로 줄 수 있음)
    example_min_score:   float = 0.40   # 예시 유효 유사도 컷(dense 코사인)

class QueryResponse(BaseModel):
    mode:                str            # "improve" | "ask" — 프론트 분기의 단일 기준(추측 금지)
    answer:              str            # 전체 응답 (화면 표시용 마크다운 — 항상 렌더 가능한 폴백)
    improved_prompt:     str = ""       # 개선된 프롬프트만 (Execute용). ask 모드면 ""
    sources:             list[dict] = []
    techniques_applied:  list[str] = []  # 적용한 기법명 목록 (개선 모드)
    changes:             list[str] = []  # 개선 포인트 줄 목록 (개선 모드)
    score:               Optional[int] = None  # LLM 자체 평가(1~10, 개선 모드만)
    summary:             str = ""       # 한 줄 요약 (개선: 무엇을 개선했는지 / 질문: 파악내용+왜 묻는지)
    # 규약 v3 §10: questions 는 객체 배열 {field, question, reason, importance}.
    # field 로 빈칸(플레이스홀더)·후속 답변과 1:1 연결한다. 하이브리드라 improve 모드에서도
    # 비어있지 않을 수 있다(실행 가능한 개선안 + 더 정확하게 만들 선택 질문).
    questions:           list[dict] = []
    # 1단계 분석기가 도출한 필드 상태(검증·디버깅용). 분석 실패 시 [].
    fields:              list[dict] = []


def run_generation(query: str, contexts: list[dict], model: str,
                   history: list[dict], use_analyzer: bool = True) -> dict:
    """검색 결과 → (1단계 분석) → 생성 → 구조화 필드 조립 (/query·eval 공유).

    규약 v3: 1단계 분석기(temp 0.2)가 요청에 필요한 필드를 동적으로 도출하고,
    2단계 생성기(temp 0.7)가 그 필드 상태를 소비해 개선안·빈칸·질문을 만든다.
    분석 실패(키 없음·한도 초과 등)면 analysis=None 으로 기존 단일 단계와 동일 동작.

    반환: {mode, answer, improved_prompt, techniques_applied, changes, score,
           summary, questions, fields, structured}.
    필드 조립은 순수 함수 assemble_fields() 가 담당(LLM 없이 단위 테스트됨).
    JSON 파싱 실패 시 레거시 정규식 추출로 폴백(structured=False)."""
    analysis = analyzer.analyze(query, history) if use_analyzer else None

    raw = generator.generate(query=query, contexts=contexts, model=model,
                             history=history, analysis=analysis)
    if not (raw and raw.strip()):
        raise RuntimeError("생성 결과가 비어 있습니다.")

    result = assemble_fields(raw)
    if not result["structured"]:
        print("[Main] 구조화 JSON 파싱 실패 → 정규식 폴백")
    # 1단계 분석 결과를 응답에 함께 노출(검증·디버깅용). 분석 없으면 [].
    result["fields"] = (analysis or {}).get("fields", [])
    return result


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
    # 첫 턴(대화 기록 없음)에 매칭 결과가 0건일 때만 404.
    # use_hyde=True 기본에서는 쿼리가 카드 장르로 재작성돼 거의 항상 min_score를 통과하므로
    # 이 404는 실질적으로 hyde 폴백(Groq 한도 초과 등) + 원본마저 0.40 미만인 드문 경우에만 발동한다.
    # 후속 피드백 턴은 기법 검색이 약해도 대화 맥락으로 이어서 개선한다.
    # (404 판정은 '기법' 기준 — 예시는 보조 재료라 무관 입력을 구제하지 않는다.)
    if not retrieved and not history:
        raise HTTPException(
            status_code=404,
            detail="입력한 프롬프트와 관련된 개선 기법을 찾지 못했습니다."
        )

    # ── C(타입별 멀티 컬렉션): 예시 컬렉션에서 '유사 요청 개선 사례'를 별도 검색해 주입 ──
    # 예시는 원본 거친 요청(req.query)과 매칭한다(기법 검색용 변환쿼리가 아님 — 예시의 'before'가
    # 사용자 원 프롬프트를 닮았을수록 유용). 리랭커는 생략(20건 규모 typed 컬렉션엔 dense로 충분,
    # 쿼리당 리랭크 2회 지연 방지). min_score 미달·빈 컬렉션·검색 실패는 모두 '예시 없음'으로 흡수.
    examples: list[dict] = []
    if req.use_examples and req.n_examples > 0:
        try:
            examples = retriever.search(
                query=req.query,
                collection_name=req.example_collection,
                top_k=req.n_examples,
                use_reranker=False,
                use_hybrid=False,
                min_score=req.example_min_score,
            )
        except Exception as e:                       # 예시 실패가 본 개선을 막지 않게
            print(f"[Main] 예시 검색 실패(무시하고 기법만으로 진행): {e}")
            examples = []

    try:
        # 기법 + 예시를 함께 생성기에 전달(generator 가 [참고 기법]/[참고 예시] 블록으로 분리 렌더)
        gen = run_generation(req.query, retrieved + examples, req.model, history)
    except RuntimeError as e:
        # 빈 생성·백엔드 한도 등 — 명확히 503 (extract(None) 500 크래시 방지 겸용)
        raise HTTPException(status_code=503, detail=str(e))

    sources = [
        {"text": r["text"][:300], "metadata": r["metadata"], "score": r["score"]}
        for r in retrieved
    ]
    return QueryResponse(
        mode=gen["mode"],
        answer=gen["answer"],
        improved_prompt=gen["improved_prompt"],
        sources=sources,
        techniques_applied=gen["techniques_applied"],
        changes=gen["changes"],
        score=gen["score"],
        summary=gen["summary"],
        questions=gen["questions"],
        fields=gen.get("fields", []),
    )


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

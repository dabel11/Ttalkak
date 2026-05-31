import re
import pathlib
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

from indexer import Indexer
from retriever import Retriever
from generator import Generator

# main.py 위치 기준 절대경로
_BASE = pathlib.Path(__file__).parent
load_dotenv(dotenv_path=_BASE / "python-reg-server" / ".env")

app = FastAPI(title="RAG Server", description="bge-m3 + ChromaDB + LLM")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_CHROMA_PATH = str(_BASE / "chroma_db")

indexer  = Indexer(chroma_path=_CHROMA_PATH)
retriever = Retriever(chroma_path=_CHROMA_PATH)
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
    query:           str
    collection_name: str = "prompt_techniques"
    top_k:           int = 5
    model:           str = "gemini-2.0-flash"
    history:         Optional[list[dict]] = None   # [{role, content}, ...] 대화 기록

class QueryResponse(BaseModel):
    answer:           str          # 전체 응답 (화면 표시용)
    improved_prompt:  str          # 개선된 프롬프트만 (Execute용)
    sources:          list[dict]


# ── 개선된 프롬프트 추출 ─────────────────────────────────────
def extract_improved_prompt(answer: str) -> str:
    """
    LLM 응답에서 '개선된 프롬프트' 섹션만 추출.
    포맷: **개선된 프롬프트:** ... --- **적용한 기법:**
    """
    # 1) **개선된 프롬프트:** 이후 ~ 다음 --- 또는 **적용한 기법 이전까지
    stop = r'(?=\n\s*---|\n\s*\*\*적용한 기법|\n\s*\*\*개선\s*포인트|\n\s*적용한 기법|\n\s*개선\s*포인트|\Z)'
    patterns = [
        r'\*\*개선된 프롬프트:\*\*\s*\n+' + f'(.*?){stop}',
        r'개선된 프롬프트[:\s]*\n+' + f'(.*?){stop}',
    ]
    for pat in patterns:
        m = re.search(pat, answer, re.DOTALL | re.IGNORECASE)
        if m:
            extracted = m.group(1).strip()
            if extracted:
                return extracted

    # 파싱 실패 → 줄 단위로 추출
    lines = answer.split('\n')
    in_section = False
    collected  = []
    stop_keywords = ('---', '**적용한', '**개선 포인트', '**개선포인트', '적용한 기법', '개선 포인트')
    for line in lines:
        if '개선된 프롬프트' in line:
            in_section = True
            continue
        if in_section:
            stripped = line.strip()
            if any(stripped.startswith(kw) or stripped == kw.strip('*') for kw in stop_keywords):
                if collected:
                    break
                continue
            collected.append(line)
    if collected:
        return '\n'.join(collected).strip()

    # 최후 수단 → 전체 반환
    return answer.strip()


# ── 엔드포인트 ───────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/index", response_model=IndexResponse)
def index_chunks(req: IndexRequest):
    count = indexer.index(
        chunks=req.chunks,
        metadata=req.metadata,
        collection_name=req.collection_name,
    )
    return IndexResponse(indexed_count=count, collection_name=req.collection_name)


@app.post("/query", response_model=QueryResponse)
def query(req: QueryRequest):
    history = req.history or []

    retrieved = retriever.search(
        query=req.query,
        collection_name=req.collection_name,
        top_k=req.top_k,
    )
    # 첫 턴(대화 기록 없음)에 매칭 결과가 없을 때만 404.
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
    )


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

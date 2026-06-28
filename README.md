# TTalkak (딸깍)

졸업 프로젝트 — **AI 프롬프트 첨삭 서비스**.
RAG로 프롬프팅 기법을 검색하고, 대화를 통해 사용자의 프롬프트를 점진적으로 개선한다.

- 팀원: 지대현(컴퓨터공학과), 남지원(컴퓨터공학과), 최재원(컴퓨터공학과)

---

## 모노레포 구조

```
Ttalkak/
├── backend/                   Spring Boot 백엔드 (인증·프롬프트·커뮤니티, OpenAI/Anthropic 연동)
├── rag-server/                Python FastAPI RAG 서버 (bge-m3 + MySQL + Groq/Gemini)
├── extension/                 크롬 확장 (React + Vite) — RAG 서버를 직접 호출
└── prompt-hub-web-frontend/   웹 커뮤니티 프론트엔드 프로토타입 (Vanilla JS, 백엔드 없이 동작)
```

> 두 가지 AI 경로가 있다.
> - **확장 → rag-server**: MySQL(rag_chunk)에서 프롬프팅 기법을 검색해 개선 (대화형)
> - **backend → OpenAI/Anthropic**: 웹 서비스용 프롬프트 개선 API

---

## backend (Spring Boot)

```bash
cd backend
./gradlew bootRun        # 또는 IDE에서 TtalkakApplication 실행
```

- Java 17 / Spring Boot 3.2 / JPA / Security(JWT) / WebFlux
- 패키지: `auth`, `member`, `prompt`(+`prompt.ai`), `community`, `common`
- 설정: `src/main/resources/application.yml` (DB·AI 키)
- ※ gradle wrapper가 없으므로 시스템 gradle 또는 IDE 내장 gradle 사용

## rag-server (Python FastAPI)

```bash
cd rag-server
pip install -r requirements.txt

# MySQL 접속 (.env 또는 환경변수)
#   DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD
# LLM 키
export GROQ_API_KEY=...        # 또는 GEMINI_API_KEY=...

# (최초 1회) 지식 PDF 인덱싱
python -m ingestion.ingest_knowledge --mode technique \
  --pdf data/rag_prompt_engineering_100_chunks_v1.pdf

# 서버 실행
uvicorn app.main:app --host 0.0.0.0 --port 8000
# → http://localhost:8000/docs
```

- `app/main.py` — FastAPI 앱, `/query` · `/index` · `/health`
- `app/rag/generator.py` — Groq(우선)/Gemini 백엔드, 대화형 시스템 프롬프트
- `app/rag/retriever.py` / `app/rag/indexer.py` — MySQL(rag_chunk) 검색·인덱싱 (bge-m3 임베딩 + bge-reranker-v2-m3)
- `ingestion/` — 오프라인 PDF 수집·청킹·인덱싱 파이프라인 (`python -m ingestion.*`)
- 컬렉션: `prompt_techniques`(기법 카드), `papers`(논문 청크)
- 비밀키: `rag-server/.env` 에 `GROQ_API_KEY` / `GEMINI_API_KEY`
- 데이터는 `data/` (gitignore 대상); 벡터는 MySQL `rag_chunk` 테이블

## extension (크롬 확장)

```bash
cd extension
npm install
npm run build            # dist/ 생성 → chrome://extensions 에서 로드
npm run dev              # 개발 서버
```

- React + Vite, `src/main.jsx`
- 모드: 📖 기법 모드(`prompt_techniques`) ↔ 📄 논문 모드(`papers`)
- 대화형 개선: 직전 개선 결과를 이어받아 "더 짧게", "페르소나 빼줘" 등 피드백 반영
- Execute: 개선된 프롬프트만 ChatGPT/Claude/Gemini 입력창에 자동 입력


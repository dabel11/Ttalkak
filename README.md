# TTalkak (딸깍)

졸업 프로젝트 — **AI 프롬프트 첨삭 서비스**.
RAG로 프롬프팅 기법을 검색하고, 대화를 통해 사용자의 프롬프트를 점진적으로 개선한다.

- 팀원: 지대현(컴퓨터공학과), 남지원(컴퓨터공학과), 최재원(컴퓨터공학과)

---

## 모노레포 구조

```
Ttalkak/
├── backend/      Spring Boot 백엔드 (인증·프롬프트·커뮤니티, OpenAI/Anthropic 연동)
├── rag-server/   Python FastAPI RAG 서버 (bge-m3 + ChromaDB + Groq/Gemini)
└── extension/    크롬 확장 (React + Vite) — RAG 서버를 직접 호출
```

> 두 가지 AI 경로가 있다.
> - **확장 → rag-server**: ChromaDB에서 프롬프팅 기법을 검색해 개선 (대화형)
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
python3 main.py          # http://localhost:8000
```

- `main.py` — `/query`(개선), `/index`(인덱싱), `/health`
- `generator.py` — Groq(우선)/Gemini 백엔드, 대화형 시스템 프롬프트
- `retriever.py` / `indexer.py` — ChromaDB 검색·인덱싱 (bge-m3 임베딩)
- `index_*.py` — PDF/논문 청크 인덱싱 스크립트
- 컬렉션: `prompt_techniques`(PDF 100기법), `papers`(논문 청크)
- 비밀키: `python-reg-server/.env` 에 `GROQ_API_KEY` / `GEMINI_API_KEY`
- 데이터·벡터DB는 `data/`, `chroma_db/` (gitignore 대상)

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

---

## 참고

`rag-server/spring-integration-example/` — Spring에서 rag-server를 호출하는 예제 코드(WebClient).
현재 backend는 OpenAI/Anthropic 직접 연동을 사용하며, RAG 연동 시 참고용.

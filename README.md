# TTALKAK

> Graduation project — **The project name: TTalkak**
> Member: 지대현(컴퓨터공학과), 남지원(컴퓨터공학과), 최재원(컴퓨터공학과)

프롬프트 커뮤니티 + AI 프롬프트 개선(RAG) 서비스. 저장소는 4개 컴포넌트로 구성된다.

```
Chrome 확장 / Web Frontend
        │  POST /api/prompts/improve
        ▼
Spring Boot Backend (:8080)  ──(프록시)──▶  FastAPI RAG Server (:8000)
        │                                          │
        ▼                                          ▼
                MySQL (:3306, ttalkak DB — 공유, rag_chunk 테이블)
```

| 컴포넌트 | 경로 | 스택 |
|---|---|---|
| Backend | `backend/` | Spring Boot 3 · Java 17 · JPA · MySQL |
| Web Frontend | `prompt-hub-web-frontend/` | Vanilla JS 프리뷰 서버 |
| Chrome Extension | `extension/` | React · Vite · Manifest V3 |
| RAG Server | `rag-server/` | FastAPI · bge-m3 · MySQL |

## 목차

- [Backend](#backend)
- [Web Frontend](#web-frontend)
- [Chrome Extension](#chrome-extension)
- [RAG Server](#rag-server)

> 이 문서는 각 컴포넌트의 원래 README 4개를 내용 누락 없이 그대로 합친 통합본이다.

---

## Backend

### Ttalkak Backend

Ttalkak 프로젝트의 Spring Boot 백엔드 서버입니다.

프론트엔드 연동을 위한 프롬프트 커뮤니티, Make 대화, 댓글, 태그, 신고, 관리자 API를 제공합니다.

---

#### 기술 스택

- Java 17
- Spring Boot 3
- Gradle
- Spring Data JPA
- MySQL
- Spring Security
- WebClient

---

#### 실행 환경

- JDK 17 이상이 필요합니다.
- Spring Boot 3.x 기반이므로 Java 8에서는 실행되지 않습니다.
- 실행 전 `java -version`으로 Java 17 이상인지 확인합니다.
- Windows에서는 `JAVA_HOME`이 JDK 17 경로를 바라보는지 확인해야 합니다.

확인 명령어:

```powershell
java -version
echo $env:JAVA_HOME
```

정상 예시:

```text
17.x.x
```

---

#### 실행 방법

##### 1. MySQL DB 생성

MySQL Workbench에서 아래 SQL을 실행합니다.

```sql
CREATE DATABASE IF NOT EXISTS ttalkak
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;
```

##### 2. application.yml 확인

기본 로컬 설정은 다음과 같습니다.

```yml
spring:
  datasource:
    url: ${DB_URL:jdbc:mysql://127.0.0.1:3306/ttalkak?serverTimezone=Asia/Seoul&characterEncoding=UTF-8&useSSL=false&allowPublicKeyRetrieval=true}
    username: ${DB_USERNAME:root}
    password: ${DB_PASSWORD:root}
```

본인 MySQL 계정이 다르면 환경변수 또는 `application.yml` 기본값을 수정해야 합니다.

##### 3. 서버 실행

Windows PowerShell 기준:

```powershell
cd backend
.\gradlew.bat bootRun
```

##### 4. 빌드 확인

```powershell
cd backend
.\gradlew.bat clean build
```

성공 시 `BUILD SUCCESSFUL`이 출력됩니다.

---

#### API 확인

브라우저 또는 Postman에서 아래 주소를 확인합니다.

```text
http://localhost:8080/api/prompts
http://localhost:8080/api/tags/popular
http://localhost:8080/api/make/threads
http://localhost:8080/api/make/folders
```

---

#### 인증 정책

현재 백엔드는 프론트 연동 테스트를 위해 demo token 기반 인증을 사용합니다.

로그인 성공 시 서명된 JWT accessToken이 발급됩니다.

프론트는 로그인 이후 주요 변경 API 요청에 아래 헤더를 포함해야 합니다.

```text
Authorization: Bearer <JWT accessToken>
```

로그인이 필요한 API에서 토큰이 없거나 잘못된 경우 `401 Unauthorized`를 반환합니다.

---

#### 로그인 필요 API

다음 기능은 비로그인 사용자가 호출할 수 없습니다.

- 프롬프트 작성, 수정, 삭제
- 프롬프트 공유 상태 변경
- 프롬프트 좋아요, 저장
- 댓글, 대댓글 작성
- 댓글, 대댓글 수정/삭제
- 댓글 좋아요
- Make 폴더 생성, 수정, 삭제
- Make thread 저장
- Make thread 폴더 이동
- 관리자 API

---

#### 현재 구현 상태

##### 프롬프트 / 커뮤니티

- 프롬프트 목록 조회
- 프롬프트 상세 조회
- 프롬프트 작성, 수정, 삭제
- 프롬프트 공개/비공개 상태 변경
- 프롬프트 조회수 증가
- 프롬프트 좋아요, 좋아요 취소
- 프롬프트 저장, 저장 취소
- 댓글, 대댓글 작성
- 댓글, 대댓글 수정/삭제
- 답글이 있는 댓글 삭제 시 soft delete 처리
- 신고 생성 API

##### 태그

- 인기 태그 조회
- 태그 목록 조회
- 태그 제안 API

##### Make

- Make thread 목록 조회
- Make folder 목록 조회
- Make thread 생성
- Make thread 업데이트 / upsert
- Make messages JSON 직렬화 저장
- Make folder 생성, 수정, 삭제
- Make thread 폴더 이동
- 프론트 임시 id(`thread-...`)가 폴더 이동 API에 들어올 경우 400 반환

##### 프롬프트 개선

- `/api/prompts/improve` API 제공
- RAG 서버 연결 시 RAG 응답 사용
- RAG 서버 미연결 시 fallback 개선 응답 반환

##### 검색

`/api/prompts`에서 아래 검색 파라미터를 지원합니다.

```text
scope=all
scope=tag
scope=author
scope=keyword
query=검색어
keyword=검색어
author=작성자
```

예시:

```text
/api/prompts?scope=all&query=글쓰기
/api/prompts?scope=tag&query=마케팅
/api/prompts?scope=author&query=테스터
/api/prompts?scope=keyword&query=식단
```

##### 관리자 API

관리자 모드 연동을 위한 최소 API를 제공합니다.

- 신고 목록 조회
- 신고 상태 변경
- 프롬프트 숨김 / 복구
- 태그 목록 조회
- 태그 상태 변경

관리자 API는 `ADMIN` 권한이 필요합니다.

---

#### 프론트 연동 확인 기준

프론트 실행 후 개발자도구 Network 탭에서 아래 요청이 확인되면 기본 연동이 정상입니다.

```text
GET    /api/prompts                         200
GET    /api/tags/popular                    200
GET    /api/make/threads                    200
GET    /api/make/folders                    200
POST   /api/prompts/improve                 200
POST   /api/make/threads                    200
PATCH  /api/make/threads/{숫자id}/folder    200
```

로그인 없이 저장, 좋아요, 댓글 작성, 폴더 생성 등을 호출하면 `401 Unauthorized`가 정상입니다.

---

#### 추후 작업

- JWT 인증 고도화
- Google OAuth2 연동
- RAG 서버 실제 연결 안정화
- Admin API 세부 정책 보완
- 댓글 수 계산 정책 정교화
- API 응답 계약 문서화
- 배포 환경변수 설정
---

#### 추가 반영 사항

##### 회원탈퇴 / 계정 비활성화

- `DELETE /api/auth/withdraw` API를 제공합니다.
- 로그인 사용자 본인만 회원탈퇴할 수 있습니다.
- 회원탈퇴 시 비밀번호 확인이 필요합니다.
- 탈퇴 계정은 `active=false`로 처리됩니다.
- 탈퇴 이후 기존 demo token은 더 이상 인증되지 않습니다.
- 탈퇴 계정은 재로그인할 수 없습니다.
- 현재 정책상 기존 프롬프트, 댓글, 답글, 신고, 좋아요, 저장, Make 대화는 즉시 삭제하지 않고 보존합니다.

##### 신고 생성 인증

- 신고 생성 API는 로그인 사용자만 호출할 수 있습니다.
- 비로그인 사용자가 신고 API를 직접 호출하면 `401 Unauthorized`를 반환합니다.

##### API 응답 계약

프론트와 백엔드 응답 필드 계약은 아래 문서에 정리합니다.

backend/docs/API_CONTRACT.md

#### JWT 인증 설정

백엔드 실행 전에 JWT 서명키를 환경변수로 설정해야 합니다.

PowerShell 개발 실행 예시:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()

$env:JWT_SECRET_BASE64 = [Convert]::ToBase64String($bytes)
$env:JWT_EXPIRATION_MINUTES = "120"
$env:JWT_ISSUER = "ttalkak"

.\gradlew.bat bootRun
```

- `JWT_SECRET_BASE64`는 Base64 디코딩 기준 최소 32바이트여야 합니다.
- 운영 환경에서는 고정된 안전한 서명키를 비밀 환경변수로 관리합니다.
- 서버를 다시 시작할 때 서명키가 바뀌면 기존 JWT는 사용할 수 없습니다.
- 실제 서명키를 README, 소스 코드, `.env.example`에 기록하지 않습니다.

#### 공통 에러 응답 처리

백엔드의 실패 응답은 다음 필드로 통일되어 있습니다.

```text
timestamp, status, error, code, message, path
```

프론트엔드에서는 다음 기준으로 처리합니다.

- AUTHENTICATION_REQUIRED: 로그인 화면 이동 또는 로그인 안내
- ACCESS_DENIED: 권한 부족 안내
- RESOURCE_NOT_FOUND: 대상이 없거나 접근할 수 없다는 안내
- INVALID_REQUEST, VALIDATION_FAILED: 폼 또는 토스트에 message 표시
- CONFLICT, INVALID_STATE: 중복 처리 또는 상태 충돌 안내
- INTERNAL_SERVER_ERROR: 일반 서버 오류 안내

세부 계약은 docs/API_CONTRACT.md를 확인합니다.

---

## Web Frontend

### TTALKAK Web Frontend

`jaewon7025/web-demo-preview` is the current frontend preview and backend handoff branch. It is not the final production branch, but most visible web flows now call Spring Boot APIs first and keep local/demo fallback only for preview continuity or backend failure cases.

#### Review Order

1. Home: prompt list, search scope, sort, approved popular tags, detail modal.
2. Auth: signup/login token storage, Google OAuth button behavior, 401 login popup, 403 permission notice, withdrawal.
3. Make: domain templates, thread/folder smoke calls, `POST /api/prompts/improve`, RAG/AI fallback states.
4. Share: logged-in sharing flow, optional hashtags, Home card preview.
5. My page: library, my prompts, comments, reports, server-data rendering with demo fallback only when needed.
6. Admin: reports, prompts, tags, user activity, audit logs, author revision request flows.
7. Chrome Extension: `POST /api/prompts/improve` through Spring Boot only.

#### Current Integration

- Frontend API base defaults to `http://localhost:8080`.
- Auth stores the backend access token and protected requests send `Authorization: Bearer ...`.
- Admin detection uses the backend login response `user.role === "admin"`.
- Admin credentials are not fixed in frontend code. They depend on backend `.env` / `ADMIN_*` seed settings and backend password policy.
- Backend login timeout no longer creates an automatic demo admin session.
- Prompt improvement calls only Spring Boot `POST /api/prompts/improve`. The frontend must not call FastAPI `/query` or manage RAG server URLs/API keys.
- Expected AI flow: `Frontend -> Spring Boot /api/prompts/improve -> FastAPI /query -> RAG / Vector DB / LLM -> Spring Boot -> Frontend`.

#### Admin APIs Used

- Reports: `GET /api/admin/reports`, `PATCH /api/admin/reports/{id}/status`
- Prompts: `GET /api/admin/prompts`, `PATCH /api/admin/prompts/{id}/hide`, `PATCH /api/admin/prompts/{id}/restore`
- Author revision requests: `POST /api/admin/prompts/{promptId}/author-revision-requests`, `PATCH /api/admin/author-revision-requests/{requestId}`
- Revision review: `GET /api/admin/revision-requests`, `PATCH /api/admin/revision-requests/{requestId}/status`
- Comments: `PATCH /api/admin/comments/{commentId}/hide`, `PATCH /api/admin/comments/{commentId}/unhide`, `DELETE /api/admin/comments/{commentId}`
- Tags: `GET /api/admin/tags`, `PATCH /api/admin/tags/{id}/status`
- User activity: `GET /api/admin/users?nickname=...`, `GET /api/admin/users/{memberId}/activity`, `GET /api/admin/users/{memberId}/prompts`, `GET /api/admin/users/{memberId}/comments`, `GET /api/admin/users/{memberId}/replies`, `GET /api/admin/users/{memberId}/reports/submitted`, `GET /api/admin/users/{memberId}/reports/received`
- Audit logs: `GET /api/admin/audit-logs`

Admin prompt removal is implemented as hide/restore, not permanent deletion.

#### Status Policy

- Reports: `pending`, `reviewed`, `resolved`, `dismissed`
- Tags: `pending`, `approved`, `rejected`, `disabled`
- Author revision requests: `pending`, `acknowledged`, `completed`, `rejected`
- Admin-created author revision request message editing is allowed only while the request is `pending`.

The frontend removes reprocess/undo buttons for final report states and treats rejected tags as final. Approved tags can move between `approved` and `disabled`.

#### Demo And Fallback Boundaries

- Backend responses are preferred whenever a connected API exists.
- Local/demo fallback remains for preview continuity when the backend is unavailable, for some optimistic UI transitions, and for QA sample data.
- Demo reset clears browser-side UI state only. It does not delete backend DB data.
- Google buttons use the real Google credential flow only when `window.TTALKAK_GOOGLE_CREDENTIAL` is configured. Without that setting, the UI labels the action as a Google demo.
- Make may show local demo polishing only when `/api/prompts/improve` fails or the API wrapper is unavailable.

#### Chrome Extension

The extension code lives in the repository root `extension` folder. It calls Spring Boot `POST /api/prompts/improve` and does not call FastAPI `/query` directly.

Extension notes and remaining checks:

- Backend CORS/security settings were verified to allow requests from the configured `chrome-extension://...` origin.
- AI/RAG response policies are confirmed: no-evidence returns a successful fallback response, timeout and unavailable return `503 / AI_SERVICE_UNAVAILABLE`, and rate-limit returns `AI_RATE_LIMIT_EXCEEDED`.
- Saved prompts and recent items are currently extension-local unless a later server sync scope is defined.

#### Run

```powershell
cd prompt-hub-web-frontend
node preview-server.cjs
```

Open:

```text
http://127.0.0.1:4173/
```

#### Backend Smoke Check

1. Run Spring Boot on `http://localhost:8080`.
2. Run this frontend on `http://127.0.0.1:4173`.
3. Open DevTools Network.
4. Refresh Home and confirm `GET /api/prompts` and `GET /api/tags/popular` return `200`.
5. Submit Make and confirm only `POST /api/prompts/improve` is called for prompt improvement.
6. Confirm no browser request goes directly to FastAPI `/query`, port `8000`, RAG server URL, or AI provider endpoints.
7. Login as an admin seeded by backend `.env`, then verify Admin API requests carry `Authorization: Bearer ...`.

See also:

- `docs/API_SPEC.md`
- `docs/BACKEND_INTEGRATION_NOTES.md`
- `docs/BACKEND_HANDOFF_MESSAGE.md`
- `docs/QA_CHECKLIST.md`

---

## Chrome Extension

### TTALKAK Chrome Extension

Chrome Side Panel extension for improving prompts and sending the final prompt to AI tools such as ChatGPT, Gemini, and Claude.

#### Current Integration Direction

- The extension should not call the FastAPI RAG server directly.
- Prompt improvement goes through Spring Boot:

```text
Chrome extension
-> Spring Boot POST /api/prompts/improve
-> FastAPI POST /query
-> RAG / Vector DB / LLM
-> Spring Boot
-> Chrome extension
```

- Login uses the Spring Boot `POST /api/auth/login` API.
- The returned `accessToken` and user info are stored in `chrome.storage.local` and restored when the extension opens again.
- Authenticated API requests include `Authorization: Bearer {accessToken}`.
- Guest users get a persistent `X-Session-UUID` stored in `chrome.storage.local`.
- Guest prompt-improve requests include `X-Session-UUID`; logged-in requests use JWT instead.
- Trial-limit responses such as `FREE_TRIAL_LIMIT_EXCEEDED` should prompt the user to log in.
- On `401` or blocked-account responses, the extension clears the stored auth session and asks the user to log in again.
- Logged-in users sync Saved prompts through the Spring Boot saved-prompt API.
- Logged-in users sync Recents through the Spring Boot Make thread API.
- Guest Saved prompts and Recents remain local browser data.
- The extension does not replace failed backend responses with demo AI results. API failures should be surfaced to the user so integration issues are visible during testing.
- Extension-local saved prompts and recent chats must be treated as local browser data, not as server-synced website data.
- Claude currently uses clipboard fallback. ChatGPT and Gemini use page insertion where possible.

#### Permission Notes

- `scripting` is the primary method for inserting prompts into supported AI sites.
- `debugger` is kept only as a last-resort fallback for ChatGPT and Gemini when DOM insertion fails.
- The background script blocks debugger fallback outside the supported ChatGPT and Gemini hosts.
- Debugger sessions are detached in a `finally` block, and detach failures are logged.
- If ChatGPT and Gemini are verified to work reliably with DOM insertion only, remove the `debugger` permission from `public/manifest.json`.

#### Development

```bash
npm install
npm run build:dev
```

Load the built extension in Chrome:

```text
extension/dist-dev
```

Chrome loading steps:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked"
4. Select the `extension/dist-dev` folder

`npm run verify` writes its disposable production-like bundle to `extension/dist-verify`, so verification never overwrites the unpacked development extension. `npm run build:prod` writes only to `extension/dist-prod`.

The development manifest contains a public key that keeps the unpacked Extension ID stable across machines and paths:

```text
djbhhlahjhaeccghbnajnhmbcdilccmn
```

This public key is not a secret. Never commit a matching private key. The Spring Boot development CORS default allows only this fixed Extension origin in addition to localhost web origins.

Because Chrome isolates extension storage by Extension ID, conversations and settings created with a pre-stable development ID are not migrated automatically. This affects development data only; the Chrome Web Store production Extension ID and its storage are separate.

#### Structure

- `src/main.jsx`: Side Panel React UI
- `src/styles.css`: Side Panel styles
- `public/manifest.json`: Chrome Extension Manifest V3 settings
- `public/background.js`: Side Panel opening and AI-site prompt insertion logic

#### Backend Setting

Backend API URL is managed in one place through `VITE_BACKEND_API_URL`.

Development:

```text
http://localhost:8080
```

Production:

```text
Set VITE_BACKEND_API_URL to the Spring Boot HTTPS production URL.
```

The extension calls:

```text
POST /api/prompts/improve
```

The previous direct RAG URL setting is no longer the intended frontend path.

#### Production Manifest

`public/manifest.json` is the development manifest and keeps localhost permissions for local testing.
`manifest.production.example.json` is the production manifest template and is used by `npm run build:prod`.
See `docs/WEB_STORE_RELEASE_CHECKLIST.md` for the Chrome Web Store release checklist and backend CORS handoff steps.

For production packaging:

1. Set `VITE_BACKEND_API_URL` to the Spring Boot HTTPS production URL.
2. The build replaces `https://SPRING_BOOT_PRODUCTION_HOST/*` in the production manifest template with the same production host.
3. Package the generated `extension/dist-prod` directory.
4. Do not include `http://localhost:8080/*` or `http://127.0.0.1:8080/*` in the production manifest.
5. Keep ChatGPT, Gemini, and Claude host permissions while Execute is supported.
6. Build the production package with `VITE_BACKEND_API_URL` set, then run `npm run build:prod`.

Production builds fail fast when `VITE_BACKEND_API_URL` is missing, is not HTTPS, or uses a reserved example domain. CI verification uses the non-installable `dist-verify` directory, while local development always targets `http://localhost:8080` in `dist-dev` even if a production URL remains in the shell environment.

#### Production Extension ID

The production Extension ID is not known until the extension is registered in Chrome Web Store.
After registration, share the origin below with the backend team so Spring Boot can allow it in CORS/security settings:

```text
chrome-extension://{productionExtensionId}
```

Unpacked local development extension IDs can differ by machine, so they should not be used as production allowlist values.

---

## RAG Server

### RAG Service — bge-m3 + MySQL + FastAPI + Spring Boot

> 변경 이력·전후 비교는 [WORKLOG.md](rag-server/WORKLOG.md)에 기록한다. 새 작업은 같은 템플릿으로 추가.

#### 전체 구조

```
호출 경로
  Chrome 확장  ──────────────────────────────────────────────────▶│
  Spring(:8080) /api/prompts/improve ─(프록시)──────────────────▶│
    │                                                              │
    │  POST /query   → 검색 + LLM 응답 생성 (기법 개선)          │
    │  POST /index   → 청크 인덱싱                                │
    │  GET  /health  → 헬스체크                                   │
    ▼                                                              ▼
FastAPI RAG Server (8000)
    ├── app/                      # ── 서버 런타임 ──
    │   ├── main.py               : FastAPI 앱·엔드포인트(/query·/index·/health)
    │   ├── core/
    │   │   ├── db.py             : MySQL(rag_chunk) 연결 + 스키마
    │   │   └── embeddings.py     : bge-m3 + bge-reranker-v2-m3 로드(공유)
    │   └── rag/
    │       ├── retriever.py      : 2단계 검색(dense 후보 → cross-encoder 리랭크)
    │       ├── indexer.py        : bge-m3 임베딩 → MySQL 저장(chunk_id upsert)
    │       ├── generator.py      : 검색 결과 + LLM(Groq/Gemini) → 응답 생성
    │       └── query_transform.py: 검색 전 쿼리 변환·HyDE(실험적)
    ├── ingestion/                # ── 오프라인 데이터 적재(서버와 별개 실행) ──
    │   ├── chunking.py           : 시맨틱 청킹 유틸(신규 자유형식 문서용)
    │   ├── pdf_indexer.py        : 기법 PDF 파싱 → MySQL 직접 인덱싱
    │   ├── ingest_knowledge.py   : 논문/기법 PDF LLM 큐레이션 인덱서
    │   └── pdf_crawler.py        : 11개 출처 크롤링 → PDF 통합 다운로드
    └── eval/                     : 평가 — 검색(Recall/MRR) · 생성(LLM-judge) · 결과 상향(A/B)
        │
        ▼
MySQL (3306, ttalkak) — Spring 백엔드와 동일 DB, rag_chunk 테이블
```

> 벡터 저장소로 MySQL을 사용한다(설계 문서의 "동일 DB 사용" 원칙). MySQL에는
> 벡터 ANN 인덱스가 없어 유사도 계산은 Python(numpy)에서 정확(brute-force)
> 코사인으로 수행한다. 현재 규모(수백~수천 청크)에서 충분히 빠르며, 규모가
> 커지면 retriever.py에서 ANN/캐시를 도입하면 된다.

##### 검색 파이프라인 (/query)
1. **후보 추리기** — dense(bge-m3 코사인)로 `fetch_k`(기본 20)개. (옵션 `use_hybrid`: dense+BM25 RRF 융합 — 측정상 악화라 기본 off)
   - fetch_k=20은 측정 기반 결정: 10으로 줄이면 지연 절반(1988→922ms)이지만 Recall@5 −4.5%p (WORKLOG 2026-07-05 스윕).
2. **리랭크** — bge-reranker-v2-m3로 재채점해 상위 `top_k` 반환(`use_reranker` **기본 on, 검증된 핵심 개선**). 실패 시 후보 폴백.
   - 반환 `score`는 dense 코사인(해석 가능), `rerank_score`(sigmoid)는 병기 — 리랭커 확률은 ~0.50 평탄이라 표시·필터에 부적합(측정으로 확인).
3. **유효 유사도 컷** — `min_score`(기본 **0.40**, dense 기준) 미만은 top_k에서 제외. 무관한 입력이면 0건→첫 턴 404. τ=0.40은 recall 무손실·빈결과 0% 지점(`eval/score_analysis.py`로 측정, 코퍼스 변경 시 재측정).
4. **쿼리 변환(실험적, 기본 off)** — `use_query_transform`(키워드) / `use_hyde`(가상문서). 둘 다 이 코퍼스에선 검색 악화라 비활성(아래 평가).

#### 평가 (검색 + 생성)

##### 검색 품질: `python -m eval.run_eval --qa qa_set_realistic.json`
`--all`(4변형 비교) · `--rerank` · `--hybrid` · `--query-transform`/`--hyde` · `--fetch-k 20 15 10`(후보폭 스윕) · `--show-fails`.
지표: Hit@1 / **Recall@1·3·5(진짜 recall = 정답∩topk/정답수)** / Precision@5 / MRR@10 / **NDCG@5** / 평균 검색 지연.
임계치 설계: `python -m eval.score_analysis` — 정답/오답 점수 분포 + min_score 스윕(유지Recall/Precision/빈결과율).

###### 검색 평가 결과 (현실 평가셋 59문항, 원시 사용자 프롬프트 — 코퍼스 134청크, 2026-07-09)
| 변형 | Recall@3 | Recall@5 | NDCG@5 | MRR@10 |
|---|---|---|---|---|
| dense (기준) | 0.647 | 0.760 | 0.679 | 0.743 |
| **+리랭커 (기본값)** | **0.689** | **0.822** | **0.738** | **0.795** |

> ⚠️ 이전 표의 'Recall@5 0.949'는 사실 "top5에 하나라도 정답이면 hit"(=Hit@5)이라 천장에 닿아 변별이 안 됐다. 진짜 Recall@k·NDCG@5로 교체하니 리랭커 효과가 또렷(134청크 기준 Recall@5 +0.062).
> 코퍼스 확장(108→134, 2차: DAIR+Cookbook +30 후 이름 중복 4건 정리)으로 방해 후보가 늘어 절대치는 108청크 시절(0.847)보다 소폭 낮다 — 같은 코퍼스끼리만 비교할 것.
>
> 측정 결론: **리랭커 단독이 최고.** 하이브리드(BM25)는 한국어 형태소 토큰화(kiwipiepy)를 써도 악화 — 기법 청크들이 공통 형태소를 공유해 sparse 신호가 노이즈. HyDE/키워드 변환도 악화 — 원본 프롬프트가 이미 기법 "Use When"과 잘 매칭. 모두 opt-in으로 보존하되 기본 off.

##### 생성 품질(G): `python -m eval.gen_eval` (GROQ_API_KEY 필요)
운영과 동일한 파이프라인(검색+생성)으로 `improved_prompt`를 만들고 별도 LLM(judge)이 채점.
지표: mode_fit / technique_grounding / instruction_form / intent_preservation(1~5) + **mode_accuracy**(탐지 모드 vs 기대 라벨, 결정론적이라 가장 신뢰).
- mode_accuracy(탐지 모드 vs 기대): **0.27 → ≈0.92**(과잉 질문 완화) → **1.00**(JSON 구조화 응답, 2026-07-05). instruction_form 5.00.
- 응답은 LLM이 JSON(`{mode, improved_prompt, techniques, changes, score, ...}`)으로 생성 → `run_generation()`이 파싱(실패 시 정규식 폴백) 후 표시용 마크다운 복원. `/query` 응답에 `score`(1~10 자체평가) 추가.
  - 발견·수정: 정보가 충분한 프롬프트도 첫 턴에 질문 모드로 빠지던 문제를, `generator.py`를 (A)작업종류+(B)핵심주제 2-항목 게이트로 완화해 해결. 측정→수정→재측정 루프(WORKLOG 2026-06-22).
- 모드 판정은 결정론적 `mode_accuracy`를 1차 신호로, LLM judge 점수는 보조로 본다(judge가 과잉질문에 관대함).
- ⚠️ 운용: Groq 무료 티어 TPD 100k — `--cache-file`로 생성 캐시 후 judge만 재실행 가능, judge 실패해도 mode_accuracy는 집계됨. judge를 8b로 낮추는 건 일치도 측정 결과 **비권장**(채점 누락·인플레이션).

##### 결과 상향(uplift): `python -m eval.uplift_eval` (GROQ/GEMINI 키 필요)
딸각의 **실제 효용**을 end-to-end A/B로 측정한다. "개선 프롬프트가 좋은 지시문인가"(=gen_eval)가 아니라 **"그 프롬프트로 만든 결과물이 raw 프롬프트를 그냥 LLM에 넣은 것보다 실제로 좋아지는가"**를 잰다.
- 흐름: 거친 요청마다 ① raw→순수LLM=결과 A, ② raw→딸각 개선프롬프트→순수LLM=결과 B, ③ judge가 A·B 비교(순서 swap 2회로 위치 편향 제거), ④ **개선 승률 + 평균 점수 Δ**.
- 옵션: `--no-swap`(비용 절반) · `--limit N` · `--target-model` · `--judge-model` · `--show` · `--no-cache`. 결과물은 기본 캐시(`eval/.uplift_cache.json`)되어 재실행 시 judge만 다시 돈다.

###### 첫 측정 (uplift_set 8문항, 실행·채점 llama-3.3-70b)
| | raw(기준) | 딸각 개선 | Δ |
|---|---|---|---|
| 평균 점수(1~5) | 4.75 | 3.50 | **−1.25 (−26%)** · 개선 승률 0% |

> 🔴 **즉시 발견된 회귀**: "사용자가 변환할 원문을 직접 준 작업"(회의록 요약·영어 이메일 번역)에서 개선 결과가 **1.0점**으로 폭락 — 딸각이 지시문으로 재작성하며 **원문 페이로드를 누락**("회의록 내용이 제공되지 않았습니다"). 순수 생성 작업(카피·공고)에선 강한 70b 실행모델 기준 개선 효과가 미미~소폭(–). → generator가 user-provided 원문을 개선프롬프트에 보존하도록 수정 필요(백로그). 도구가 의도대로 실효용 회귀를 정량 포착.

새 자유형식 문서: `ingestion.chunking.semantic_chunks(text)`로 청킹. 새 기법 자료: `ingestion.ingest_knowledge`(LLM 카드 추출 + 의미 중복제거)로 인덱싱.

#### 실행 순서

##### 1. FastAPI 서버 실행

> **모든 명령은 `rag-server/` 디렉터리에서 실행한다.** 패키지(`app`/`ingestion`/`eval`)를
> `python -m <패키지>.<모듈>` 형태로 실행하므로 import 경로가 항상 일관된다.

```bash
cd rag-server

pip install -r requirements.txt              # 서버 런타임만
pip install -r requirements-ingestion.txt    # 적재/크롤링까지 할 때 (런타임 포함)

# MySQL 접속 (.env 또는 환경변수, Spring과 동일 ttalkak DB)
#   DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD
#   또는 RAG_DB_URL=mysql+pymysql://user:pw@host:3306/ttalkak?charset=utf8mb4
# LLM 키
export GROQ_API_KEY=...        # 또는 GEMINI_API_KEY=...
# /index 보호(배포 시 권장): 설정하면 POST /index 에 X-API-Key 헤더 필수
export RAG_INDEX_API_KEY=...

# (최초 1회) 지식 PDF를 파싱→청킹→적합도 큐레이션→MySQL 인덱싱까지 한 번에
#   ① 사람이 직접 청킹한 기법 PDF (결정론적, 무료)
python -m ingestion.ingest_knowledge --mode technique \
  --pdf data/rag_prompt_engineering_100_chunks_v1.pdf --collection pe_manual
#   ② 논문 자동 청킹 (LLM, 적합도 7점↑만)
python -m ingestion.ingest_knowledge --mode paper --pdf data/papers/ --collection pe_auto
#   (검수만, DB 미저장)
python -m ingestion.ingest_knowledge --mode paper --pdf data/papers/ --dry-run

#   (대안) 결정론적 기법 PDF만 빠르게 인덱싱: python -m ingestion.pdf_indexer

# 서버 실행
uvicorn app.main:app --host 0.0.0.0 --port 8000      # 운영
python -m app.main                                   # 개발(자동 리로드)
# → http://localhost:8000 에서 실행
# → http://localhost:8000/docs 에서 Swagger UI 확인
```

---

#### 지식 수집 파이프라인 (2개 프로그램)

논문/가이드를 자동으로 모아 RAG에 넣기까지 **두 프로그램**으로 돌아간다.

```
[1] ingestion.pdf_crawler      [2] ingestion.ingest_knowledge
크롤링 11개 출처              다운로드된 PDF 일괄
→ 관련도 점수 → manifest      → 파싱·청킹·LLM 적합도(≥7)
→ PDF 통합 다운로드           → MySQL(rag_chunk) 인덱싱
   data/downloaded_pdfs/  ───────▶  --pdf data/downloaded_pdfs/
```

##### `ingestion/pdf_crawler.py` — 크롤링 → PDF 통합 다운로드

`crawl.py + pdfDownloadBycrawled.py` 를 하나로 통합·개선. 출처는 **레지스트리(SOURCES)**
한 항목으로 정의되고 4개 범용 핸들러(arxiv / semantic_scholar / github / html)가 처리한다.
arXiv·Semantic Scholar는 **원문 PDF를 직접 다운로드**, 가이드/블로그는 수집 텍스트로
**통합 PDF를 생성**한다. (robots.txt 캐싱·출처 교차 중복제거·재시도 포함)

```bash
pip install requests beautifulsoup4 tqdm reportlab

python -m ingestion.pdf_crawler                      # 전체(crawl→download)
python -m ingestion.pdf_crawler --stage crawl        # 메타데이터만 → data/prompt_data/manifest.json
python -m ingestion.pdf_crawler --stage download     # manifest 기반 PDF만
python -m ingestion.pdf_crawler --source arxiv_paper # 특정 출처만
python -m ingestion.pdf_crawler --dry-run            # 수집 계획만 출력
python -m ingestion.pdf_crawler --min-score 5        # 다운로드 사전 필터(최종 품질은 [2]가 LLM으로 결정)
```

옵션: `--stage`(all/crawl/download) `--min-score`(기본 4.0) `--source` `--per-section`
`--delay` `--dry-run`. 산출물: `data/downloaded_pdfs/`(논문은 `arxiv_paper/`·`semantic_scholar/`
하위, 텍스트 출처는 `<출처>.pdf` 통합본).

##### 전체 흐름

```bash
python -m ingestion.pdf_crawler                       # ① 수집+다운로드
python -m ingestion.ingest_knowledge --mode paper \   # ② 파싱+청킹+큐레이션
  --pdf data/downloaded_pdfs/ --collection pe_auto
```

###### `ingestion/ingest_knowledge.py` — 논문/기법 PDF 큐레이션 인덱서 (2가지 모드)

같은 도구로 **두 가지 청킹 전략**을 실행해 A/B 비교할 수 있다.
둘 다 동일 스키마(Technique/Definition/Use When/…)·동일 임베딩(bge-m3)으로 정규화되므로,
"청킹 방법"만 변수로 두고 검색·응답 품질을 비교할 수 있다.

| 모드 | 입력 | 청킹 방식 | LLM | 적합도 |
|----|----|----|----|----|
| `--mode technique` | 사람이 직접 청킹한 `Chunk NNN` 포맷 PDF | 결정론적 정규식 파싱 | ❌(무료·오프라인) | 10 고정(사람 신뢰), `--score` 주면 LLM 채점 |
| `--mode paper` | 임의의 논문 PDF(여러 개/폴더) | LLM 자동 추출·청킹 | ✅ | LLM 채점 1~10 |

적합도 채점 기준(LLM):

| 점수 | 의미 |
|----|----|
| 9-10 | 바로 쓸 템플릿이 있는 명확한 프롬프트 기법 (CoT, Few-shot, Role…) |
| 7-8 | 프롬프트 품질을 높이는 실천적 원칙/가이드라인 |
| 4-6 | 간접·이론적(모델 구조·벤치마크) — **폐기** |
| 1-3 | 무관(참고문헌·실험셋업) — **폐기** |

산출물: `data/curated/<원본>.<mode>.kept.jsonl`(인덱싱됨) / `.rejected.jsonl`(점수·사유).

```bash
# [A] 사람이 직접 청킹한 기법 PDF (결정론적, 무료)
python -m ingestion.ingest_knowledge --mode technique \
  --pdf data/rag_prompt_engineering_100_chunks_v1.pdf --collection pe_manual

# [B] 논문 폴더 자동 청킹 (LLM, 7점↑만)
python -m ingestion.ingest_knowledge --mode paper \
  --pdf data/papers/ --collection pe_auto

# 두 컬렉션을 같은 질의로 검색해 결과 비교 → 더 좋은 쪽 채택
#   POST /query {"query":"...", "collection_name":"pe_manual"} vs "pe_auto"

# 검수/저비용 옵션
python -m ingestion.ingest_knowledge --mode paper --pdf x.pdf --dry-run --limit 1   # 1윈도만
python -m ingestion.ingest_knowledge --mode technique --pdf x.pdf --score           # 사람 청킹분도 LLM 채점
```

주요 옵션: `--mode`(paper/technique) `--collection` `--min-score`(기본 7)
`--score` `--lang`(ko/en/orig, 기본 ko) `--window-chars` `--limit` `--dry-run` `--replace`.

##### 2. Spring Boot 설정

`application.yml`에 추가:
```yaml
rag:
  server:
    url: http://localhost:8000
```

`build.gradle`에 WebFlux 의존성 추가:
```groovy
implementation 'org.springframework.boot:spring-boot-starter-webflux'
```

---

#### API 사용 예시

> FastAPI 서버(`localhost:8000`)에 직접 호출하는 예시다.
> Swagger UI: `http://localhost:8000/docs`
> Spring Boot에서 연동 시 `/api/prompts/improve` → rag-server `:8000/query` 로 프록시된다.

##### 인덱싱 (`POST /index`)

`RAG_INDEX_API_KEY` 가 설정된 서버에선 `X-API-Key` 헤더 필수(불일치 403). `/query`는 공개.

```bash
curl -X POST http://localhost:8000/index \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $RAG_INDEX_API_KEY" \
  -d '{
    "chunks": [
      "Chain-of-thought prompting enables complex reasoning...",
      "Few-shot prompting improves model performance..."
    ],
    "metadata": [
      {"source": "Wei et al. 2022", "page": 1},
      {"source": "Brown et al. 2020", "page": 3}
    ],
    "collection_name": "pe_manual"
  }'
```

##### 질의 응답 (`POST /query`)

```bash
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "chain-of-thought 프롬프팅이란 무엇인가요?",
    "collection_name": "prompt_techniques",
    "top_k": 5,
    "use_reranker": true
  }'
```

응답 (LLM이 JSON으로 생성 → `run_generation()`이 파싱·복원, 실패 시 정규식 폴백):
```json
{
  "answer": "---\n**개선된 프롬프트:**\n\n...(표시용 마크다운 — JSON에서 복원)...",
  "improved_prompt": "Chain-of-thought 기법을 써서 다음 문제를 단계별로 풀어라: ...",
  "sources": [
    {
      "text": "Chain-of-thought prompting enables...",
      "metadata": {"technique": "Chain-of-Thought", "source": "Wei et al. 2022", "page": 1},
      "score": 0.52
    }
  ],
  "techniques_applied": ["Chain-of-Thought Prompting"],
  "changes": ["단계적 추론 구조 추가", "목적 명시"],
  "score": 8
}
```
- `sources[].score` = dense 코사인(0~1, min_score=0.40 컷 통과분), `score` = LLM 자체평가(1~10, 개선 모드만)
- 질문 모드면 `improved_prompt=""`(프론트는 Execute 버튼 숨김), `answer`에 질문 블록

---

#### 파일 구조

```
rag-server/
├── app/                       # 서버 런타임 (uvicorn app.main:app)
│   ├── __init__.py            #   PROJECT_ROOT/DATA_DIR 정의 + .env 로드
│   ├── main.py                #   FastAPI 앱·엔드포인트
│   ├── core/
│   │   ├── db.py              #   MySQL 연결 + rag_chunk 스키마
│   │   └── embeddings.py      #   bge-m3 + 리랭커 로드(공유)
│   └── rag/
│       ├── retriever.py       #   2단계 검색(dense → 리랭크)
│       ├── indexer.py         #   bge-m3 임베딩 + MySQL 저장
│       ├── generator.py       #   LLM 응답 생성(JSON, TPM 예산 내 max_tokens)
│       ├── postprocess.py     #   파싱·복원 순수 함수(JSON↔마크다운, 정규식 폴백)
│       └── query_transform.py #   쿼리 변환·HyDE(실험적)
├── ingestion/                 # 오프라인 적재 (python -m ingestion.*)
│   ├── chunking.py            #   시맨틱 청킹 유틸
│   ├── pdf_indexer.py         #   기법 PDF → MySQL 직접 인덱싱
│   ├── ingest_knowledge.py    #   논문/기법 PDF LLM 큐레이션 인덱서
│   └── pdf_crawler.py         #   11개 출처 크롤링 → PDF 다운로드
├── tests/                     # 순수 함수 단위테스트 (python -m tests.test_postprocess 등)
├── eval/                      # 품질 측정
│   ├── run_eval.py            #   검색 (python -m eval.run_eval)
│   ├── score_analysis.py      #   min_score 임계치 설계 (분포·스윕)
│   ├── gen_eval.py            #   생성 LLM-judge (python -m eval.gen_eval)
│   ├── uplift_eval.py         #   결과 상향 A/B (python -m eval.uplift_eval)
│   ├── qa_set*.json           #   검색 평가셋 (질문→정답 chunk_id)
│   ├── gen_set.json           #   생성 평가셋 (거친 프롬프트→기대 모드)
│   └── uplift_set.json        #   상향 평가셋 (거친 요청→결과물 A/B)
├── data/                      # 원본 PDF·산출물 (git 미추적)
├── requirements.txt  Dockerfile  .dockerignore  .env
└── README.md  WORKLOG.md
```

#### 배포 (Railway)

FastAPI 서버를 Railway에 올릴 경우:
1. `rag-server/` 폴더를 별도 Railway 서비스로 배포 (시작 명령 `uvicorn app.main:app --host 0.0.0.0 --port $PORT`)
2. 환경변수: LLM 키(`GROQ_API_KEY`/`GEMINI_API_KEY`) + `RAG_INDEX_API_KEY`(/index 보호) + DB 접속
   (`RAG_DB_URL` 또는 `DB_HOST/...`) — Railway MySQL 플러그인을 가리키게 설정
3. Spring Boot `application.yml`의 `rag.server.url`을 Railway URL로 변경

> 벡터는 Spring과 동일한 Railway MySQL(`rag_chunk` 테이블)에 저장된다.
> 별도 볼륨/벡터 DB가 필요 없다.

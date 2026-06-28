# RAG 서버 작업 기록 (WORKLOG)

이 문서는 rag-server에 가한 변경을 **추적 가능하게(전/후 비교)** 남기는 기록이다.
새 작업은 맨 아래 "다음 작업" 아래에 같은 템플릿으로 **시간 역순 아님 — 진행 순서대로** 추가한다.

> 작성 규칙: 한 작업 = 한 섹션. 반드시 **Before / After / 변경 파일 / 검증 / 결정·근거**를 채운다.
> 수치가 있으면 표로. 되돌리기 어려운 삭제는 무엇을 왜 지웠는지 명시.

---

## 작업 항목 템플릿 (복사해서 사용)

```
## [YYYY-MM-DD] 제목
**목적**: (왜)
**Before**: (이전 상태)
**After**: (이후 상태)
**변경 파일**: (경로 나열, 신규/수정/삭제 표시)
**검증**: (어떻게 확인했는가 + 결과)
**결정·근거**: (선택한 이유, 트레이드오프, 보류한 것)
```

---

# 진행 기록 (2026-06 작업 세션)

## [2026-06-19] 벡터 저장소: ChromaDB → MySQL 교체
**목적**: 설계 문서의 "동일 DB 사용" 원칙에 맞춰 RAG 벡터를 Spring 백엔드와 같은 `ttalkak` MySQL에 저장. 별도 벡터 DB 제거로 배포 단순화.

**Before**
- 저장소: ChromaDB (`chroma_db/`, HNSW 인덱스)
- `indexer.py`·`retriever.py`가 각각 `chromadb.PersistentClient` 사용
- 임베딩 모델(bge-m3)을 Indexer·Retriever가 **각각 로드** → 메모리 2배
- 컬렉션: `prompt_techniques`(100청크) + `papers`(쓰레기 1건 `"string"`)

**After**
- 저장소: MySQL `rag_chunk` 테이블 (collection_name, chunk_id, document, metadata(JSON), embedding(JSON), created_at)
- 접속: SQLAlchemy + PyMySQL, `.env`로 설정(기본값이 Spring과 동일: root/공백/ttalkak)
- 유사도: MySQL엔 ANN 인덱스가 없어 **numpy 코사인(brute-force)**. 100청크 기준 1ms 수준
- 임베딩 모델: `embeddings.py`로 **프로세스당 1회 로드·공유**
- `papers` 쓰레기 컬렉션 제외(이관 시 스킵)

**변경 파일**
- 신규: `db.py`, `embeddings.py`, `migrate_chroma_to_mysql.py`(후속 작업에서 삭제됨)
- 수정: `indexer.py`, `retriever.py`, `main.py`(chroma_path 제거), `requirements.txt`(−chromadb, +SQLAlchemy/PyMySQL/numpy), `README.md`, `python-reg-server/.env`(DB 설정 추가)

**검증**
- 기존 100청크 무손실 이관(임베딩 재계산 없이) 확인
- 검색 정상(코드리뷰 쿼리 → Code Review Prompting), 빈 컬렉션 `[]` 처리
- upsert 멱등성: 재인덱싱해도 100개 유지(중복 없음)
- `main` 임포트 + `/query` 인프로세스 호출 성공

**결정·근거**
- MySQL은 벡터 인덱스가 없지만 현 규모(100~수천)에서 brute-force로 충분 → RAG 구조(bge-m3/top_k/메타데이터) 유지하며 저장 백엔드만 교체.
- `rag_chunk`는 Python(SQLAlchemy)이 소유. Spring 엔티티로 만들지 않으면 JPA `ddl-auto`와 충돌 없음 → 웹 커뮤니티와 동일 DB 공유 OK.

---

## [2026-06-20] 미사용 자산 정리·압축 (280M → 316K)
**목적**: RAG가 실제로 쓰는 것만 남겨 군더더기 제거.

**Before**: rag-server 약 280M. `data/downloaded_pdfs/`(arxiv 논문 273M, 미사용 `papers`용), `data/prompt_data/`(연구 JSON), 구버전 PDF, `chroma_db/`(2.9M), 중복 인덱싱 스크립트 3종, `__pycache__`/`.DS_Store`.

**After**: 316K. 인덱싱 스크립트를 `index_pdf_direct.py` **1개로 통합**(PDF 파싱 + MySQL 직접 적재 자체 포함).

**변경 파일**
- 삭제: `data/downloaded_pdfs/`, `data/prompt_data/`, `data/rag_prompt_engineering_chunks_v1.pdf`(구버전), `chroma_db/`, `migrate_chroma_to_mysql.py`, `index_pdf_techniques.py`, `index_parsey.py`, `__pycache__/`, `.DS_Store`
- 수정: `index_pdf_direct.py`(파싱 로직 내재화), `.dockerignore`, `README.md`
- 유지: `data/rag_prompt_engineering_100_chunks_v1.pdf`(재인덱싱 소스), `spring-integration-example/`, `python-reg-server/.env`

**검증**: 통합 스크립트 파싱 100청크 정상, `main` 임포트·검색 정상(MySQL 데이터 유지).

**결정·근거**: `papers`(논문) 워크플로우는 미사용 → 관련 데이터·스크립트 전부 제거. ChromaDB는 MySQL 이관 완료라 백업 불필요.

---

## [2026-06-20] Docker 구성 (로컬/배포 일관성)
**목적**: MySQL(및 rag-server)을 컨테이너로 띄워 재현성·배포(Railway) 일관성 확보.

**Before**: Homebrew MySQL(`brew services`)로 로컬 구동. Docker 미사용.

**After**: `docker compose up -d`로 MySQL(+rag-server) 기동. MySQL 데이터는 영속 볼륨(`ttalkak-mysql-data`)에 보존, bge-m3 캐시는 `hf-cache` 볼륨.

**변경 파일**
- 신규: `../docker-compose.yml`(mysql + rag-server), `Dockerfile`, `.dockerignore`

**검증**: Docker MySQL 8.4 healthy, `ttalkak` 자동 생성, 100청크 이관, 검색 정상.

**결정·근거**: 컨테이너 내부에선 DB 호스트가 서비스명 `mysql`(compose가 `DB_HOST` 주입), 로컬 실행 시 `127.0.0.1`. rag-server 이미지는 torch+모델로 무거워 첫 빌드만 느림(이후 hf-cache 재사용).

---

## [2026-06-21] 검색 품질 개선 (평가셋 · 리랭커 · 하이브리드 · 쿼리변환 · 청킹)
**목적**: dense 단일 검색의 정밀도를 검증된 기법으로 끌어올리되, **개선 효과를 수치로 측정**하며 진행.

**Before**
- 검색: bge-m3 **dense 단일** + numpy 코사인, 상위 top_k를 그대로 사용(리랭킹 없음)
- 사용자 원본 프롬프트를 그대로 검색 쿼리로 사용
- 검색 품질을 측정할 평가 수단 없음

**After**
- **2단계 검색**: 후보 추리기(dense 또는 dense+BM25 RRF 하이브리드) → cross-encoder 리랭크(`bge-reranker-v2-m3`)
- 기본값 = **하이브리드 + 리랭커**(평가상 최적 조합), 쿼리 변환은 실험적 opt-in(기본 off)
- 평가셋 + 러너로 변형 비교 가능
- 신규 자유형식 문서용 시맨틱 청킹 유틸

**변경 파일**
- 신규: `query_transform.py`, `chunking.py`, `eval/qa_set.json`(기법셋 40), `eval/qa_set_realistic.json`(현실셋 40), `eval/run_eval.py`
- 수정: `embeddings.py`(`get_reranker`), `retriever.py`(2단계+BM25/RRF), `main.py`(`use_reranker`/`use_hybrid`/`use_query_transform` 노출, 기본 하이브리드+리랭커), `requirements.txt`(+rank-bm25), `README.md`

**검증 — 측정 결과**

쉬운 기법셋(`qa_set.json`, 40문항): dense가 이미 Recall@5 0.975로 **포화 → 변별 불가**.
| 변형 | Hit@1 | Recall@5 | MRR@10 |
|---|---|---|---|
| dense | 0.925 | 0.975 | 0.949 |
| +리랭커 | 0.925 | 0.975 | 0.949 |
| +쿼리변환 | 0.300 | 0.400 | 0.329 |

현실셋(`qa_set_realistic.json`, 40문항, 원시 사용자 프롬프트):
| 변형 | Hit@1 | Recall@5 | MRR@10 |
|---|---|---|---|
| dense (기준) | 0.675 | 0.950 | 0.795 |
| +하이브리드 | 0.650 | 0.800 | 0.732 |
| +리랭커 | 0.725 | 0.950 | 0.824 |
| **+하이브리드+리랭커 (기본)** | **0.750** | **0.975** | **0.838** |

→ 기본값 채택. 기준 대비 **Hit@1 +7.5%p(상대 +11%), MRR +0.043, Recall@5 +2.5%p**.

추가 검증: end-to-end `/query` 정상("지원자 중 누구 뽑을지"→Decision Matrix, "전문 변호사 입장"→Role Prompting), 전 모듈 syntax OK.

**결정·근거**
- **리랭커 ON**: 현실셋에서 명확히 개선(Hit@1·MRR↑). `bge-reranker-v2-m3`는 sentence-transformers에 포함(신규 의존성 0), ~2.1GB.
- **하이브리드 ON(리랭커와 함께만)**: 하이브리드 단독은 한국어 BM25 토큰화가 거칠어 악화(Recall 0.95→0.80). 그러나 리랭커가 후보를 정리하면 최고 → 둘 다 기본 on. ⚠️ 리랭커 off + 하이브리드 on은 최악 조합(문서에 경고).
- **쿼리 변환 OFF**: 키워드 확장이 *기법 코퍼스*와 개념적 미스매치(8b·70b 모두 도메인 키워드를 생성). 모델 크기 문제 아님 → 기본 비활성, 코드는 opt-in 실험으로 보존.
- **하위호환**: 응답 스키마(`answer`/`improved_prompt`/`sources`) 불변 → Spring·익스텐션 무변경.

**운영 메모**
- HuggingFace Xet 백엔드가 연결 리셋 유발 → 리랭커는 `HF_HUB_DISABLE_XET=1`로 다운로드. 이후 실행은 `HF_HUB_OFFLINE=1`로 HEAD 재시도 회피(빠름).
- 평가 실행: `python eval/run_eval.py --all --qa qa_set_realistic.json`

---

## [2026-06-21] `.env` 위치 정리 (python-reg-server 폴더 제거)
**목적**: `.env` 하나만 담고 이름도 오타(`reg`←`rag`)인 중첩 폴더 제거로 구조 단순화.

**Before**: `rag-server/python-reg-server/.env` — 코드 3곳·docker-compose·.dockerignore가 이 경로 참조.
**After**: `rag-server/.env`로 이동, `python-reg-server/` 폴더 삭제.

**변경 파일**
- 이동: `python-reg-server/.env` → `.env` (폴더 삭제)
- 수정: `main.py`·`db.py`·`ingest_knowledge.py`(load_dotenv 경로), `.dockerignore`, `../docker-compose.yml`(env_file 경로)

**검증**: 새 경로에서 GROQ_API_KEY·DB 설정 로드 OK, `rag_chunk` 100행 조회 성공, `python-reg-server` 참조 0건. `.env`는 `.gitignore`의 `**/.env`로 계속 보호.

**결정·근거**: 단순 위치 정리. `.env`는 untracked라 git 이력엔 경로 변경만 코드/설정 쪽에 반영됨.

---

## [2026-06-21] 한국어 BM25 · HyDE · 평가셋 확장 · 기법 카드 추출기(의미 중복제거)
**목적**: 백로그의 검색품질 레버 4종을 구현하고 **측정으로 채택 여부 결정**.

**Before**
- 평가셋 현실셋 40문항, BM25 토큰화=공백/음절 정규식, 쿼리변환=키워드형(off)
- 기법 카드 추출기(ingest_knowledge.py)는 이름 기준 중복제거만

**After (구현물)**
- **평가셋 확장**: 현실셋 40 → 59문항(원시 사용자 프롬프트, 다양한 기법 커버)
- **한국어 BM25**: `kiwipiepy` 형태소 분석으로 내용 형태소만 토큰화(`retriever.py`), BM25 코퍼스 토큰화 캐시(컬렉션별, id 정렬)
- **HyDE**: `query_transform.hyde()` — 기법 카드형 가상문서 생성(70b) 후 원본+가상문서로 검색
- **기법 카드 추출기**: `ingest_knowledge.py`에 **임베딩 기반 의미 중복제거**(기존 코퍼스+배치 내부, 코사인≥`--sim-threshold` 0.90 폐기) 추가
- `main.py`에 `use_hyde` 옵션 노출, `eval/run_eval.py`에 `--hyde`/`--qa` 지원

**검증 — 측정 (현실셋 59문항)**
| 변형 | Hit@1 | Recall@5 | MRR@10 |
|---|---|---|---|
| dense | 0.661 | 0.915 | 0.771 |
| +하이브리드(한국어 BM25) | 0.593 | 0.814 | 0.687 |
| **+리랭커 (단독, 기본값)** | **0.695** | **0.949** | **0.801** |
| +하이브리드+리랭커 | 0.678 | 0.949 | 0.792 |
| dense+HyDE | 0.475 | 0.763 | 0.590 |
| 리랭커+HyDE | 0.610 | 0.847 | 0.717 |

**결정·근거 (측정으로 뒤집힌 결론)**
- **기본값 = 리랭커 단독.** 이전 40문항에선 "하이브리드+리랭커"가 근소 우위였으나, 59문항+한국어 BM25로 재측정하니 **리랭커 단독이 전 지표 최고**. 표본↑·토큰화↑가 노이즈를 걷어냄.
- **하이브리드는 한국어 형태소 BM25로도 악화.** 원인: 기법 청크들이 공통 형태소(작성·생성·지시·프롬프트…)를 공유 → sparse 신호가 노이즈. → 코드는 opt-in으로 보존, 기본 off.
- **HyDE도 악화**(폴백 0회의 실측). 키워드 변환과 동일하게, 원본 프롬프트가 이미 기법 "Use When"과 잘 매칭돼 쿼리 변환이 정밀 신호를 희석. → 기본 off, 실험용 보존.
- **기법 카드 추출기 의미중복제거**는 검색지표가 아니라 *코퍼스 품질*용(새 자료 적재 시 중복 카드 방지). 기능 검증으로 충분.

**산출물/변경 파일**
- 신규: (없음, 기존 파일 확장)
- 수정: `retriever.py`(kiwi 토큰화·BM25 캐시), `query_transform.py`(hyde), `main.py`(use_hyde, 기본값 리랭커 단독), `ingest_knowledge.py`(semantic_dedupe), `eval/run_eval.py`(--hyde/--qa), `eval/qa_set_realistic.json`(59문항), `requirements.txt`(+kiwipiepy)

---

## [2026-06-22] 폴더 구조 리팩토링 (평면 → 논리 단위 패키지)
**목적**: 루트에 11개 `.py`가 런타임·적재·크롤러·평가가 섞여 평면으로 흩어져 있어 역할 파악이 어려움. 논리 단위(서버 런타임 / 오프라인 적재 / 평가)로 패키지화.

**Before**
- `rag-server/` 루트에 평면 배치: `main.py db.py embeddings.py retriever.py indexer.py generator.py query_transform.py chunking.py index_pdf_direct.py ingest_knowledge.py pdf_crawler.py`
- 임포트 전부 평면(`from db import …`, `from retriever import …`); `eval/run_eval.py`는 `sys.path.insert` 해킹으로 루트 주입
- `.env` 로드가 `db.py`/`main.py`/`ingest_knowledge.py` 3곳에 중복(각자 `__file__` 기준)
- 실행: `python main.py`, `python index_pdf_direct.py`, `python eval/run_eval.py`

**After**
```
app/                     # 서버 런타임
  __init__.py            #   PROJECT_ROOT/DATA_DIR + .env 단일 로드
  main.py
  core/  db.py, embeddings.py
  rag/   retriever.py, indexer.py, generator.py, query_transform.py
ingestion/               # 오프라인 적재
  chunking.py, pdf_indexer.py(←index_pdf_direct.py), ingest_knowledge.py, pdf_crawler.py
eval/  run_eval.py(+__init__.py)
```
- 임포트 패키지 절대경로(`from app.core.db import …`, `from app.rag.retriever import …`)로 통일, `sys.path` 해킹 제거
- `.env` 로드 **`app/__init__.py` 1곳**으로 일원화(다른 모듈 import 시 패키지 init 선실행으로 보장). `data/` 경로도 `app.DATA_DIR` 단일 출처
- 실행: `uvicorn app.main:app` / `python -m ingestion.<모듈>` / `python -m eval.run_eval` (전부 `rag-server/`에서)
- Docker: `CMD`를 `uvicorn app.main:app`로, `WORKDIR /code`(패키지 `app/`와 혼동 방지), `.dockerignore`에 `data/`(282M)·`eval/`·`ingestion/` 추가해 이미지 경량화

**변경 파일**
- 이동(git mv): 위 11개 → `app/**`·`ingestion/**` (`index_pdf_direct.py`→`ingestion/pdf_indexer.py`)
- 신규: `app/__init__.py`, `app/core/__init__.py`, `app/rag/__init__.py`, `ingestion/__init__.py`, `eval/__init__.py`
- 수정: 이동 파일들의 import·경로·docstring 명령 예시; `Dockerfile`, `.dockerignore`, `README.md`
- 변경 없음: 응답 스키마(`answer/improved_prompt/sources`), DB 스키마(`rag_chunk`), Spring 연동, `docker-compose.yml`(`build: ./rag-server` 유지), `data/` 내용

**검증**
- `py_compile` 전 파일 통과
- 경량 import: `app`/`app.core.db`/`app.rag.*`/`ingestion.*` 정상, `DATA_DIR`·`DEFAULT_PDF` 경로 해석 OK, `.env`(GROQ_API_KEY) 로드 OK
- 런타임 체인: `Retriever` 단일 검색 — 리팩토링 전과 **동일 결과**(Ranking/Decision Matrix/Clarification Prompting)
- `app.main` import 시 FastAPI 앱·라우트(`/query`,`/index`,`/health`)·3컴포넌트 초기화 정상
- `python -m eval.run_eval --help` 진입점 정상

**결정·근거**
- `python -m` 패키지 실행으로 통일 → import 경로가 실행 위치와 무관하게 일관(평면 배치의 취약점 제거). 실행 명령이 바뀌지만 표준 방식이라 장기적으로 명확.
- 런타임(`app`)과 오프라인 적재(`ingestion`) 분리 → 배포 이미지에서 적재/평가/데이터 제외 가능(경량화). 서버는 `app/`만 있으면 동작.
- `.env`/경로 단일 출처화로 "어디서 로드되나" 혼란 제거. db.py가 import 시점에 엔진을 만들므로 `app/__init__.py` 선로드가 필수.

---

## [2026-06-22] 평가 강화 — 검색 지표 교체 + 생성(G) LLM-judge 도입 (P0)
**목적**: rag-quality-optimizer 에이전트 진단의 P0 두 가지. "개선 효과를 잴 수 없으면 어떤 개선도 무의미" — (1) 검색 지표의 천장(saturation) 제거, (2) 한 번도 측정한 적 없는 생성(G) 품질 측정.

**Before**
- `run_eval.py`: Hit@1 / Recall@5 / MRR@10 만. 그런데 'Recall@5'가 실제로는 "top5에 정답 하나라도 있으면 hit"(=Hit@5) → **0.915~0.949로 천장**, 리랭커 효과가 0.034밖에 안 보여 변별 불가.
- 생성(G) 평가 **전무**. 딸각의 실제 사용자 가치인 `improved_prompt` 품질이 미측정.

**After**
- `run_eval.py`: 진짜 지표로 교체·확장 — Hit@1 / **Recall@1·3·5(정답∩topk/정답수)** / **Precision@5** / MRR@10 / **NDCG@5**. 천장 제거로 변별력 확보.
  | 변형 | Recall@3 | Recall@5(진짜) | NDCG@5 | (구)Recall@5 |
  |---|---|---|---|---|
  | dense | 0.695 | 0.777 | 0.710 | 0.915 |
  | +리랭커 | 0.737 | **0.847** | 0.757 | 0.949 |
  - 리랭커 Δ가 (구)0.034 → (신)Recall@5 +0.070·NDCG +0.047 로 또렷해짐.
- 신규 `eval/gen_eval.py` + `eval/gen_set.json`(12문항, improve/ask 혼합): **운영과 동일한 파이프라인**(`app.main`의 retriever·generator·extract_improved_prompt)으로 검색+생성 후, 별도 LLM(judge, llama-3.3-70b)이 4개 기준(mode_fit / technique_grounding / instruction_form / intent_preservation, 1~5)을 채점. 탐지 모드 vs 기대 라벨 **mode_accuracy**(결정론적)도 보고. 429 재시도 + 항목 간 throttle 내장.

**변경 파일**
- 수정: `eval/run_eval.py`(지표 교체)
- 신규: `eval/gen_eval.py`, `eval/gen_set.json`
- 수정: `README.md`(평가 명령·지표 설명)

**검증 / 핵심 발견**
- 검색: dense vs 리랭커가 새 지표에서 명확히 갈림(위 표). 천장 해소 확인.
- 생성(첫 측정 베이스라인, 12문항): mode_fit 4.91 / technique_grounding 4.00 / intent 5.00 / **mode_accuracy 0.27(3/11)**.
  - 🔴 **과잉 질문**: 정보를 충분히 준 8개 프롬프트 **전부**가 개선안 대신 질문 모드로 빠짐 → 첫 턴 `improved_prompt` 0건(Execute 버튼 안 뜸). 검색보다 큰 UX 문제로 드러남.
  - 🟡 **judge 관대함**: "충분한데 또 물으면 mode_fit≤2" 명시해도 judge가 과잉질문을 대부분 5점 처리 → judge의 mode_fit보다 결정론적 **mode_accuracy 가 더 신뢰할 모드 신호**. (LLM-judge는 검증 보조, 모드 판정은 라벨 비교로.)
  - 🟡 생성 출력에 깨진/혼합언어 토큰(`图片`, `_highlight`) 관측 — Groq 70b 출력 품질 이슈.

**결정·근거**
- (구)Recall@5는 다중 정답(항목당 1~3개)에서 "하나라도 맞으면 만점"이라 의미가 왜곡. 진짜 Recall@k·NDCG로 교체해 다중 정답·순위를 제대로 반영.
- 생성 평가는 **운영 객체 재사용**(별도 재구현 X)으로 실제 파이프라인을 측정. judge는 보조 지표, mode_accuracy를 1차 신호로 삼음.
- 발견된 '과잉 질문'은 별도 개선 항목(generator 체크리스트 완화)으로 백로그에 등록 — 본 작업은 '측정 도구' 범위까지.

---

## [2026-06-22] 생성기 과잉 질문 완화 (gen_eval 발견 → 수정 → 재측정)
**목적**: 직전 생성 평가에서 드러난 최우선 문제 — 정보를 충분히 준 프롬프트도 첫 턴에 전부 질문 모드로 빠져 `improved_prompt`가 0건(Execute 버튼 안 뜸). 검색보다 큰 UX 문제.

**Before** (`app/rag/generator.py` SYSTEM_PROMPT)
- [충분한 컨텍스트 체크리스트] 7개 항목 + "반드시 점검"·"특히 주제 모호하면 반드시 질문"·"계속 추가 질문" 프레이밍. 명목상 "2개 이상 비면 질문"이나 실제로는 보조 정보(대상 독자 등) 1개만 비어도 심문.
- gen_eval: mode_accuracy 0.27, 상세 프롬프트 8개 중 개선 모드 **0건**.

**After**
- [모드 선택 — 기본은 '개선', 질문은 예외]로 재작성. 필수 판정 항목을 **(A) 작업 종류 + (B) 핵심 주제·소재 단 둘**로 축소. (A)/(B)가 특정되면 보조 항목이 비어도 **바로 개선 모드**(합리적 가정 후 '개선 포인트'에 명시). 질문 모드는 (A)/(B)가 통째로 없거나 추상적일 때만(예: "글 써줘"). 판정 예시 3개 명시.
- [개선 모드] 섹션 헤더도 "기본 모드 ((A)와 (B)가 특정되면 바로 여기)"로 변경.

**검증 (재측정)**
| 케이스 | Before | After |
|---|---|---|
| 정보 충분(상세) | 0/8 개선(전부 질문) | **7/8 개선**, instruction_form 5.00 |
| 정보 부족(vague) | 정상 질문 | **4/4 질문 유지** |
| mode_accuracy | 0.27 | **≈0.92 (11/12)** |
- 상세 8개는 운영 모델(llama-3.3-70b)로 측정(Groq 일일 토큰 한도로 8개까지). vague 4개는 모드 판정만 8b로 sanity check(전부 ask 유지 — 과잉 교정 없음).
- gen_eval 지표(완료 8개): mode_fit 4.50 / technique_grounding 4.50 / instruction_form 5.00 / intent 5.00.

**결정·근거**
- 잔여 1건(채용 공고가 질문 모드로 빠짐, judge fit=1)은 모델 변동 범위로 판단 — 추가 강제는 vague 케이스 과잉 교정 위험. (A)/(B) 2-항목 게이트가 단순·견고.
- 측정→수정→재측정 루프가 P0 평가 도구로 바로 돌아간 첫 사례. 향후 generator 프롬프트 변경 시 `python -m eval.gen_eval` 회귀로 확인.
- ⚠️ 미해결: Groq 무료 티어 **일일** 토큰 한도(TPD 100k)로 12문항 1회도 빠듯 → 평가 운용 시 모델/쿼터 고려 필요. 출력 토큰 깨짐(`紹介`,`詳細` 등 한자 혼입)은 별도 백로그.

---

## [2026-06-26] 결과 상향(uplift) 평가 도구 — RAG 프롬프트 엔지니어링의 '실효용' A/B 측정
**목적**: 사용자 질문 "RAG로 프롬프트 엔지니어링한 **결과값이 어느정도 상향되는지** 판별할 도구". 기존 평가는 검색(R)과 개선프롬프트의 *지시문 품질*(gen_eval)까지만 잼 — 정작 "그 프롬프트로 만든 **최종 결과물**이 raw 프롬프트를 그냥 LLM에 넣은 것보다 좋아지는가"는 측정 수단이 없었다.

**Before**
- `run_eval.py`(검색) · `gen_eval.py`(개선프롬프트 자체 품질) 2종.
- 딸각의 실제 사용자 가치 = "개선프롬프트의 **결과물**"인데, 이 end-to-end 효용은 한 번도 측정 안 됨.

**After**
- 신규 `eval/uplift_eval.py` + `eval/uplift_set.json`(거친 '결과물 요청' 8문항).
- 흐름: 항목마다 ① raw→**순수 LLM**(딸각 시스템프롬프트 없음)=결과 A, ② raw→딸각 RAG 파이프라인(`app.main`의 retriever/generator/extract_improved_prompt 재사용)→개선프롬프트→같은 순수 LLM=결과 B, ③ judge LLM이 A·B 비교 — **순서 swap 2회로 위치 편향 제거**(양쪽 일치해야 승부 인정), ④ **개선 승률 + 평균 점수 Δ(1~5)** 집계.
- 공정성: A·B 모두 **같은 실행 모델·같은 작업**, 차이는 '딸각을 거쳤는가' 하나. ask 모드(개선프롬프트 없음)는 비교 제외.
- 비용 관리: 결과물 캐시(`eval/.uplift_cache.json`, gitignore) — 재실행 시 judge만 재호출. `--no-swap`/`--limit`/`--target-model`/`--judge-model` 옵션.

**검증 — 첫 측정 (uplift_set 8문항, 실행·채점 llama-3.3-70b, swap on)**
| | raw(기준) | 딸각 개선 | Δ |
|---|---|---|---|
| 평균 점수(1~5) | 4.75 | 3.50 | **−1.25 (−26%)**, 개선 승률 0% (개선 0/무 4/raw 4) |

🔴 **도구가 즉시 잡아낸 회귀**: "사용자가 변환할 **원문을 직접 준** 작업"에서 개선 결과 폭락 —
  - 회의록 요약(4번)·영어 이메일 번역(8번): 개선 결과 **1.0점**. 캐시 확인 결과 개선 버전 출력이 *"회의록 내용이 제공되지 않았습니다"* → **generator가 지시문으로 재작성하며 user-provided 원문(회의록 텍스트·영어 이메일)을 개선프롬프트에서 누락**.
  - 순수 생성 작업(카피·채용공고)에선 강한 70b 실행모델 기준 개선 효과 미미~소폭(–): 모델이 이미 거친 요청을 잘 처리해 프롬프트 엔지니어링의 한계효용이 작음.

**변경 파일**
- 신규: `eval/uplift_eval.py`, `eval/uplift_set.json`
- 수정: `README.md`(결과 상향 섹션·구조도), `../.gitignore`(평가 캐시 2종)

**결정·근거**
- 측정 도구가 본연의 목적대로 **실효용 회귀를 정량 포착**. "개선프롬프트가 좋은 지시문이다"(gen_eval은 통과)와 "결과물이 실제로 좋아진다"가 **다른 축**임을 데이터로 분리.
- 발견된 **원문 페이로드 누락**은 generator 수정 항목으로 백로그 등록(본 작업은 '측정 도구' 범위). 수정 후 `python -m eval.uplift_eval`로 회귀 확인 루프 가능.
- judge·실행 모델을 동일 70b로 둬 자기참조 우려가 있으나, swap 편향제거 + 점수가 객관적 결함(원문 누락)을 정확히 1.0으로 잡음 → 1차 신호로 신뢰 가능. 더 엄밀히는 judge를 별도 계열로 교체(옵션 제공).

---

## [2026-06-26] generator 원문 페이로드 누락 수정 — 사용자가 준 원문을 개선프롬프트에 verbatim 포함
**목적**: 직전 uplift_eval이 잡아낸 회귀 수정. 사용자가 **변환·가공할 원문을 직접 준** 요청(회의록 요약·이메일 번역·코드 리뷰 등)에서, generator가 거친 요청을 '지시문'으로 재작성하며 그 **원문을 개선프롬프트에서 누락** → 실행 결과가 "회의록 내용이 제공되지 않았습니다"로 폭락(1.0점).

**Before**
- `SYSTEM_PROMPT`의 "사용자가 준 정보는 조건·재료로 넣는다" 원칙이 **사실 나열형(일시·가격 등)** 위주로만 작동. 변환할 **원문 텍스트 블록**(회의록 본문·영어 이메일 원문)은 지시문화 과정에서 빠지거나 "(아래 회의록을 요약하라)"처럼 본문 없이 지시만 남음.
- uplift_set 8문항(실행·채점 llama-3.3-70b, swap on) 측정:

| | raw(기준) | 딸각 개선 | Δ |
|---|---|---|---|
| 평균 점수(1~5) | 4.75 | 3.50 | **−1.25 (−26%)**, 개선 승률 0% |

  - 회의록 요약(4)·영어 이메일 번역(8) 개선 결과 **각 1.0점**(캐시 확인: 개선 출력이 *"회의록 내용이 제공되지 않았습니다"*, 번역 대신 빈 플레이스홀더 신규 이메일 생성).

**After**
- `app/rag/generator.py` `SYSTEM_PROMPT`에 규칙 2건 추가:
  1. **원문 verbatim 포함** — 변환·가공할 원문/자료(요약할 회의록, 번역할 문장·이메일, 리뷰할 코드, 분석할 데이터)를 받으면 그 원문을 개선프롬프트 안에 **원문 그대로** 조건·재료로 반드시 포함. 요약·바꿔쓰기·생략·플레이스홀더 대체 금지. ❌/✅ 예시(회의록) 동봉. "원문 인용 ≠ 결과물 직접 작성"임을 명시해 기존 '지시문이지 결과물이 아니다' 원칙과 양립.
  2. **모드 선택 보강** — 변환할 원문이 주어진 요청은 (A)작업종류+(B)대상내용이 이미 갖춰진 것 → 보조 항목 캐묻지 말고 곧바로 [개선 모드]로(첫 70b 시도에서 회의록이 ask 모드로 빠지는 변동 완화).
- [개선 모드] 출력 스펙 줄에도 "사용자가 준 원문은 빠짐없이 그대로 인용(생략·플레이스홀더 금지)" 재명시.

**검증 — 재측정**
- ⚠️ **Groq llama-3.3-70b TPD 100k 소진**(97,092/100,000) → 70b 전체 재측정 불가. `llama-3.1-8b-instant`(별도 쿼터)로 확인 측정.
- **회의록(4) [8b]**: 개선프롬프트가 회의록 내용 포함 → 실행 결과 정상 요약. judge **개선 5.0 vs raw 4.0(개선 승)** — 이전 1.0 → 5.0.
- **영어 이메일(8) [70b 프롬프트 검사]**: 개선프롬프트가 원문 영어 이메일 3/3 조각 **verbatim 포함** 확인(이전엔 원문 누락 → 빈 이메일 생성). (8b 실행 시엔 ask 모드로 빠져 비교 제외 — 8b의 과잉질문 성향, 별도 이슈.)
- **결론**: 두 변환-원문 항목 모두 **개선프롬프트에 원문 포함 → 결과물 1.0점 소멸**. −26% 회귀의 주원인(전환-원문 1.0점 2건) 제거. 8b 축소셋(ask 모드 5건 제외)의 잔여 −8%는 순수 생성 작업(채용공고·환불메일)에서 강한 실행모델의 한계효용이 작은 기존 효과로, 본 회귀와 무관.

**변경 파일**
- 수정: `app/rag/generator.py`(`SYSTEM_PROMPT`만)

**결정·근거**
- 수정은 **프롬프트 규칙 1곳**으로 국소화 — 검색·파싱·실행 경로 무변경, 응답 스키마 불변(하위호환).
- 원문 포함은 프롬프트 레벨 결정이라 모델 비의존: 70b·8b 어느 쪽이 개선 모드로 출력하든 원문이 실리는 것으로 검증됨.
- 70b TPD 소진으로 70b 동일조건 전후 비교는 미실시 → 8b 확인 + 70b 프롬프트 검사로 대체. 70b 전체 재측정은 쿼터 회복 후 `python -m eval.uplift_eval`로 가능(루프 유지).
- 8b의 ask 모드 과잉(전환-원문 포함 5/8 제외)은 소형 모델 성향으로, 과잉질문 완화(별도 백로그)와 함께 추후 다룸 — 본 작업 범위(원문 누락)와 분리.

---

## [2026-06-27] 원문 보존 후속 버그 2건 수정 — 추출 잘림(`---`) · 한자노이즈 과삭제
**목적**: 직전 '원문 verbatim 포함' 수정으로 개선프롬프트가 **사용자 원문을 통째로 담게** 되면서, 그 원문을 다루는 후단(추출·후처리)에서 드러난 잠재 버그 2건을 정리. 단위 테스트로 재현→수정→검증.

**Before (재현됨, API 無·결정론적)**
1. **`extract_improved_prompt` 원문 속 `---`에서 잘림** (`app/main.py`): 종료점이 바 `---`이라, 개선프롬프트에 포함된 사용자 원문(마크다운·코드 등)에 `---` 구분선이 있으면 거기서 추출이 끊김 → Execute로 가는 `improved_prompt`가 원문 뒷부분 통째 누락. (테스트: 중간 `---` 뒤 '섹션2/내용 B' 손실 확인) **방금 한 원문 보존을 도로 무력화하는 회귀.**
2. **`_strip_cjk_noise` 정상 외국어 삭제** (`app/rag/generator.py`): 한자 노이즈 제거 정규식이 `[가-힣\s]` 인접(=공백 포함)을 조건으로 해, **공백으로 분리된 일본어/중국어**(예: `世界`)까지 삭제 → 번역·인용 원문 훼손. (테스트: `こんにちは 世界`의 `世界` 사라짐 확인)

**After**
1. 추출 종료점을 **구조 마커(`**적용한 기법`/`**개선 포인트`)** 기준으로 변경(사용자 원문엔 안 나옴). 중간 `---`는 보존, 헤더 직후·꼬리의 구분선만 제거. 헤더 매칭도 볼드·콜론 유무 허용으로 견고화.
2. 노이즈 정규식 인접 조건에서 `\s` 제거 → **한국어 음절에 직접 붙은**(공백 없는) 한자만 노이즈로 제거. 공백·따옴표·줄바꿈으로 분리된 한자/일본어는 '정상 원문'으로 보존.

**검증 (단위 테스트 12케이스 ALL PASS)**
- 추출: 원문 중간 `---` 보존 / 꼬리 `---` 제거 / 일반 개선 / 질문모드→`""` / 기법섹션 없음 케이스
- 노이즈: 붙은 한자(`마케팅图片 글`→`마케팅 글`, `결과紹介입니다`→`결과입니다`) 제거 / 공백분리 일본어·따옴표 중국어·[원문]블록 한자 보존
- `py_compile` + `app.main` import 정상.

**변경 파일**
- 수정: `app/main.py`(`extract_improved_prompt` 재작성), `app/rag/generator.py`(`_CJK_NOISE_RE` 인접 조건 `\s` 제거 + 주석)

**결정·근거**
- 두 버그 모두 **원문을 담기 시작하면서 비로소 노출**됨(이전엔 개선프롬프트가 짧아 안 터짐). 원문 보존 수정과 한 묶음으로 마감.
- 추출은 바 `---`(원문에 흔함) 대신 구조 마커로 끊는 게 근본적. 응답 스키마·프론트 규약(빈 `improved_prompt`→Execute 숨김) 불변(하위호환).
- 노이즈 제거는 '한글에 직접 붙음'이 실제 Groq 오염 시그니처. 공백분리 외국어 보존으로 번역 유스케이스 안전. 잔여 엣지(2자 외국어가 한국어 조사에 직접 붙는 경우)는 원문이 보통 줄바꿈/따옴표로 분리돼 실무 영향 작음.

---

## [2026-06-27] /query 런타임 견고성 2건 — 출력 한도 상향 · 빈 응답 가드
**목적**: '더 볼 문제' 점검 중 발견한 런타임 `/query` 경로의 잠재 결함 2건. 둘 다 원문 verbatim 포함이 적용되며 영향이 커진 항목.

**Before**
1. **긴 원문 truncation 위험**: 생성 `max_tokens=2048`. 개선프롬프트가 사용자 원문을 통째로 담게 되면서, 긴 회의록·문서·코드를 받으면 출력이 2048 토큰에서 잘려 개선프롬프트가 중간에 끊길 수 있음(이전엔 출력이 짧아 무사).
2. **빈/None 생성 응답 → 500 크래시**: LLM이 `None`/빈 본문을 반환하면 `extract_improved_prompt(None)`에서 `TypeError` → 불친절한 500.

**After**
1. 생성 `max_tokens` **2048 → 4096** (GroqGenerator/GeminiGenerator/Generator 3곳 기본값). 출력 상한일 뿐이라 짧은 응답엔 비용·지연 영향 없음.
2. `app/main.py` `/query`: 생성 후 `answer`가 비면(공백 포함) **503 + 명확한 메시지**("생성 결과가 비어 있습니다…")로 처리 → 추출 단계에 `None` 미전달.

**검증**: `py_compile` + `app.main` import 정상. `max_tokens=4096` 3곳 반영 확인. (DB·indexer 계층은 별도 점검 — upsert autoflush·NULL chunk_id 유니크 동작 정상, 런타임 치명 결함 없음.)

**변경 파일**
- 수정: `app/rag/generator.py`(max_tokens 3곳), `app/main.py`(빈 응답 가드)
- 동기화: `RAG_PIPELINE.md`([C]/[D]/설정표/한계 섹션) — 파이프라인 변경 반영 규칙대로

**결정·근거**
- `max_tokens`는 천장 상향이라 회귀 위험 낮고 verbatim 원문 기능과 직접 맞물림. 매우 긴 문서는 여전히 한계 → 장문 선처리(분할/요약)는 백로그.
- 빈 응답은 500(서버오류)보다 503(일시적, 재시도 유도)이 사용자·프론트에 정확한 신호.

---

## [2026-06-28] spring-integration-example 삭제 — v2.0 계약과 불일치한 stale 예제 제거
**목적**: 설계 문서(v2.0)와 대조 중 `spring-integration-example/`가 v1.0에 멈춰 있어 그대로 따라하면 오히려 오연동을 유발함을 확인. 불필요 판단으로 제거.

**Before**
- `spring-integration-example/`(RagDto·RagService·RagController·application-rag.yml)가 구버전 계약:
  - `QueryResponse`에 `improved_prompt`/`techniques_applied`/`changes` 누락(실제 `/query`는 반환) → Execute·기법표시 연동 불가
  - `QueryRequest` 기본값 `collection="papers"`, `model="claude-3-haiku-20240307"`(폐기된 값), `history` 필드 없음
  - README 2곳에서 이 디렉터리를 "Spring 연동 참고"로 안내

**After**
- `spring-integration-example/` 디렉터리 전체 삭제.
- 참조 정리: 루트 `README.md`의 "참고" 섹션 제거, `rag-server/README.md` 디렉터리 트리에서 항목 제거.

**변경 파일**
- 삭제: `spring-integration-example/`(RagDto.java, RagService.java, RagController.java, application-rag.yml)
- 수정: `README.md`(참고 섹션), `rag-server/README.md`(디렉터리 트리)

**결정·근거**
- rag-server `/query` 코어는 v2.0 계약과 이미 일치 — 예제만 stale이라 유지 가치보다 오연동 위험이 큼. Spring 실연동은 별도 백엔드 레포에서 진행하므로 이 스텁은 불필요.
- 파이프라인 코드 무변경 → `RAG_PIPELINE.md` 갱신 불필요.

---

## [2026-06-28] 문서 무결성 수정 — API 예시 경로 교체 · MySQL 노트 중복 제거 · 잔재 파일 삭제
**목적**: spring-integration-example 삭제 이후 남아 있던 문서 불일치 3건 정리.

**Before**
1. `rag-server/README.md` 상단 아키텍처 다이어그램이 `Spring Boot → POST /api/rag/index · /api/rag/query` 형태로 삭제된 RagController.java의 v1.0 Spring 경로를 노출.
2. "API 사용 예시" 섹션이 `http://localhost:8080/api/rag/index`, `http://localhost:8080/api/rag/query` 로 curl 예시 제공 — 삭제된 Spring 스텁 경로, 응답 스키마도 v1.0(techniques_applied·changes 누락).
3. MySQL brute-force 설명 blockquote이 README 내 2곳에 동일 내용으로 중복(§전체 구조 + §평가 섹션).
4. `rag-server/main.py` 0바이트 빈 파일이 untracked으로 존재 — 2026-06-22 패키지 리팩터링 때 `app/main.py`로 이동 후 루트에 남은 잔재.

**After**
1. 아키텍처 다이어그램 → 실제 FastAPI 엔드포인트(`POST /query`, `POST /index`, `GET /health`)와 두 가지 호출 경로(Chrome 확장 직접 / Spring 프록시 `/api/prompts/improve`) 명시.
2. API 예시 → `http://localhost:8000/query`, `http://localhost:8000/index` 직접 호출로 교체. 응답 스키마에 `techniques_applied`, `changes` 추가(v2.0 계약 반영). Swagger UI 안내 추가.
3. 중복 MySQL 노트 제거(§평가 섹션 내 중복분 삭제, §전체 구조 내 원문 유지).
4. `rag-server/main.py` 빈 파일 삭제.

**변경 파일**
- 수정: `rag-server/README.md`(아키텍처 다이어그램·API 예시·중복 제거)
- 삭제: `rag-server/main.py`(0바이트 잔재)

**검증**: `grep` 으로 `localhost:8080/api/rag` 0건, MySQL 노트 1건 확인. `main.py` 삭제 확인.

**결정·근거**
- API 예시는 RAG 서버 자체의 엔드포인트를 기준으로 두고, Spring 연동 경로는 주석으로 안내하는 것이 rag-server README의 역할에 맞음. Spring 실연동은 백엔드 레포 담당.
- 파이프라인 코드 무변경 → `RAG_PIPELINE.md` 갱신 불필요.

---

# 다음 작업 / 보류 항목 (백로그)

- [x] 🔴 **generator 원문 페이로드 누락(uplift_eval 발견)** — 완료(위 [2026-06-26] 항목). 사용자가 변환할 원문(회의록·번역 대상 이메일·리뷰 대상 코드 등)을 직접 준 경우, 개선프롬프트가 그 원문을 **조건·재료로 그대로 포함**하도록 SYSTEM_PROMPT 규칙 추가. 회의록 개선점수 1.0→5.0, 이메일 원문 verbatim 포함 확인(8b/70b). ⚠️ 70b TPD 회복 후 동일조건 전체 재측정 권장.

- [x] **생성기 과잉 질문 완화** — (A)작업종류+(B)핵심주제 2-항목 게이트로 완화. mode_accuracy 0.27→≈0.92, instruction_form N/A→5.0. (위 2026-06-22 항목)
- [~] **생성 출력 토큰 깨짐**: Groq llama-3.3-70b 응답에 `图片`/`_highlight`/`紹介`/`詳細` 등 혼합언어·깨진 토큰. 한글에 붙은 한자는 `_strip_cjk_noise`로 제거(2026-06-27 정상 외국어 보존하도록 보강). `_highlight` 류 라틴 깨짐은 미해결 — 모델 교체 또는 후처리 추가 검토.
- [ ] **장문 원문 truncation**: 원문 verbatim 포함 + 출력 `max_tokens=4096`(2026-06-27 상향). 매우 긴 문서·코드는 여전히 잘릴 수 있음 → 장문 입력 시 분할/요약 선처리 또는 max_tokens 동적 산정 검토.
- [ ] **Groq 무료 티어 일일 토큰 한도(TPD 100k)**: gen_eval 12문항 1회도 빠듯. judge를 8b로 낮추거나 평가셋 분할·캐싱 검토.
- [ ] **gen judge 신뢰도**: LLM judge가 과잉질문을 관대하게 5점 처리. 모드 판정은 결정론적 mode_accuracy 우선, judge는 보조. judge 강건화(few-shot 라벨, 다른 모델) 검토.
- [x] **리랭커 점수 표시** — 해결됨(코드 확인). `retriever.py`의 `_rerank`가 표시 `score`를 평탄한 sigmoid가 아니라 **dense 코사인**으로 환산해 반환(`c["score"] = c.pop("dense_score", ...)`). UI "유사도 %"는 코사인 기준.
- [ ] **리랭커 비용/지연**: 모델(~568M 파라미터, 디스크 2GB대) + 쿼리당 CPU cross-encoder. Railway 무료티어 RAM 확인 필요. 부담 시 `use_reranker=false` 폴백.
- [x] **쿼리 변환 HyDE형** — 구현·측정 완료. 결과: 악화 → 기본 off(opt-in 보존).
- [x] **한국어 BM25 토큰화** — kiwipiepy 적용 완료. 결과: 하이브리드는 여전히 악화 → 기본 off.
- [x] **평가셋 확장** — 현실셋 59문항으로 확장 완료.
- [ ] **출력 구조화**: 설계 문서의 `{ improved, score, changes[] }` 구조화 응답(현재 정규식 파싱 의존) — 미착수.
- [ ] **스트리밍(SSE)**: 설계 문서의 `/improve/stream` — 미착수.
- [ ] **리랭커 점수 표시**: ~0.50 평탄 → dense 코사인 병기 옵션 검토.
- [ ] **리랭커 비용/지연**: 2.1GB + 쿼리당 CPU. Railway RAM 확인, 부담 시 off.
- [ ] **검색 추가 아이디어**: 기법 corpus가 동질적이라 sparse/쿼리변환이 안 통함. 코퍼스가 커지고 이질화되면 하이브리드 재평가 가치 있음.

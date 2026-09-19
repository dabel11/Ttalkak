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

## [2026-07-05] fetch_k 스윕 + 유효 유사도 컷(min_score) — 측정 기반 결정 2건
**목적**: ① 검색 지연의 90%(리랭크 1.85s/20쌍)를 fetch_k 축소로 줄일 수 있는지 품질로 판정. ② top_k가 무조건 5개를 채우지 말고 "유효한 유사도"인 것만 반영하도록(사용자 요청) 신호·임계치를 측정으로 정해 구현.

**Before**
- fetch_k=20 고정(근거 없음). 검색 평균 1988ms/쿼리.
- top_k=5 무조건 채움 — 무관한 입력("오늘 점심 뭐 먹지")에도 쓰레기 5건이 LLM 컨텍스트로 유입.
- 리랭크 후 리랭커 sigmoid가 score로 노출(~0.50 평탄).

**After — 측정 결과와 결정**
1) fetch_k 스윕(59문항, 리랭크 on):
   | fetch_k | Hit@1 | Recall@5 | NDCG@5 | 지연 |
   |---|---|---|---|---|
   | **20 (유지)** | 0.695 | **0.847** | 0.757 | 1988ms |
   | 15 | 0.661 | 0.822 | 0.732 | 1359ms |
   | 10 | 0.678 | 0.802 | 0.730 | 922ms |
   → 지연 절반의 대가가 Recall@5 −4.5%p. dense가 11~20위에 빠뜨린 정답을 리랭커가 실제로 구조함. LLM 생성이 수 초인 서비스라 품질 우선 → **fetch_k=20 유지(이제 근거 있는 결정)**. run_eval에 `--fetch-k` 스윕·지연 측정 추가.
2) 점수 임계치(신규 `eval/score_analysis.py`):
   - **리랭커 확률은 필터 신호로 무용** — 정답 p50 0.503 vs 오답 p50 0.500 (분리 전무, "평탄" 정량 확인).
   - **dense 코사인은 분리** — 정답 평균 0.525 vs 오답 0.474. τ 스윕: **0.40 = recall 무손실(0.839 유지)·빈결과 0%**, 0.45부터 recall −6%p, 0.50은 −24%p 파괴적.
   → `Retriever.search(min_score=)` 구현(dense 기준, 3단계 후처리 필터), `QueryRequest.min_score` 기본 **0.40**. eval은 필터 없이 순수 랭킹 측정 유지.
3) 점수 표시: 리랭크 후 score=dense 코사인으로 노출(해석 가능), `rerank_score`(sigmoid) 병기.
   ※ 표시 점수를 dense로 바꾸는 변경은 이 세션 편집분이 아닌데 워킹트리에 이미 있었음(이전 에이전트/다른 세션 추정) — 검토 후 유지, rerank_score 병기는 이번에 추가.

**변경 파일**
- 수정: `app/rag/retriever.py`(min_score·rerank_score), `app/main.py`(QueryRequest.min_score=0.40), `eval/run_eval.py`(--fetch-k·지연 측정)
- 신규: `eval/score_analysis.py`(분포·임계치 스윕 도구)

**검증**
- 실제 프롬프트("지원자 다섯 명…") → 5건 유지(dense 0.407~0.485). 무관 입력("ㅁㄴㅇㄹ asdf", "오늘 점심 뭐 먹지") → 0건(첫 턴 404 = 의도된 동작).
- 평가셋 59문항 기준 τ=0.40에서 빈 결과 0% — 개선 의도가 있는 실제 프롬프트는 안 잘림.

**결정·근거**
- 필터 신호는 측정이 정함: 직관적으로는 "리랭커가 더 정확하니 리랭커 점수로 필터"겠지만, bge-reranker 로짓이 0 근처 평탄이라 분리 불가 → dense 채택.
- τ=0.40은 보수적(무손실 지점). 코퍼스가 커지면 `python -m eval.score_analysis`로 재측정해 조정.
- fetch_k 지연 개선은 기각이 아니라 보류 — Railway 배포에서 CPU가 더 느리면 fetch_k=10(Recall −4.5%p)을 의식적 트레이드오프로 선택 가능. QueryRequest 노출은 필요 시.

---

## [2026-07-05] 운영/보안 묶음 — /index 보호 · requirements 분리 · compose healthcheck
**목적**: 구조 점검(P1)에서 나온 배포 전 필수 3건. 각각 소규모지만 방치 시 코퍼스 오염·이미지 비대·기동 중 트래픽 유입 문제.

**Before**
- `/index` 무인증 — CORS `*`와 결합해 누구나 rag_chunk에 upsert 가능(코퍼스 오염 벡터)
- `requirements.txt`에 런타임·적재·크롤러 의존성 혼재 → Docker 이미지에 크롤러 전용 requests/bs4/tqdm/reportlab·pypdf 불필요 설치
- compose의 rag-server에 healthcheck 없음 — `/health` 미활용, 모델 로딩(수십 초~수 분) 중 준비 안 된 컨테이너가 healthy 취급

**After**
- `/index`: `RAG_INDEX_API_KEY` 설정 시 `X-API-Key` 헤더 필수(`hmac.compare_digest` 상수시간 비교, 불일치 403). 미설정이면 로컬 편의상 허용 + 기동 경고. `/query`는 제품 API라 공개 유지. `.env`에 주석 예시 추가.
- requirements 분리: `requirements.txt`(런타임 12개) / `requirements-ingestion.txt`(-r 포함 + pypdf·requests·bs4·tqdm·reportlab). app/ 의 실제 import 그렙으로 분류 검증(pypdf도 ingestion 전용으로 판명).
- compose: rag-server에 `/health` 기반 healthcheck(interval 30s, start_period 300s — 첫 기동 모델 다운로드 고려).

**변경 파일**
- 수정: `app/main.py`(_verify_index_key + Header), `requirements.txt`, `../docker-compose.yml`, `README.md`(설치·curl 예시·배포 환경변수), `.env`(주석 예시)
- 신규: `requirements-ingestion.txt`

**검증**
- TestClient 실호출: 키 없음 403 / 틀린 키 403 / 맞는 키 통과 / `/health`·`/query` 무영향 200
- `docker compose config` 문법 통과
- app/ import 그렙으로 런타임 의존성 완결성 확인

**결정·근거**
- 키 미설정 시 차단이 아니라 허용+경고: 로컬 개발 흐름(Spring 없이 직접 인덱싱)을 안 깨기 위함. 배포 환경에선 키 설정을 README·경고로 강제 유도.
- ⚠️ 진행 중 발견·해결: `app/main.py`의 retriever가 `fetch_k=50`으로 변경돼 있었음(외부 세션 추정, 미측정). 50 vs 20 동일 프로세스 측정 결과 **50이 전 지표 열세 + 2.5배 느림**(Hit@1 0.661 vs 0.695, Recall@5 0.839 vs 0.847, NDCG@5 0.736 vs 0.757, 지연 4065 vs 1651ms) → **20으로 환원**. 원인: 21~50위 저품질 후보가 리랭커에 유입되면 cross-encoder 오판으로 정답 위에 올라가는 경우가 생김(넓다고 좋은 게 아님). main.py에 근거 주석 명시.

---

## [2026-07-05] 출력 구조화 — LLM JSON 응답 (정규식 파싱 의존 제거)
**목적**: 설계 문서의 `{improved, score, changes[]}` 구조화 응답. 기존엔 LLM 마크다운을 정규식으로 파싱해 마커가 어긋나면 improved_prompt가 비어 Execute 버튼이 안 뜨는 취약점(단일 결정점)이 있었음.

**Before**
- generator가 마크다운(`**개선된 프롬프트:**`…) 출력 → main.py의 정규식 3종(extract_improved_prompt/applied_techniques/changes)으로 추출
- gen_eval·uplift_eval도 각자 generate→extract 경로 중복
- score(자체 평가) 없음

**After**
- SYSTEM_PROMPT에 [출력 형식 — JSON] 섹션: `{mode, improved_prompt, techniques[{name,reason}], changes[], score(1~10), summary, questions[]}`. 행동 규칙(2-항목 게이트·verbatim 원칙)은 그대로, 형식 섹션만 교체
- Groq `response_format=json_object` / Gemini `response_mime_type=application/json` 강제
- main.py `run_generation()` 공용 경로: JSON 관대 파싱(`parse_generation`) → 실패 시 **레거시 정규식 폴백**(안 끊김) → `build_answer()`로 기존 표시용 마크다운 복원(익스텐션 UI·history 왕복 형식 무변경)
- `/query`·gen_eval·uplift_eval 모두 run_generation 사용(경로 단일화). QueryResponse에 `score` 필드 추가(하위호환 additive)
- gen_eval 캐시: dict(신형)/문자열(구형) 양쪽 호환

**검증 (gen_eval 12문항, judge 70b)**
| 지표 | 기준선(정규식) | JSON 구조화 |
|---|---|---|
| mode_accuracy | ≈0.92 | **1.00 (12/12)** |
| mode_fit | 4.50 | **5.00** |
| technique_grounding | 4.50 | 4.58 |
| instruction_form | 5.00 (n=7) | 5.00 (n=8) |
- 스모크: improve(score=8, 원문 verbatim 포함, 마크다운 복원 정상)·ask(questions 정상) 모두 structured=True. 폴백 발동 0회.

**결정·근거**
- answer를 JSON에서 마크다운으로 **복원**해 반환 → Spring/익스텐션 무변경으로 배포 가능. 이후 프론트가 구조화 필드를 직접 쓰게 되면 복원 로직은 표시 전용으로 남음.
- 파싱 실패 시 폴백을 남겨 모델이 JSON을 안 지켜도 서비스가 안 끊김(정규식 코드는 폴백 용도로 유지).
- 관찰: eval 4번 항목(회의록 실본문 없는 메타 요청)에서 요청문 자체를 회의록으로 인용 — 평가셋 인공물이며 실사용 시나리오 아님. 평가셋 개선 후보.

---

## [2026-07-05] 코퍼스 확장 1차 — 가이드 8기법 적재 + 회귀 무해 검증
**목적**: 100청크 동질 코퍼스 확장(하이브리드 실패의 근본 원인 완화 시작). 확장이 기존 검색을 해치지 않는지 회귀 방법론 확립.

**Before**: prompt_techniques 100청크(pdf_001~100). 신규 자료 적재 시 기존 쿼리 방해 여부 미검증.

**After**
- **108청크**: Brex·DAIR 가이드에서 70b가 추출한 kept.jsonl(적합도 7~9)을 회수 인덱싱 — Markdown Tables, Give a Bot a Fish, Chain of Thought(Brex판), Embedding Data, Simple Lists, Self-Consistency, PAL, AutoPrompt
- 중복 방어 2중: 이름 정규화 일치(기존 100과 비교 → CoT/Zero-Shot/Few-Shot 3개 자동 폐기) + 의미 중복제거(코사인≥0.90)
- **회귀(59문항, fk20)**: Hit@1/MRR **변화 0**, Recall@5 0.847→0.839(−0.008, 경계 1건), NDCG −0.005 → **무해 판정**
- min_score 재검: τ=0.40 여전히 recall 무손실·빈결과 0% → 유지

**여정에서 배운 것 (쿼터 제약)**
- 70b 풀 적재 시도 → **TPD 100k 소진**(DAIR 5/16 윈도에서 중단, DB 무변경 확인)
- 8b 전환 시도 → **TPM 6,000에 요청(6,347tok)이 아예 초과(413)**. 원인: 입력이 아니라 `max_tokens=4096` 출력예약이 지배적
- 해결: ingest `_complete` 백오프 개선(레이트리밋 20/40/60s, 'Request too large'는 즉시 실패+안내) + **kept.jsonl 회수 인덱싱**(LLM 0토큰)으로 70b 품질 확보

**변경 파일**: `ingestion/ingest_knowledge.py`(백오프·413 처리), `app/rag/retriever.py`(생성자 fetch_k 기본값 50→20 — main.py 외 두 번째 외부 변경 지점 발견·환원)

**결정·근거**
- 하이브리드 재평가는 보류 — +8청크로는 코퍼스 이질화 부족. DAIR 나머지 14윈도·OpenAI Cookbook 본적재(70b TPD 리셋 후) 뒤에 재평가.
- 관찰: 'Chain of Thought'(Brex판)가 기존 'Chain-of-Thought Prompting'과 이름 정규화 불일치로 생존(의미중복 0.90도 미달) — near-dup 1건 허용, 회귀 무해 확인됨. 임계치 하향(0.85)은 패러프레이즈 오폐기 위험과 트레이드오프라 보류.

---

## [2026-07-05] 평가 운용 — judge 일치도 측정·기본값 결정·쿼터 강건화 (D)
**목적**: Groq 무료 티어 한도(70b TPD 100k, 8b TPM 6k) 아래에서 gen_eval을 지속 운용 가능하게. judge를 8b로 낮출 수 있는지 **같은 답변에 대한 두 judge 일치도**로 판정.

**방법**: gen_eval `--cache-file`(외부 세션 기여)로 답변 12개를 캐시에 시딩(8b 생성) → 같은 캐시로 judge만 8b/70b 각각 실행 → 항목별 점수 비교.

**측정 결과 → 판정: judge 기본 70b 유지, 8b judge는 신뢰 불가**
- 8b judge 이상 패턴: ① improve 항목의 instruction_form **채점 누락(None)** 빈발 ② 정답 ask 항목에 mode_fit **2점 오채점** ③ technique_grounding 전항목 5점(인플레이션 — 70b는 3~5 변별)
- 70b judge와 정확 일치(5개 겹침 항목): tech 1/5, fit 4/5 — 상관 낮음
- 부수 확인: **8b 생성**도 mode_accuracy 0.75(70b 1.00) — 과잉 질문 재발. 생성·채점 모두 70b 유지.

**쿼터 강건화 (이번에 추가)**
- `generator.py`: 8b-instant는 max_tokens 2048 캡 — Groq가 입력+출력예약 합산이라 4096 예약(6/27 상향분)이 8b TPM 6k를 초과시켜 413. 이 캡으로 8b 경로 복구(스모크 확인).
- `gen_eval._retry`: 413('Request too large')은 대기 없이 즉시 실패(기다려도 안 풀림).
- `gen_eval`: judge 실패를 비치명 처리 — 점수 없이도 **mode_accuracy(결정론적)는 끝까지 집계**(중도 크래시로 집계 유실 방지).
- `ingest_knowledge._complete`: 레이트리밋 백오프 20/40/60s + 413 즉시 실패(C에서 선반영).

**운용 가이드 (TPD 제약 시)**
1. `--cache-file`로 생성 캐시 → 재채점은 judge 비용만
2. mode_accuracy는 judge 없이도 유효한 1차 신호 (judge 실패 허용됨)
3. 70b TPD 소진 시: 측정을 미루는 게 원칙. 8b judge 점수는 참고용으로도 부적합.

**변경 파일**: `app/rag/generator.py`(8b max_tokens 캡), `eval/gen_eval.py`(413 즉시실패·judge 비치명)

---

## [2026-07-07] 병행 정비 — postprocess 분리·단위테스트 · --from-jsonl · max_tokens 동적 산정
**목적**: 코퍼스 2차 적재(롤링 쿼터 드립으로 장시간 소요)가 도는 동안, LLM 불필요한 백로그 3건 처리.

**1) 파싱·복원 순수 함수 분리 + 단위테스트 (신규 `tests/`)**
- Before: `parse_generation`/`build_answer`/`extract_*`가 main.py에 있어 테스트하려면 모델·DB 로딩 필요. 모드 판정(=Execute 버튼)의 단일 결정점인데 테스트 0개.
- After: **`app/rag/postprocess.py`로 분리**(순수 함수, main.py는 동일 이름 재노출 → eval 하위호환). `tests/test_postprocess.py` **21케이스** — 핵심은 왕복 계약 `extract(build(p)) == improved_prompt` (JSON 경로와 정규식 폴백이 같은 표시 형식 공유 보장), 원문 속 `---` 보존, 결손 필드 관용.
- 실행: `python3 -m tests.test_postprocess` (1초, 모델·DB·LLM 불필요)

**2) `--from-jsonl` CLI 승격 (`ingestion/ingest_knowledge.py`)**
- Before: kept.jsonl 회수 인덱싱이 일회성 인라인 스크립트(2026-07-05 C에서 사용).
- After: `python -m ingestion.ingest_knowledge --from-jsonl data/curated/X.kept.jsonl [--dry-run]` — LLM 0토큰, 이름·의미 중복제거 동일 적용. **멱등 검증**: 기존 적재분 재실행 시 5/5 이름중복 폐기.

**3) max_tokens 동적 산정 (`app/rag/generator.py`) — 긴 원문 truncation·413 대응**
- Before: 고정 4096(70b)/2048캡(8b). 긴 원문(회의록·코드) 포함 시 입력+예약이 TPM 초과 → 413 즉사.
- After: `_fit_max_tokens()` — 입력 추정(≈chars/3)해 TPM(70b 12k/8b 6k) 예산 내로 예약 축소(하한 512, 짧은 입력은 4096 유지). 8b 고정 캡을 일반화로 대체. `tests/test_token_budget.py` **7케이스**.
- ⚠️ 실LLM 연동 스모크는 쿼터 회복 후 gen_eval 회귀로 확인 예정(산술은 테스트로 보장).

**변경 파일**: 신규 `app/rag/postprocess.py`, `tests/`(3파일) / 수정 `app/main.py`(재노출·함수 제거), `ingestion/ingest_knowledge.py`(+index_from_jsonl), `app/rag/generator.py`(_fit_max_tokens)

---

## [2026-07-08] RAG_PIPELINE.md 줄번호 정합화 (문서만, 코드 무변경)
**목적**: 문서가 표방하는 `파일:줄` 참조가 실제 코드와 어긋난 것을 전수 대조로 정정.

**Before**: 2026-07-07 postprocess 분리(main.py 축소)·`_fit_max_tokens` 추가(generator.py 줄 밀림) 이후 내용은 갱신했으나 줄번호는 미갱신 — main.py 참조 6곳(249-255/267/190/245/44), generator.py 참조 5곳(274/156/175/121/135)이 전부 오지시. 문서 내부 자기모순 2건(§1 `_load_collection` 193 vs §2-(3) 182, `_dense_scores` 148 vs 139).

**After**: 전 참조를 현행 코드와 대조해 정정(main.py 142-147/160/83/137/48, generator.py 321/182/215/147/161). retriever.py·query_transform.py 참조는 이미 정확해 무변경.

**변경 파일**: `RAG_PIPELINE.md`(수정 — 줄번호만, 서술 무변경)

**검증**: 각 참조를 `grep -n "def \|class "` 실측과 1:1 대조 후 `grep 'main\.py:[0-9]'`로 재검. 부수 확인: `tests/` 28케이스(21+7) 실행 전부 통과.

**결정·근거**: 줄번호 표기는 리팩터마다 썩는 비용이 있으나 팀 공유 문서의 탐색성 가치가 커서 유지. 코드 이동을 동반한 작업 후에는 줄번호 재검을 마무리 체크에 포함할 것.

---

## [2026-07-09] 코퍼스 확장 2차 완료 — 108→138청크 (DAIR 16윈도+Cookbook) · 이름 중복 4건 유입
**목적**: 백로그 "코퍼스 확장 2차" — DAIR 나머지 + OpenAI Cookbook을 드립 내성 ingest로 적재하고 회귀 측정.

**Before**: 108청크. 07-07 시도는 TPD 96.5k 소진 상태에서 시작해 윈도 2/16에서 예산(1h) 소진으로 중단(산출물 없음). Hit@1 0.695 / R@5 0.847 / MRR 0.794.

**After**: 쿼터 회복 후 재실행(분리 nohup) → 16윈도 완주, **31개 추출·30개 순증 = 138청크**. 단, paper 모드 주 파이프라인은 **기존 컬렉션과 이름 중복 검사를 안 함**(`--from-jsonl` 경로에만 있음) → CoT·Few-Shot·Zero-Shot·Role Prompting 4건이 정규화 이름 기준 중복 유입. 회귀(59문항, rerank): Hit@1 **0.695(유지)** / R@5 **0.822(−0.025)** / MRR 0.794 / NDCG@5 0.737 — 방해 후보 30개 증가 대비 소폭 하락, 중복 제거 후 재측정 여지.

| 측정 (138청크) | Hit@1 | R@5 | MRR@10 | 지연 |
|---|---|---|---|---|
| rerank(운영) | **0.695** | **0.822** | 0.794 | 2058ms |
| hybrid+rerank | 0.661 | 0.788 | 0.767 | 2040ms |

- 하이브리드: 코퍼스가 이질화("코퍼스 커지면 재평가" 조건 충족)됐어도 **여전히 전 지표 열세** → 기본 off 유지 근거 강화.
- min_score 재검(`score_analysis`): **0.40이 여전히 무손실 컷**(유지Recall 0.822, Precision 0.261→0.267, 빈결과 0%). 0.45부터 recall 손실(−0.051). 리랭커 확률은 여전히 분리력 없음(정답 p50 0.503 vs 오답 0.500) → dense 코사인 컷 유지.

**변경 파일**: 코드 무변경(DB만 +30). `data/ingest_phase2.log`(미추적).

**검증**: DB COUNT 138 확인, 정규화 이름 GROUP BY로 중복 4건 특정. 회귀·하이브리드·score_analysis 3종 재측정(위 표).

**결정·근거**: 중복 4건은 1차 salvage 때와 동일 기준으로 신규 쪽 삭제. **사용자 승인 후 삭제 완료 → 134청크** (id 109·111·112·118). 삭제 후 재측정: Hit@1 0.695 / R@3 0.689(+0.008) / R@5 0.822 / MRR 0.795 — R@5는 미회복(하락분은 중복이 아니라 순수 방해 후보 증가분). dense 기준선도 재측정(R@5 0.760 → 리랭커 Δ+0.062). **재발 방지**: 주 파이프라인 인덱싱 직전에 기존 컬렉션과 이름 정확일치 dedupe 추가(`ingest_knowledge.py` main — 의미 dedupe는 설명 문구가 다른 동명 기법을 놓침이 이번에 실증됨).

---

## [2026-07-09] 리뷰 문서 P0 검증 — "코드에도 ask" 버그는 8b 캐시 오진 · gen_eval 캐시 키에 모델 포함
**목적**: `docs/rag-review-2026-07-09.md`(그릴링 결과)의 P0 버그 "코드가 있어도 ask 모드, mode accuracy 75%"를 재현·검증.

**Before**: 리뷰 문서가 `.gen_cache_d.json`(12건) 분석으로 mode accuracy 9/12(75%) 판정 — 케이스 2(파이썬 코드리뷰)가 ask로 응답한 것을 운영 버그로 분류. `gen_eval._cache_key`는 SYSTEM_PROMPT+query+기법명만 해시(모델 미포함).

**After**: **오진 판정**. 해당 캐시는 [2026-07-05] D 작업에서 judge 일치도 실험용으로 **8b로 시딩**한 것(당시 기록: 8b 생성 mode_accuracy 0.75, 70b 1.00 — 수치 정확히 일치). 케이스 2의 캐시 키를 현행 프롬프트·검색결과로 재계산하니 일치 → 조건 변수는 모델뿐. 원인 후보 (a) 검색 약함도 기각(top1 = Code Review Prompting 0.593, top5 전부 유관). 재발 방지로 `_cache_key`에 **생성 모델 포함** — 모델이 다르면 캐시 자동 무효화(기존 캐시는 키 불일치로 자연 폐기).

**변경 파일**: `eval/gen_eval.py`(수정 — 캐시 키에 model), `docs/rag-review-2026-07-09.md`(검증 결과 추기)

**검증**: 캐시 키 재계산 일치 확인. 70b 신선 재현 3회는 TPD 소진(적재가 94.6k 사용)으로 미실시 — 쿼터 회복 후 1회 확인 예정(P0→P2 강등). 리뷰 항목 2(Gemini history 납작)·3(retrieved=0 미검증)은 사실로 확인, 미수정.

**결정·근거**: 평가 캐시는 응답을 만든 모델을 키에 넣지 않으면 실험 캐시가 운영 측정으로 오인될 수 있음(실제 사고). 측정치 인용 전 캐시 출처 확인을 원칙화.

---

# 다음 작업 / 보류 항목 (백로그)

## 규약 v3(2단계 파이프라인) 후속 — 2026-07-31
- [x] 🔴 **gen_eval 전량 재측정 + judge 확보** — **완료**(위 [2026-07-31] 항목): 18/18 완주, mode_accuracy 1.00, 환각률 0.00(0/11), 429 0건.
  · ⚠️ 생성(70b)과 judge(70b)가 **같은 TPM 풀**을 써서 한 번에 돌리면 서로 굶긴다. **두 패스로 분리**할 것: ① `--no-judge` 로 캐시 채우기 → ② 캐시 상태에서 판정만(`--sleep` 45 이상).
  · Groq 429 시 Gemini 폴백이 발동하는데 Gemini 일일 한도까지 소진되면 그때부터 생성 실패로 나타난다.
- [ ] **SYSTEM_PROMPT 축소 재시도** — 4,091토큰이라 장문 라우팅 경계가 1,500자로 낮다(Gemini 한도 압박). 단, 2026-07-31 축소 시도는 회귀로 롤백됐다(위 항목).
  · **재시도 규칙: 규칙 문장은 전부 보존하고 예시(긴 ❌/✅ 블록)만 압축한다.** 특히 [개선 모드] 안에 다시 적힌 "안 준 사실은 빈칸으로"처럼 **작용점에서의 반복은 지우지 말 것**(그게 회귀 원인으로 보임).
  · **검증 필수: 라이브 3회 반복 A/B.** 단위테스트는 프롬프트 행동 회귀를 못 잡고(72개 통과 상태로 회귀했음), 단발 실행은 temp 0.7 변동에 속는다. 하니스: `scratchpad/shrink_check.py` 패턴(이어폰 빈칸 / 원문 verbatim / 제주도 하이브리드 / 글써줘 ask).
- [ ] **LLM 티어 상향 검토** — 2단계화로 **요청당 호출 +1**(분석기). 분석기는 8b라 생성과 TPM 풀이 다르지만, 전체 처리량이 늘어 생성 백엔드(70b TPD·Gemini 일일) 소진이 빨라진 것이 실측으로 확인됨. 트래픽 증가 시 유료 티어 또는 분석기 모델·캐싱 전략 검토.

- [x] **코퍼스 확장 2차** — 완료(위 [2026-07-09] 항목). 138청크, 하이브리드 재평가·min_score 재측정 포함. (~~--from-jsonl 승격~~ → 완료 2026-07-07)
- [x] **코퍼스 이름 중복 4건 정리** — 삭제 완료(134청크) + 주 파이프라인에 이름 dedupe 추가 + 회귀 재측정. (위 [2026-07-09] 항목)

- [x] 🔴 **generator 원문 페이로드 누락(uplift_eval 발견)** — 완료(위 [2026-06-26] 항목). 사용자가 변환할 원문(회의록·번역 대상 이메일·리뷰 대상 코드 등)을 직접 준 경우, 개선프롬프트가 그 원문을 **조건·재료로 그대로 포함**하도록 SYSTEM_PROMPT 규칙 추가. 회의록 개선점수 1.0→5.0, 이메일 원문 verbatim 포함 확인(8b/70b). ⚠️ 70b TPD 회복 후 동일조건 전체 재측정 권장.

- [x] **생성기 과잉 질문 완화** — (A)작업종류+(B)핵심주제 2-항목 게이트로 완화. mode_accuracy 0.27→≈0.92, instruction_form N/A→5.0. (위 2026-06-22 항목)
- [~] **생성 출력 토큰 깨짐**: Groq llama-3.3-70b 응답에 `图片`/`_highlight`/`紹介`/`詳細` 등 혼합언어·깨진 토큰. 한글에 붙은 한자는 `_strip_cjk_noise`로 제거(2026-06-27 정상 외국어 보존하도록 보강). `_highlight` 류 라틴 깨짐은 미해결 — 모델 교체 또는 후처리 추가 검토.
- [~] **장문 원문 truncation**: max_tokens 동적 산정(_fit_max_tokens)으로 413 즉사 방지(2026-07-07) + 장문은 Gemini 라우팅(2026-07-23 항목). 단 라우팅은 GEMINI_API_KEY 설정 시에만 작동 — Groq 단독 구성에선 여전히 잘릴 수 있음.
- [x] **Groq 무료 티어 TPD 대응** — 캐시(--cache-file)·judge 비치명·413 즉시실패·8b max_tokens 캡으로 강건화. judge 8b 전환은 일치도 측정 결과 **기각**(신뢰 불가). (위 2026-07-05 D 항목)
- [ ] **gen judge 신뢰도**: 70b judge도 과잉질문에 관대(mode_fit). 모드 판정은 결정론적 mode_accuracy 우선 유지. judge 강건화(few-shot 라벨, 타 프로바이더 모델) 검토.
- [x] **리랭커 점수 표시** — 해결됨(코드 확인). `retriever.py`의 `_rerank`가 표시 `score`를 평탄한 sigmoid가 아니라 **dense 코사인**으로 환산해 반환(`c["score"] = c.pop("dense_score", ...)`). UI "유사도 %"는 코사인 기준.
- [ ] **리랭커 비용/지연**: 모델(~568M 파라미터, 디스크 2GB대) + 쿼리당 CPU cross-encoder — **실측 1.85s/20쌍(Mac CPU), 검색 지연의 90%**. Railway 무료티어 RAM 확인 필요. 부담 시 fetch_k=10(지연 절반, Recall@5 −4.5%p — 2026-07-05 스윕 표 참조) 또는 `use_reranker=false` 폴백.
- [x] **쿼리 변환 HyDE형** — 구현·측정 완료. 결과: 악화 → 기본 off(opt-in 보존).
- [x] **한국어 BM25 토큰화** — kiwipiepy 적용 완료. 결과: 하이브리드는 여전히 악화 → 기본 off.
- [x] **평가셋 확장** — 현실셋 59문항으로 확장 완료.
- [x] **출력 구조화** — LLM JSON 응답 + 정규식 폴백으로 완료. mode_accuracy 1.00. (위 2026-07-05 항목)
- [ ] **스트리밍(SSE)**: 설계 문서의 `/improve/stream` — 미착수.
- [ ] **검색 추가 아이디어**: 기법 corpus가 동질적이라 sparse/쿼리변환이 안 통함. 코퍼스가 커지고 이질화되면 하이브리드 재평가 가치 있음. min_score(0.40)도 코퍼스 변경 시 `python -m eval.score_analysis`로 재측정.

## [2026-07-20] DB 비밀번호 백엔드 기준(root) 통일
**목적**: 브랜치 통합 과정에서 발견된 설정 불일치 해소 — docker-compose MySQL은 빈 비밀번호, Spring `application.yml` 기본값은 `root`라 기본 설정끼리 조합하면 백엔드가 DB 접속 실패. 백엔드 기본값(root/root)을 기준으로 전부 통일.
**Before**: docker-compose `MYSQL_ALLOW_EMPTY_PASSWORD: yes`, rag-server `DB_PASSWORD` 기본 `""`(코드·compose·.env 모두 공백).
**After**: docker-compose `MYSQL_ROOT_PASSWORD: root`(healthcheck에 `-uroot -proot` 반영), rag-server 컨테이너 env·코드 기본값·로컬 `.env` 모두 `DB_PASSWORD=root`. 기동 중이던 ttalkak-mysql 컨테이너는 `ALTER USER`로 비밀번호만 변경(데이터 보존).
**변경 파일**: `../docker-compose.yml`(수정) · `app/core/db.py`(수정: 기본값·docstring) · `.env`(로컬, git 미추적)
**검증**: 호스트에서 pymysql로 root/root 접속 → `rag_chunk` 134행 보존 확인. 컨테이너 내부 `mysql -uroot -proot SELECT 1` OK.
**결정·근거**: 방향은 "백엔드 기준"(사용자 지시). 빈 비밀번호 쪽으로 맞추는 대안은 backend/compose.yaml(trytur)도 root를 쓰고 있어 배제. 기존 볼륨 재초기화(`down -v`) 대신 ALTER USER로 무중단 정합 — 코퍼스 재인덱싱 불필요.

---

## [2026-07-23] 코퍼스 종류 확장 A안 — 합성 개선 예시 코퍼스(prompt_examples) 프로토타입 (평가 쿼터 대기)
**목적**: 기존 코퍼스(prompt_techniques 134청크)는 '기법 정의 카드'라 추상적이다. 딸각의 실제 작업은 '거친 프롬프트 재작성'이고 uplift_eval이 잡은 약점도 태스크형 재작성이었다. 재작성에 직접 쓰이는 코퍼스는 기법 정의가 아니라 **'유사 요청의 개선 사례(before→after)'** → 이를 별도 컬렉션으로 추가하고 효용을 측정(A안). 개선이 확인되면 타입별 멀티 컬렉션 검색(C)으로 확장.

**Before**
- 코퍼스 = `prompt_techniques` 단일 컬렉션(134). 기법 정의 카드만. (WORKLOG 다수 근거: 카드 순증은 R@5 하락 — 동질성·방해후보 증가, distinct 기법 수 자체가 바운드.)
- 생성 컨텍스트 = `[참고 기법]` 블록 하나. exemplar(개선 사례) 개념 없음.

**After (구현물 — 코드/데이터. 운영 `/query` 경로는 무변경)**
- 신규 `ingestion/gen_examples.py`: 태스크 유형 10종별 (거친 요청 → 개선 프롬프트 + 적용 기법 + 개선 이유) 예시를 LLM 생성·큐레이션(완결성 게이트) → `data/curated/synthetic_examples.jsonl` → 신규 컬렉션 `prompt_examples` 적재. `--from-jsonl`(LLM 0토큰 재인덱싱)·`--dry-run`·`--replace` 지원.
- **20개 예시 적재**(10유형×2, 전량 게이트 통과). 기존 prompt_techniques 134 **무손상**(additive, 별 컬렉션).
- `app/rag/generator.py`: 예시 컨텍스트(`metadata.kind=="example"`)를 **`[참고 예시]` 별도 블록**으로 렌더(`_is_example`/`_build_example_context`/`_build_context_blocks` 신규). **예시 0개면 출력 바이트 동일** → SYSTEM_PROMPT 무변경·gen_eval 무회귀 보장.
- `eval/uplift_eval.py`: `--with-examples N`(치료군 검색에 예시 N개 추가 주입)·`--ex-collection` 추가.

**검증 (LLM 불필요분 — 전부 통과)**
- 무회귀: technique-only 컨텍스트에서 `_build_context_blocks` 출력이 종전 `[참고 기법]\n…`과 **바이트 동일** 단언.
- 기존 유닛테스트 28개(postprocess 21 + token_budget 7) 전부 통과, `py_compile` OK.
- 검색 배선: uplift 4개 쿼리가 prompt_examples에서 정확한 task-type 예시 회수(dense 코사인 0.446~0.649, reranker on).

**검증 (uplift A/B — 미완, 쿼터 블록)**
- arm A(기법만) → arm B(기법+예시2) 순차 실행 시도(`--no-swap`, 8문항).
- **Groq llama-3.3-70b TPD 100k 소진**(429: "Limit 100000, Used 99734")으로 중단. 오늘 generator.py에 `GEN_TEMPERATURE`가 동시 추가된 정황상 **병행 평가 세션과 TPD 공유**가 원인. (8b는 별도 TPD 풀이나 WORKLOG상 8b judge는 신뢰 불가 → 판정용 부적합.)
- arm A 부분결과(5/8 채점): **개선 승 1(마케팅) / raw 승 4(채용·코드리뷰·요약·설명)**. arm B 데이터 0.
  - ⚠️ 이 수치는 **강한 70b 실행모델 기준 vs-raw**라 신호가 약함 — WORKLOG 2026-06-26 "강한 실행모델에선 프롬프트 엔지니어링 한계효용 작음"과 일치. arm B 부재 + 저신호 메트릭 → **예시 효용 판정 불가.**

**알려진 캐비엇**
- 생성 예시에 Groq 70b 언어 혼입 노이즈(`宣傳`,`保護`,`hiện` 등, 알려진 이슈) 잔존 — 구조(before/after/기법)는 정상. 후처리 정제는 후속.
- 예시 커버리지가 uplift_set 태스크 유형과 정렬됨(측정 편의). 일반화(더 다양한 유형·다중 예시)는 후속.

**결정·근거 / 다음**
- A 구현·배선은 완료·검증. **판정만 쿼터 대기.**
- 메트릭 개선안: vs-raw(강한 executor에서 저신호) 대신 **improved_tech vs improved_ex 헤드투헤드**가 예시 효과를 격리하고 raw baseline이 불필요해 비용도 낮음 → 재개 시 이 방식 우선 검토.
- 운영 `/query`는 아직 예시를 주입하지 않으므로(주입은 eval 경로에서만) 파이프라인 계약·RAG_PIPELINE.md 무변경. C에서 `/query`가 예시를 쓰게 되면 그때 문서 동기화.

---

## [2026-07-23] A안 측정 완료 — 헤드투헤드 예시 승률 66.7% (Gemini 경로) → C 진행 결정
**목적**: 직전 A안이 Groq 70b TPD 소진으로 판정 미완. 사용자가 Gemini 키를 추가 → 별도 쿼터로 측정 완료. vs-raw(강한 executor 저신호) 대신 **헤드투헤드**(improved_기법 vs improved_기법+예시)로 예시 효과만 격리.

**여정 (쿼터 벽 3종)**
- Groq `llama-3.3-70b` TPD 100k 소진(병행 세션 공유) → 사용 불가(당일).
- Gemini 키 추가. 모델별 무료 티어 실측: `gemini-2.0-flash`=**limit 0**(무료 불가), `gemini-flash-latest`(→`gemini-3.6-flash`)=**RPD 20**(헤드투헤드 3문항서 소진), `gemini-flash-lite-latest`=측정 완주 가능(더 관대).
- 대응: `eval/uplift_eval._retry` 를 **서버 권고 대기(retryDelay/‘try again in’) 존중**하도록 개선(고정 백오프가 서버 권고보다 짧아 즉시 재실패하던 것 방지). 신규 `eval/example_ab_eval.py`(헤드투헤드 전용, uplift 부품 재사용).

**측정 결과 (uplift_set 6문항, gen/exec/judge 모두 gemini-flash-lite-latest, no-swap, 예시 2개 주입)**
| 지표 | 값 |
|---|---|
| 예시 승률 | **66.7%** (예시 4 / 무 0 / 기법만 2) |
| 평균 점수(1~5) | 기법만 3.50 → 예시 **4.33 (Δ +0.83)** |

- ✅ 진짜 효과: [1]마케팅(톤·이모지), **[6]환불이메일 — 기법만은 "정보부족"으로 작성 거부(1.0), 예시는 즉시 사용 가능 완성(5.0)**. A 가설("예시가 '일단 만들고 원문/재료 채워라' 패턴을 가르침") 직접 입증.
- ⚠️ 노이즈: [2]/[3]은 lite 1024토큰 트렁케이션 아티팩트(서로 상쇄). ❌ [5]광합성은 기법이 5문장 제한 더 정확 준수(정당).

**변경 파일**: 신규 `eval/example_ab_eval.py` / 수정 `eval/uplift_eval.py`(`_retry` 서버권고 대기·`_retry_wait_hint`)

**결정·근거**
- **방향성 양(+)이 분명하고 인과 메커니즘([6])까지 확인** → 사용자 조건("평가 괜찮으면 C")을 충족으로 판단, **C(타입별 멀티 컬렉션 검색) 진행**.
- 단 **정밀 수치는 아님**(n=6·no-swap·lite judge/executor). 최종 default-on 승격 전 쿼터 회복 후 **정밀 재측정 권장**(swap·8문항·강한 judge, exec max_tokens↑로 트렁케이션 제거).

## [2026-07-23] 생성기 운영 견고성 묶음(P1×4) — Groq 에러 매핑 · history 상한 · 장문 Gemini 라우팅 · Gemini 멀티턴 구조화
**목적**: 파이프라인 재검토에서 나온 P1 4건 일괄 처리. 검색 스택은 손댈 곳 없음(측정 완료) — 남은 리스크가 전부 생성기 운영 견고성에 몰려 있어 한 묶음으로 수정.

**Before**:
1. `/query`의 예외 처리는 `RuntimeError`만 503 매핑 — Groq 429(TPM 충돌)·5xx·연결 실패는 `groq.APIError`가 그대로 올라와 **500**. Gemini 쪽엔 429 재시도가 있는데 운영 기본 백엔드인 Groq만 무방비.
2. `_sanitize_history`는 정제만 하고 안 자름 — 스레드가 길어지면 입력이 무한히 커져 `_fit_max_tokens`가 출력 예약을 하한(512)까지 죽이고, 그마저 넘으면 413. verbatim 원문이 assistant 턴마다 반복 포함되는 구조라 실사용 경로.
3. 긴 원문일수록 출력 예산이 줄어드는 구조적 충돌 — "verbatim 포함" 원칙상 출력은 최소 원문 길이인데, Groq TPM 12k에선 긴 회의록이면 잘림이 보장됨.
4. Gemini 백엔드가 system+대화를 한 문자열로 평탄화(리뷰 확인 항목 2) — 멀티턴 role 경계 소실.

**After** (`generator.py`):
1. Groq 429 → 대기시간(헤더→메시지→기본 8s 순 추출)이 20s 이하면 **1회 재시도**, 그 외/소진 시 `RuntimeError` 변환 → `/query`가 **503 + 안내 메시지**. `APIConnectionError`·`APIStatusError`(413·5xx)도 동일 매핑.
2. `_sanitize_history`에 **6,000자 예산 컷** — 최신 턴부터 예산 안에서 유지, 턴 내용은 안 자름(verbatim 훼손 방지), 최신 턴은 초과여도 유지.
3. `Generator`를 요청 단위 라우터로 재구성: 두 키가 모두 있으면 `_needs_long_context`(필요 출력 ≈ 원문 재인용 + 600tok > 남는 TPM 예산) 판정 시 **Gemini로 라우팅**, Groq 실패 시 **Gemini 1회 폴백**. 키가 하나뿐이면 기존과 동일 동작.
4. Gemini를 `system_instruction` + `contents` 배열(user/model 정식 턴)로 전환. 검색 0건 피드백 턴 표기도 Groq와 통일(bare query), `_strip_cjk_noise`도 공통 적용.

**변경 파일**: `app/rag/generator.py`(수정) · `tests/test_generator_guards.py`(신규 14케이스) · `RAG_PIPELINE.md`(§[C]·한계 동기화)

**검증**: 단위 42케이스 전부 통과(guards 14 + token_budget 7 + postprocess 21). Groq 실경로 스모크 1회 — mode=improve·JSON 파싱 정상. 라우팅·폴백은 GEMINI_API_KEY 미설정(현 .env)이라 휴면 — 판정 함수만 단위 검증, 키 추가 시 실경로 확인 필요.

**결정·근거**: 장문 대응은 분할/요약 선처리보다 **백엔드 라우팅**이 싸고 확실(Gemini 컨텍스트가 커서 충돌 자체가 없음 + 원문 무손실). history 컷은 턴 단위(내용 미절단) — 직전 개선 프롬프트가 핵심 맥락이므로 최신 턴 절대 보존. 429 대기 상한 20s — TPD 소진(수십 분 대기)은 기다려봐야 의미 없어 즉시 503으로 클라이언트에 위임.

---

## [2026-07-23] C안 — 타입별 멀티 컬렉션 검색: /query에 개선 예시 주입 배선
**목적**: A안(예시 승률 66.7%·Δ+0.83) 검증 후, `prompt_examples`를 운영 `/query`에서 실제로 쓰도록 배선. 기법 카드와 개선 예시를 **한 검색 풀에서 경쟁시키지 않고 타입별로 따로 검색**해 생성기에 함께 전달.

**Before**
- `/query`는 `prompt_techniques` 단일 검색 → 그 결과만 생성기로. 예시 주입은 eval 경로에서만(A안 실험).

**After** (`app/main.py` `/query`)
- `QueryRequest`에 `use_examples`(기본 True)·`example_collection`(prompt_examples)·`n_examples`(2)·`example_min_score`(0.40) 추가.
- 기법 검색(기존) 후 **예시 별도 검색**: `req.query`(원본 거친 요청)로 매칭(HyDE/변환쿼리 아님 — 예시의 'before'가 원 프롬프트를 닮을수록 유효), **리랭커 생략**(20건 typed 컬렉션엔 dense로 충분+쿼리당 리랭크 2회 지연 방지), `example_min_score` 컷. 실패·빈 컬렉션·min_score 미달은 모두 '예시 없음'으로 흡수.
- `run_generation(req.query, retrieved + examples, …)` — generator가 `metadata.kind`로 `[참고 기법]`/`[참고 예시]` **분리 렌더**(2026-07-23 A안에서 도입한 `_build_context_blocks`).
- **404 가드는 기법 기준 유지**(예시는 보조 재료, 무관 입력을 구제하지 않음). **`sources`는 기법만**(예시 미포함) → QueryResponse 스키마·프론트 계약 **무변경**.

**변경 파일**: `app/main.py`(QueryRequest 4필드·query() 예시 주입) · `RAG_PIPELINE.md`(§0 흐름 [B+]·§[C] 컨텍스트·§3 설정표·§4 한계 동기화)

**검증**
- `py_compile` OK. 기존 유닛테스트(postprocess 21 + token_budget 7 + generator_guards 14 = 42) 전부 통과 — **무회귀**.
- **C 데이터 경로(LLM 불필요)**: "환불 이메일" 쿼리 → 기법 5 + 예시 2(둘 다 task=email, dense 0.615/0.547) → `_build_context_blocks`가 `[참고 기법]`·`[참고 예시]` 둘 다 렌더, kind 플래그 정확. 무회귀 재확인(technique-only 바이트 동일).
- 생성 경로는 A안 헤드투헤드가 이미 `run_generation(task, techs+exs)`(=C와 동일 호출)로 실증.
- ✅ **운영 활성화 완료(2026-07-23)**: 코드는 이미지에 baked(`COPY . .`)라 `docker compose -p ttalkak build rag-server && up -d rag-server`로 재빌드·재생성(pip 레이어 캐시, hf-cache 볼륨 재사용). 컨테이너 `use_examples` 반영 확인, healthy, 라이브 `/query` 스모크(환불이메일) **200 OK**(mode=improve·score 8·Role/Step-by-step, sources는 기법 5개만). `.dockerignore`가 ingestion/eval 제외라 예시 재생성은 호스트에서.

**결정·근거**
- `use_examples` 기본 **True**: A안이 양의 신호 + 사용자 목표가 '예시 사용'. 단 근거가 방향 신호(n=6·lite)라 **per-request로 끌 수 있게** 남기고, 정밀 재측정 후 최종 확정(RAG_PIPELINE §4 백로그).
- 예시는 `req.query`로 매칭(검색 변환쿼리와 분리) — 예시 매칭 대상은 '원 프롬프트를 닮은 사례'이므로. 리랭커 생략은 20건 규모+지연 트레이드오프(코퍼스 커지면 재검토).
- `example_min_score=0.40`은 기법 컷 재사용한 **임시값** — 무관 입력에도 예시 1건이 통과하는 경우 관측(404가 먼저 잡지만) → score_analysis로 예시 코퍼스 기준 재측정 필요(백로그).

---

## [2026-07-23] 개선 예시 코퍼스 2차 확장 — 20 → 131 (태스크 20유형·순수 한국어)
**목적**: A안 검증 후 예시 커버리지 일반화(사용자 요청 "100개 이상"). uplift 태스크 유형에 정렬됐던 20개를 대체해 실사용 유형 전반으로 확대 + 언어 혼입 노이즈 제거.

**Before**: `prompt_examples` 20개(10유형×2). Groq 70b 언어 혼입 노이즈(`宣傳`·`保護` 등) 잔존.
**After**: **131개**(gemini-flash-lite-latest, `--replace` 재구축). `gen_examples.py`에 태스크 **10종 추가**(sns_post·product_desc·cover_letter·study_plan·interview_qa·naming·proofread·extract·classify·sql_query → 총 20종) + `_GEN_SYSTEM`에 **"순수 한국어(한자·외국어 금지)" 규칙** 추가 → 노이즈 소거 확인. (summarize 유형은 이번 배치 산출 0 — 게이트/파싱 실패로 19유형 실적재, 7개씩 대체로 채워짐.)

**변경 파일**: `ingestion/gen_examples.py`(TASK_TYPES 20종·no-hanja 규칙) · `data/curated/synthetic_examples.jsonl`(131) · DB `prompt_examples`(--replace)

**검증**: DB COUNT **prompt_examples=131 / prompt_techniques=134 = 265**. 프리뷰상 순수 한국어(노이즈 소거). 코퍼스 브라우저 아티팩트(검색·필터 HTML)로 265청크 전량 육안 확인 가능.

**결정·근거**
- `--replace`로 깨끗이 재구축 — A 측정에 쓴 노이즈 20개는 폐기(측정 완료분).
- ⚠️ A 헤드투헤드(승률 66.7%)는 **구 20개 기준**. 확장 131 기준 **정밀 재측정은 쿼터 회복 후**(백로그) — 확대·정제로 최소 동등 이상 기대하나 수치 확인 필요. `example_min_score`도 확대 코퍼스 기준 재측정.
- 생성은 품질보다 **양·커버리지·쿼터 안정성** 우선으로 lite 선택. 강한 모델(70b) 재생성은 쿼터 회복 후 품질 업그레이드 옵션.

---

## [2026-07-23] 질문 모드 계약 노출 — `/query` 응답에 mode·questions·summary 추가
**목적**: 최재원 2026-07-12 지적 대응 — 질문 모드(mode="ask") 데이터가 `answer` 마크다운 안에만 있어 프론트가 `improved_prompt==""`로 **추측**하거나 마크다운을 **되파싱**해야 했다. 프론트가 세 UI(리스트/카드/배너) 중 무엇을 쓰든 결정적으로 렌더하도록 구조화 필드를 상단에 노출한다.

**Before**
- `QueryResponse { answer, improved_prompt, sources, techniques_applied, changes, score }` — **mode·questions·summary 없음**
- LLM은 이미 `{mode, questions, summary}`를 JSON으로 냈지만 `run_generation`이 이를 버리고 `build_answer()`로 `answer` 마크다운(`**확인이 필요해요 🤔**\n• 질문…`)에만 뭉쳐 담음
- 프론트: 질문 모드를 `improved_prompt==""`로 추측 / 질문 개별 항목은 markdown 되파싱 필요

**After**
- `QueryResponse`에 **`mode`(improve|ask) · `summary` · `questions[]`** 추가 (기존 필드·`answer` 마크다운은 그대로 → 하위호환)
- 필드 조립을 순수 함수 **`postprocess.assemble_fields(raw)`**로 분리 — `run_generation`은 LLM 호출·503 가드만, 조립은 LLM 없이 단위 테스트되는 seam
- 폴백(비JSON): `mode`는 개선블록 유무로 추정, `questions=[]`(answer 원문으로 우아하게 저하)
- 계약·왕복 흐름 문서 `QUESTION_MODE_CONTRACT.md` 신규(프론트/백 담당자용)

**변경 파일**
- 수정: `app/rag/postprocess.py`(assemble_fields 신규) · `app/main.py`(QueryResponse +3필드, run_generation 위임, 엔드포인트 반영) · `tests/test_postprocess.py`(assemble_fields 계약 테스트 15케이스) · `RAG_PIPELINE.md`
- 신규: `QUESTION_MODE_CONTRACT.md`

**검증**
- `python3 -m tests.test_postprocess` **36/36 통과**(신규 15 포함: ask questions/summary 통과, improve questions 비움, 폴백 mode 추정 양방향)
- `test_generator_guards` 15/15 · `test_token_budget` 13/13 무회귀. `py_compile app/main.py` OK
- eval 3종(`gen_eval`·`uplift_eval`·`example_ab_eval`)은 `run_generation` 반환 dict에서 특정 키만 읽음 → 키 추가는 additive·무회귀(import 시그니처 불변)

**결정·근거**
- `mode`를 **응답 최상단 단일 기준**으로: `improved_prompt==""` 추측은 폴백·엣지에서 깨질 수 있고 세 UI 방식 지원 불가. 구조화 `questions[]`면 리스트/카드/배너 어느 렌더든 프론트가 자유 선택.
- `answer` 마크다운 **유지**: 익스텐션 UI·history 왕복 형식 무변경 + 폴백 시 항상 렌더 가능한 안전판.
- 조립 로직을 `assemble_fields`로 뽑아 **LLM 없이 계약을 테스트** — 프롬프트/스키마 변경 시 회귀를 CI급 단위테스트로 포착.
- UI 방식(리스트/카드/배너) 선택은 **프론트 담당자 몫** — API는 셋 다 지원만 하고 강제하지 않음.

---

## [2026-07-23] 질문 모드 강화 — 방식1 채택, '채워야 할 정보' 명시화 (방식2/3 보류)
**목적**: 팀 결정 — 변경 전 계약으로도 방식1(리스트)+왕복은 이미 동작했음을 확인하고, 방식2(카드)·방식3(배너)는 **보류**. 대신 방식1을 강화: 질문 모드에서 **'어떤 작업엔 어떤 정보를 채워야 하는지'를 질문마다 명확히** 드러낸다.

**Before**
- [질문 모드] SYSTEM_PROMPT: "짧고 구체적인 질문 1~3개(보기/예시 포함)" — 항목·이유가 불명확해 "누구를 위한 건가요?" 같은 추상 질문 가능
- `build_answer` ask 렌더: 헤더 + summary + 질문 불릿만 (무엇을 왜 채우는지 안내 부재)

**After**
- SYSTEM_PROMPT [질문 모드] 강화: 각 질문을 **`항목명: 질문 + 왜 필요한지 (예: 보기)` 3요소** 형식으로 강제. `summary`는 **파악한 작업 + 무엇이 비어 특정 못 하는지** 한 줄. (스키마 힌트도 동기화)
- `build_answer` ask: 질문 앞에 **"아래 정보를 알려주시면 이어서 만들어 드릴게요:"** 안내문 추가(방식1 강화). 문구에 `개선된 프롬프트` 마커를 넣지 않아 `extract_improved_prompt` 오인 없음
- 계약 문서: 방식1 채택·방식2/3 보류 명시, '채워야 할 정보' 표시 규칙(§1)·예시(§3)·UI(§7) 갱신

**변경 파일**
- 수정: `app/rag/generator.py`(SYSTEM_PROMPT [질문 모드]·스키마 힌트) · `app/rag/postprocess.py`(build_answer ask 안내문) · `tests/test_postprocess.py`(안내문 테스트) · `QUESTION_MODE_CONTRACT.md`(§6 역할별 가이드로 정리) · `RAG_PIPELINE.md`
- 신규: `CONTRACT_BACKEND.md`(백엔드 담당자용 `/api/prompts/improve` 가이드) · `CONTRACT_FRONTEND.md`(프론트 담당자용 렌더 가이드) — 최재원 규약(AI→백→프론트)대로 역할별 파일 분리

---

## [2026-07-23] 백엔드↔프론트 통합 결함 검토 (질문 모드 end-to-end 미연결)
**목적**: 백엔드/프론트 실제 코드를 읽고 질문 모드 계약이 실제로 배선됐는지 엄격 검토. `user_context` 입력 확장 여부 결론.

**Before(관측)**: `/api/prompts/improve`(PromptController.java)·확장(useConversation.js) 이미 구현. 그러나 **둘 다 `mode`/`questions`/`summary`를 안 읽음** → 백엔드 `buildImproveResponse`가 `improved_prompt`("")를 `answer`(질문 마크다운)로 폴백 → `improvedPrompt=질문텍스트` → 프론트가 Execute 버튼 노출. **질문 모드가 개선 모드로 오작동.** 상태축도 `ragStatus`(ok/no_evidence)와 `mode`(improve/ask) 둘로 갈림.

**After**: 결함·미해결 결정을 코드 근거(`파일:줄`)와 함께 `CONTRACT_DECISIONS.md`로 정리. P0(D1 mode 통과·D2 ask improvedPrompt="" 강제·D3 프론트 ask 분기), P1(UI/UX 흐름 U1~U6), P2(계약 정리), 분기 우선순위(mode 1차)·질문 모드 UX 흐름도 포함. `user_context` **저장형 폐기** 결론(target_model만 요청 단위, 프론트 executeTarget 활용) → CONTRACT_BACKEND §6 반영.

**변경 파일**
- 신규: `CONTRACT_DECISIONS.md`
- 수정: `CONTRACT_BACKEND.md`(§6 실제 구현 주석+user_context 결론) · `CONTRACT_FRONTEND.md`(현재 결함 주석) · `QUESTION_MODE_CONTRACT.md`(§6 결정문서 링크)

**검증**: 코드 리딩 근거 — PromptController.java:781(improvedPrompt 폴백), ChatFeed.jsx:165(Execute 조건), useConversation.js:251(ragStatus 분기). rag-server 코드 변경 없음(문서·검토만).

**결정·근거**
- 질문 모드 정상화는 **rag가 아니라 백엔드·프론트 배선 문제** — `/query`는 이미 `mode`/`questions`를 냄. 수정 지점은 backend `buildImproveResponse` + frontend `normalizeImproveResult`/`useConversation`.
- `mode` 1차 축 권장: `ragStatus`(no_evidence)는 improve 하위상태로. ask는 sources가 있어 ragStatus만으론 구분 불가.
- 신규 UI 최소화: 기존 composer·history·말풍선 재사용, `mode` 분기 + "ask면 executablePrompt=null"만 추가.

---

## [2026-07-23] 통합 상태 전체 재검토 + 계층 간 SSOT 계약 문서
**목적**: develop 현행에서 rag·backend·extension·web·docker 연동을 처음부터 재점검. 계층 간 규칙을 담당자 공유용 단일 문서로 확정.

**검토 결과(신규 발견)**
- **프론트가 둘**: Chrome 확장 + 웹(prompt-hub-web-frontend, nginx :4173). 둘 다 `/api/prompts/improve` 호출.
- **`mode`/`questions` 계약이 4계층 제각각**: rag=`ask` 방출 / backend=버림 / 확장=안 읽음 / 웹=`question` 기대(값 불일치). 웹은 방식1 렌더 로직이 이미 있으나 mode 값 불일치+backend 차단으로 죽어 있음.
- **배선은 견고**: docker(mysql3306/backend8080/rag8000/web4173, 공유 DB `ttalkak`), 인증(improve=permitAll·make/**=ROLE_USER), CORS(env 패턴+chrome-extension origin), JPA ddl-auto=update(rag_chunk는 Python 소유라 무충돌).
- **rag 검증**: assemble_fields 순수경로로 ask→`{mode:ask, improved_prompt:"", questions, summary}`, improve→`{mode:improve, improved_prompt, score}` 확인. 테스트 37/37. **rag는 정본 계약 만족**(단 미커밋·컨테이너 재기동 필요).

**변경 파일**
- 신규: `CONTRACT_LAYERS.md`(SSOT — 정본 필드·경계 변환 규칙·2축 우선순위·e2e 예시·계층별 체크리스트)
- 수정: `QUESTION_MODE_CONTRACT.md`·`CONTRACT_DECISIONS.md`(SSOT 링크+웹 4번째 계층 반영)

**결정·근거**
- 정본 `mode` 값 = **`ask`/`improve`**(rag 기준). 웹의 `question`은 폐기 → `ask`로 정정(한 줄).
- 정본 필드명: 프론트 대상은 camelCase(backend가 snake→camel 변환), 실제 변환은 `improvedPrompt`·`techniquesApplied` 둘뿐.
- **backend 통과가 P0 병목**: 여길 안 고치면 프론트 수정이 무효. rag는 완료라 잇기만 하면 됨.

**검증**
- `python3 -m tests.test_postprocess` **37/37 통과**(안내문구 케이스 추가). `py_compile` OK
- ⚠️ mode 판정(improve vs ask) 규칙은 **미변경** — 강화는 질문 '문구'에 국한. gen_eval `mode_accuracy` 회귀 위험 낮음(판정부 불변). 쿼터 회복 시 질문 품질 육안 확인 권장(백로그)

**결정·근거**
- **방식2/3 보류가 안전한 이유**: 되파싱이 필요했던 건 방식2/3뿐 — 그 UI를 안 만들면 문제도 없음. 기존 구조로 방식1은 동작했으므로 이번 변경은 '필수 수정'이 아닌 **방식1 명확성 강화**.
- 슬롯 스키마를 코드로 하드코딩(작업유형별 필수항목 표)하지 않고 **프롬프트로 유도** — 기존 A/B 판정 철학(LLM 자율) 유지, 유형 확장에 유연. 하드코딩 슬롯은 필요 시 후속(백로그).
- `questions[]`가 `항목명:` 접두로 구조화돼 방식2/3 보류 해제 시 **추가 API 변경 없이** 확장 가능.

---

## [2026-07-27] gen_eval에 환각률(faithfulness) 측정 추가
**목적**: "AI가 임의로 채우는(환각) 게 완전 없다고 할 수 있나?" — 감이 아닌 수치로. 개선안이 사용자가 안 준 구체 사실을 지어내는지 측정.

**Before**: gen_eval judge가 mode_fit·technique_grounding·instruction_form·intent 4개만 채점. 환각(입력에 없는 사실 창작) 지표 없음.
**After**: judge에 **faithfulness(1~5)** + **fabricated(bool)** 추가(같은 judge 1회, 추가 호출 없음). 정상 가정(대상·톤·분량 등 보조항목)은 감점 아님, 없는 구체 사실(날짜·가격·고유명사·원문 창작)만 감점. 집계에 **환각률(fabricated 비율)** 출력.

**변경 파일**: `eval/gen_eval.py`(judge 기준·집계·출력·docstring)

**검증 (컨테이너 실행)**:
- 정보-충분 6개: faithfulness 5.00 / **환각률 0.00 (0/6)** / mode_accuracy 1.00. 개선안이 사용자 준 값만 사용, 창작 없음.
- **부분-정보 6개 신규(gen_set 13~18 추가)**: 모델이 **5/6을 ask로 자기선택** — 창작 유혹 지대에 진입하지 않고 되물음. 유일하게 improve한 '제주도 여행'도 특정 장소·가격을 지어내지 않고 일반화(faith 4, 환각 0/1). mode_accuracy 0.67.
- ⭐ **핵심 발견**: 현재 환각이 낮은 진짜 이유 = "모델이 정보 부족하면 ask로 빠져 **위험 지대를 회피**". → **하이브리드('항상 개선안')는 바로 이 안전밸브를 없애 partial 입력에 improve를 강제** → 여기서 환각이 실제로 발생. **현재 0%는 하이브리드에 전이되지 않음.**
- ⚠️ 하이브리드/다중턴의 실제 환각률을 재려면 (a) partial 입력에 **improve 강제** 측정, (b) **다중턴 drift** 케이스가 별도로 필요(백로그).

**결정·근거**: faithfulness(점수)와 fabricated(이진 플래그)를 분리 — 품질과 환각률을 각각. 정상 가정 vs 환각 구분을 judge 프롬프트에 명시해 설계된 보조항목 가정을 환각으로 오판하지 않게.

---

## [2026-07-29] 공신력 소스 코퍼스 수집 — prompt_techniques 134→190 (+56) · 검색 회귀 관측(결정 대기)
**목적**: 사용자 요청 "다양한 공신력있는 사이트/인물 기준으로 코퍼스 수집". 목적성 프롬프트 가이드/블로그를 직접 fetch해 기법 카드로 적재.

**수집 소스(사이트 5 + 인물 2)**: Lilian Weng(OpenAI, 블로그) · OpenAI GPT-4.1 Prompting Guide · Microsoft Azure PE · Google Gemini Prompting · DAIR promptingguide(Elvis Saravia) · Learn Prompting · Anthropic Claude PE. WebFetch로 추출 → `data/web_sources/*.txt`.

**파이프라인(신규 `ingestion/ingest_web.py`)**: 텍스트 소스를 기존 ingest_knowledge 부품(LLMJudge 추출·curate·semantic_dedupe·Indexer)에 태우는 얇은 래퍼. **Gemini lite로 추출**(Groq TPD 회피). 63카드 추출 → 이름중복 3 + 의미중복(0.85) 9 폐기 → **56 신규 적재**.
- dedup 임계 스윕(0.82/0.85/0.88): 0.82는 ReAct·ToT·Self-Ask 등 구별 기법까지 폐기(과공격), 0.85가 균형 → 채택.

**검증 — 검색 회귀(run_eval, qa_set_realistic 59문항, LLM無)**
| 경로 | 134청크 | 190청크 | Δ |
|---|---|---|---|
| 리랭커(raw) | R@5 0.822 / Hit@1 0.695 / NDCG 0.757 | R@5 **0.746** / Hit@1 **0.593** / NDCG 0.656 | **−7.6 / −10.2 / −10.1 pp** |
| 리랭커+HyDE(운영) | — | R@5 **0.483** / Hit@1 0.373 | 급락 |
- 🔴 **material 회귀**. WORKLOG 기존 교훈("중복 카드 순증 = 방해후보 → R@5 하락")과 일치. HyDE 급락은 추가된 **제네릭 near-dup**(Instructions·Clear Instructions×4·Constraints·Delimiters×5·Long Context×3 등)이 HyDE 가상문서의 오답 attractor가 되는 것으로 추정.
- ⚠️ qa_set 정답은 기존 134 기준 → **신규 커버리지 이득은 미측정**(방해 비용만 보임). 신규 기법(Self-Ask·ToT·ReAct·PAL·Reflexion·Persistence·Grounding·Prefill 등)을 겨냥한 평가문항 없음.
- ⚠️ HyDE 기본화는 병행 세션(2026-07-29) 작업 — 코퍼스 확장이 그 튜닝과 상호작용. 조인트 재튜닝 필요.

**변경 파일**: 신규 `ingestion/ingest_web.py` · `data/web_sources/*.txt`(7) · `data/curated/web_sources.paper.*.jsonl` · DB `prompt_techniques`(+56). 코퍼스 브라우저 아티팩트 갱신(321청크).

**결정·근거 (미결 — 사용자 판단)**
- 수집 자체는 완료. 그러나 **−7.6pp(raw)~급락(hyde) 회귀는 방치 불가** 수준.
- 원인의 상당분은 **제네릭 near-dup 카드**(회피 가능). 선택지: (A) near-dup ~18개 정리 후 재측정(구별 기법 ~38 유지, 권장) / (B) 전량 유지(커버리지 우선, 회귀 감수) / (C) 56 전량 롤백(원복은 origin_pdf 기준 삭제로 가역). **사용자 결정 대기.**
- 원복 방법 기록: `DELETE FROM rag_chunk WHERE collection_name='prompt_techniques' AND JSON_EXTRACT(metadata,'$.origin_pdf') IN (<web 소스명들>)` 또는 chunk_id prefix.

---

## [2026-07-29] 검색 쿼리 HyDE 상시 적용 (문체 미스매치로 인한 min_score 컷·404 해소)
**목적**: 사용자 직접 테스트에서 "제주도 여행 블로그 글 써줘"에 "아이랑 3박4일"을 덧붙이자 개선이 아니라 404가 났다. 정보를 더 줬는데 검색이 더 약해진 역설을 근본 원인(문체 장르 미스매치)에서 해결.

**Before**:
- `use_hyde=False`, 검색이 **원본 문장을 그대로 임베딩**. `_HYDE_MODEL=llama-3.3-70b-versatile`.
- 코퍼스(기법 설명 카드)와 사용자 입력(거친 작업지시)은 **문체 장르가 달라** 주제가 맞아도 dense 코사인이 **0.34~0.48 좁은 띠**에 눌림. `min_score=0.40` 컷이 이 띠 한복판을 자름.
- 실측: "제주도 여행 블로그 글 써줘" top 0.419/0.408(0.40 겨우 통과) → "아이랑 3박4일" 추가 시 전부 0.34~0.35로 추락 → retrieved 0건 → **첫 턴 404**(`main.py:156`).

**After**:
- `use_hyde=True`(기본), `_HYDE_MODEL=llama-3.1-8b-instant`. 검색 전 쿼리를 **기법 카드형 가상문서로 재작성**(`원본+가상문서`)해 코퍼스와 장르를 맞춤.
- 실측(리랭커 ON, 6개 쿼리): baseline 0.34~0.61 → **hyde 0.69~0.84, 폴백 0건**. 회수 기법도 더 정확: "자기소개서 써줘" base #1이 무관한 `Meta-Prompting`/`Query Rewriting` → hyde는 코퍼스가 자소서 용례로 명시한 `Analyst-Then-Writer`를 #1로. "코드리뷰"는 `Code Review Prompting` #1 유지(0.608→0.83, 무회귀).

**변경 파일**:
- `app/rag/query_transform.py`(수정): `_HYDE_MODEL` 70b→8b + 근거 주석
- `app/main.py`(수정): `QueryRequest.use_hyde` 기본 False→True + 근거 주석, 404 블록 주석 갱신(hyde 상시 적용 시 미발동 조건 명시)
- `RAG_PIPELINE.md`(수정): 기본설정·[A] 검색쿼리 결정·B4 min_score/404·§2-(1) 반영

**검증 (컨테이너 직접 프로브 — 생성 우회)**:
- `probe_b.py`: baseline vs transform vs hyde(70b). hyde 70b는 5개 중 3개 **429 폴백**(TPD 소진) 확인 → 70b 부적합.
- `probe_hyde8b.py`: hyde 8b 6개 전부 0.69~0.84 통과, 폴백 0.
- `probe_quality.py`: (a) 회수 기법 관련성 동등~향상, (b) 쓰레기 입력("asdf")도 0.77로 통과 → **404 관련성 게이트는 hyde로 무력화됨**(의도된 부수효과 — 무의미 입력은 생성 `mode=ask`가 최종 게이트).
- ⚠️ **end-to-end /query 검증은 오늘 보류**: 생성 LLM(Gemini 일한도 + Groq 70b TPD) 소진으로 생성 단계가 503. 이는 **일일 쿼터 이슈로 이번 변경(검색)과 별개** — 쿼터 회복 후 실쿼리 재확인 필요(백로그).

**결정·근거**:
- **hyde가 먹히는 이유는 70b의 추론력이 아니라 '카드 형식(장르) 모방'** — 형식만 맞추면 되어 8b로 충분(오히려 70b보다 높음). 8b는 TPD 여유·저지연.
- keyword `transform`은 여전히 카드 장르와 안 맞아(임영웅 0.42→0.37 악화, 시스템 프롬프트 누출) 채택 안 함.
- **min_score=0.40은 유지**: hyde로 사실상 무력화되지만, hyde 폴백 시의 안전망으로 남김. **A안(하드 404 폐지)은 별도 개선으로 미결** — 이번엔 B(검색)만 처리. hyde 폴백+원본<0.40인 드문 케이스에서 여전히 404 가능하므로 A는 후속 권장.
- gen_eval 종합 재측정(mode_accuracy/기법근거/환각률에 대한 hyde 영향)은 쿼터 회복 후 백로그.

---

## [2026-07-30] gen_eval에 HyDE 토글(--no-hyde) 추가 + HyDE의 생성영향 측정
**목적**: gen_eval이 검색을 원본 쿼리로 직접 호출해(hyde 미적용) 운영(use_hyde=True)과 불일치했다. HyDE가 mode/기법근거/환각률에 주는 영향을 운영과 동일 경로로 측정.

**Before**: `retriever.search(query=query)` — 원본 쿼리 검색(hyde 미반영). 운영 파이프라인과 검색 단계가 달랐다.
**After**: `--no-hyde` 플래그 추가(기본 hyde on = 운영 충실). 검색 전 `query_transform.hyde()` 적용, 실패 시 원본 폴백. 헤더에 HyDE on/off 표기.

**변경 파일**: `eval/gen_eval.py`(수정: import·플래그·검색부·헤더)

**검증/측정 (gen_set 18문항, 생성 gemini-flash-latest, judge llama-3.3-70b temp0)**
| 지표 | HyDE ON(운영) | HyDE OFF(baseline) |
|---|---|---|
| mode_accuracy | 0.78 (14/18) | 1.00 (18/18) |
| technique_grounding | 4.33 (n=18) | 5.00 (n=8, judge 429로 일부만) |
| faithfulness | 5.00 | 5.00 |
| 환각률(fabricated) | 0.00 (0/7) | 0.00 (0/8, full-info만 판정됨) |

- **mode 차이의 실체**: ON/OFF가 갈린 4개(항목 8·13·14·15, borderline/partial-info)에서 **ON=ask, OFF=improve**. mode_accuracy 0.78 vs 1.00은 gen_set 라벨(expected=improve, 하이브리드 지향) 기준이다.
- 🔴 **핵심 발견 — "높은 mode_accuracy"의 대가**: OFF의 1.00은 partial-info를 improve한 결과인데, 캐시 직접 검사 결과 **항목15(신제품 이어폰)에서 스펙 창작**("AirSound Pro"·"최대 30시간"·"IPX4"·"ANC") 발생. gen_set note가 예고한 "배터리시간·가격·기능 창작"이 그대로 실현. 반면 **ON은 같은 입력을 ask로 되물어 창작 회피**(mode=ask). 항목13(제주도)은 양쪽 다 방향가정 수준(2박3일·감성카페 — Low), 항목14(다이어트)는 창작 없음.
- **technique_grounding 4.33(ON)**: 병행세션의 R@5 0.483(190 코퍼스+hyde) 회귀에도 생성 기법근거는 견고 → near-dup 회귀는 검색지표 문제이고 생성기가 대체로 흡수.
- ⚠️ **judge(70b) RPM/TPD 한계**: ON 18건 판정 후 OFF는 429로 앞 8건(full-info)만 판정. partial-info(13-15) judge 점수는 미확보 → **캐시 생성물 직접 검사로 보완**(위 이어폰 케이스).
- ⚠️ temp 0.7 단일 실행 — borderline 4건의 mode flip은 방향 신호이지 확정 아님(반복측정 필요, 백로그).

**결정·근거**
- **mode_accuracy는 이 평가셋에서 오도적 지표**: OFF의 1.00은 "improve해야 할 것을 improve"가 아니라 "창작해서라도 improve"를 보상한다(이어폰 스펙). 안전(환각) 기준으론 ON의 ask가 더 보수적.
- **하이브리드 설계 함의**: 하이브리드('항상 개선안+선택질문')는 13-15를 improve로 강제 → 이어폰형 스펙 창작을 유발. 채택 시 **미상 구체값을 그럴듯한 가짜(30시간)가 아니라 명시적 플레이스홀더([배터리 시간 입력])로 강제**하는 제약이 필요. (OFF 생성이 제품명엔 "(가칭)"을 붙인 걸 보면 유도 가능.)
- gen_eval 토글은 유지 — 이후 hyde on/off 회귀 비교의 표준 경로. judge 한계는 --sleep 상향 또는 판정 모델 분리로 후속.

---

## [2026-07-31] MAKE 파이프라인 2단계화 — 요청 분석기(1단계) + 하이브리드 생성(2단계)
**목적**: (1) 정보가 없으면 모델이 **가짜 사실을 창작**하던 문제(실측: 이어폰 요청에 "AirSound Pro"·"최대 30시간"·"IPX4" 날조) 차단. (2) 세부가 조금만 비어도 통째로 질문 모드로 빠져 **Execute가 안 나오던** UX 해소. (3) ask/improve 판정 흔들림(mode_accuracy 0.78) 개선.

**Before**
- 단일 LLM 호출(temp 0.7)이 mode 판정 + 개선안 + 질문을 한 번에. borderline 입력에서 판정이 흔들림.
- `improve`면 `questions=[]`(XOR) → 개선안과 질문이 공존 불가.
- `questions`는 문자열 배열 → 어떤 항목을 묻는지 코드가 알 수 없음(반복 질문 방지 불가).
- 정보 부족 시 그럴듯한 구체값을 창작.

**After** — 규약 v3(`CONTRACT_MAKE_PIPELINE.md`, git 미추적)
- **1단계 분석기**(`app/rag/analyzer.py` 신규, temp 0.2, llama-3.1-8b): 요청마다 필요한 필드를 **동적 도출** → `{name, role(required|fact|framing), status, value}`. 실패 시 `None` → 기존 단일 단계로 무회귀 폴백.
- **2단계 생성기**(temp 0.7): `[요청 분석]` 블록 소비 → filled=재료 / **empty·fact=`[항목명 입력]` 빈칸 + 질문** / empty·framing=가정 후 changes 명시.
- **하이브리드(XOR 폐기)**: `improve`에도 `questions` 공존. 실행 가능한 개선안 + 선택 질문.
- **questions 객체화**: `[{field, question, reason, importance}]`. `normalize_questions()`가 구형 문자열도 승격(하위호환). 응답에 `fields[]`(분석 결과) 추가.

**변경 파일**
- 신규 `app/rag/analyzer.py`
- `app/rag/generator.py`: `build_analysis_block()` 추가, 3개 generate()에 `analysis` 파라미터, SYSTEM_PROMPT 개정(빈칸 안전규칙·분석블록 소비·하이브리드·questions 객체 스키마)
- `app/rag/postprocess.py`: `normalize_questions()` 추가, `build_answer` 객체 렌더 + improve 선택질문 섹션, `assemble_fields` 문자열 강제변환 제거
- `app/main.py`: `run_generation`에 분석기 배선, `QueryResponse.questions: list[dict]` + `fields` 신설
- `tests/test_postprocess.py`: 하이브리드 6케이스 추가 (43개 전부 통과)
- `RAG_PIPELINE.md`: [C0] 분석 단계 신설·[C] 개정

**검증 — 분석기 전수조사(gen_set 18문항, `derive_mode` 프록시)**
| 반복 | mode | role | 만능필드 | 예시오염 | 조치 |
|---|---|---|---|---|---|
| v1 | 0.78 | 0.96 | 11건 | 2건 | 초기 프롬프트 |
| v2 | 0.72 | 0.95 | 0 | 0 | 오염 제거·만능필드 금지 |
| v3 | 0.83 | 0.95 | 0 | 0 | status 판정 규칙(단서 있으면 filled) |
| v4 | 0.83 | 0.93 | 0 | 0 | 일반명사 ≠ 주제 규칙 |
| v5 | 0.78 | **1.00** | 0 | 0 | 코드 가드(역할 강제·required 상한) |
| v6 | **0.94** | 0.96 | 0 | 0 | framing 가드를 정확매칭으로 축소 |
| v7~v9 | 0.83 | 0.96 | 0 | 0 | 규칙 6-1(결과물에 필요한 fact 도출) 추가 — **빈칸 기능을 얻는 대가로 프록시 −0.11** |

- v6(0.94)는 빈칸을 못 만들었다(빈 fact 도출 0건) → 하이브리드의 핵심인 **환각 방지 빈칸이 작동 안 함**. 규칙 6-1로 fact 도출을 살리자 프록시가 0.83으로 내려갔으나, **빈칸·질문이 실제로 생성**되므로 이쪽을 채택.
- ⚠️ **프록시(`derive_mode`)는 end-to-end 를 과소평가한다**: v9에서 프록시가 틀린 `[1] 임영웅 콘서트`·`[4] 회의록 템플릿`을 라이브 `/query`로 확인하니 **생성기가 둘 다 improve 로 교정**했다(분석 블록을 '단정'이 아닌 '확인 요청'으로 렌더 + 생성기가 원문을 재확인하도록 지시). 최종 판단 주체는 생성기다.

- ⭐ **핵심 교훈: 8b는 프롬프트 예시를 무관한 요청의 필드명으로 복사한다**("환불 거절 이메일"→"글 써줘", "자기소개서"→"부산 여행"). 문장 규칙으로는 두더지잡기 → **하드 제약은 코드로**(`_sanitize`: 만능필드·작업유형어 제거, 대상/톤/분량→framing 강제, required 상한 2).
- ⚠️ v5 회귀 원인: framing 가드가 부분 문자열이라 `"홍보 대상"`(마케팅의 required)까지 강등 → `required=[]` → improve 오판. **정확 매칭 + '독자' 포함**으로 수정해 0.94.
- 남은 오답 1건: `"이거 좀 개선해줘"`(지시대명사를 주제 filled로 오판).

**검증 — end-to-end 라이브 `/query`**
| 입력 | mode | 결과 |
|---|---|---|
| 신제품 무선 이어폰 소개 글 | improve | `[제품명 입력]`·`[핵심 사양 입력]` **빈칸** + 대응 질문 2개. **창작 스펙 0** (Before: AirSound Pro·30시간·IPX4 날조) |
| 제주도 여행 블로그 글 | improve | 실행 가능한 개선안(framing만 가정). 이전 세션에서 5/5 ask로 막히던 케이스 해소 |
| 글 써줘 | ask | 주제 질문 1개, improved_prompt="" |
| 임영웅 콘서트(정보 충분) | improve | 분석기가 홍보대상을 empty로 오판해도 **생성기가 원문 재확인 후 교정** |
| 회의록 요약 **템플릿** 요청(원문 미첨부) | improve | `[회의록 원문 붙여넣기]` 빈칸으로 완성 템플릿 제공 |
| 회의록 **원문 붙여넣음** | improve | 원문 verbatim 포함 확인, 빈칸으로 대체되지 않음(무회귀) |

**부작용 — SYSTEM_PROMPT 증가(실측 2,766 → 4,091 토큰, +48%)**
- 장문 라우팅 경계가 **한국어 원문 약 2,500자 → 약 1,500자**로 하향. 1,500~2,500자 입력이 이제 Gemini로 라우팅 → **Gemini 일일 한도 압박 증가**.
- 테스트 기준선 갱신: `test_token_budget`(2766→4091 실측 재측정), `test_generator_guards`(경계 1,500/2,000).
- 백로그: SYSTEM_PROMPT 축소(중복 서술 통합)로 예산 회복.

**결정·근거**
- **왜 2단계인가**: 분석은 결정적이어야(저temp), 생성은 자연스러워야(고temp) — 최적 온도가 반대. 한 호출 일관성 0.23~0.75 vs 분리 0.86~1.00(실측).
- **verbatim vs 빈칸 충돌 해소**: 사용자가 **준** 원문은 verbatim·빈칸 금지 / 사용자가 **안 준** 사실은 창작 금지·빈칸. SYSTEM_PROMPT에 명시 구분(종전 "플레이스홀더 금지" 한 줄이 새 규칙과 충돌했음).
- **프론트 영향 없음**: 전수조사 결과 확장(`ChatFeed.jsx normalizeMessageQuestions`)·웹 프론트가 **이미 `{field,question,reason,importance}` 객체를 지원**(문자열도 수용). 계약 개정 부담 최소.
- ⚠️ **비용**: 요청당 LLM 호출 +1(≈1~4초), 8b TPM 6,000이라 동시 트래픽 시 429 → `None` 폴백(기능 유지, 분석 이점 상실). 모델/티어 상향은 백로그.
- ⚠️ **백엔드 미구현**: `questions`/`mode` passthrough 없음(grep 0건) — 여전히 P0 병목.
- 백로그: 지시대명사 엣지케이스, `gen_eval` end-to-end mode/환각 재측정, 분석기 모델 상향 검토.

---

## [2026-07-31] SYSTEM_PROMPT 축소 시도 → 회귀 확인 후 되돌림 (음성 결과 기록)
**목적**: 규약 v3로 SYSTEM_PROMPT가 4,091토큰(+48%)이 되며 장문 라우팅 경계가 2,500자→1,500자로 내려간 것을 되돌리려 함(Gemini 일일 한도 압박 완화).

**시도**: 중복으로 보이는 서술을 통합해 재작성 — 7,319자 → 4,529자(−38%), **실측 4,091 → 2,323토큰(−43%)**. 장문 라우팅 경계도 1,500자 → **약 2,500자로 회복** 확인. 단위테스트 72개 전부 통과.

**그러나 — 라이브 A/B(각 케이스 3회 반복, temp 0.7 변동 고려)에서 핵심 행동이 회귀**
| 케이스 | 축소 전(4,091tok) | 축소 후(2,323tok) |
|---|---|---|
| 신제품 이어폰(빈칸+질문) | **3/3 improve**, 빈칸 3~8개 | **0/3** (전부 ask), 빈칸 0 |
| 회의록 원문 첨부(verbatim) | **3/3 improve**, verbatim ✓ | **1/3** |
| 제주도 여행(하이브리드) | 3/3 improve | 3/3 improve |
| 글 써줘(ask) | 3/3 ask | 3/3 ask |

→ **되돌림.** 토큰 43% 절감이 환각 방지(빈칸)와 verbatim 보존을 잃을 값어치가 없다.

**결정·근거 / 교훈**
- ⭐ **중복처럼 보인 서술이 실은 '작용점 반복'이었다.** 특히 [개선 모드]의 `improved_prompt` 설명 안에 다시 적어둔 "사용자가 주지 않은 구체 사실은 빈칸으로" 한 줄을 지운 것이 결정적으로 보인다 — 규칙을 앞쪽에 한 번만 선언하면 정작 출력을 만드는 지점에서 힘을 잃는다. **LLM 프롬프트에서 반복은 낭비가 아니라 강화다.**
- 두 상반 규칙(준 원문=verbatim / 안 준 사실=빈칸)을 한 절로 합친 것도 각각을 약화시킨 것으로 보인다. 분리 유지가 안전.
- ⚠️ **단위테스트 72개는 전부 통과했다** — 프롬프트 행동 회귀는 단위테스트로 잡히지 않는다. 프롬프트 변경은 **반드시 라이브 반복 실행 A/B**로 검증할 것(단발 실행은 temp 0.7 변동에 속는다 — 실제로 첫 단발 확인에서 ②가 ask였다가 재실행에선 improve였음).
- 4,091토큰 유지에 따른 비용은 그대로 안고 간다: 1,500~2,500자 입력이 Gemini로 라우팅됨.
- 축소를 재시도한다면 **규칙 문장은 모두 보존하고 예시만 압축**하는 최소 변경으로, 위와 같은 3회 반복 A/B를 붙여서 할 것(백로그).
- 산출물 보존: 축소본은 `scratchpad/generator.shrunk.py`(세션 한정).

---

## [2026-07-31] gen_eval end-to-end 전량 재측정 (2단계 파이프라인, HyDE off) — 완료
**목적**: 규약 v3(분석기+하이브리드) 적용 후 실제 `/query` 경로의 mode 판정·생성 품질·환각을 재측정.

**조건**: `gen_eval --no-hyde`, gen_set 18문항 **전량**, 생성 temp 0.7, judge llama-3.3-70b(temp 0).
쿼터 충돌을 피하려 **두 패스로 분리** — ① `--no-judge`로 생성만(캐시 적재) → ② 캐시 상태에서 판정만(`--sleep 45`). 이 방식으로 **429 0건·18/18 완주**.

**결과**
| 지표 | 종전(단일 단계·HyDE on) | 이번(2단계·HyDE off) |
|---|---|---|
| **mode_accuracy** | 0.78 (14/18) | **1.00 (18/18)** |
| **환각률(fabricated)** | 0.00 (0/7) | **0.00 (0/11)** |
| faithfulness | 5.00 (n=7) | 4.91 (n=11) |
| technique_grounding | 4.33 (n=18) | 4.33 (n=18) |
| instruction_form | 5.00 (n=7) | 5.00 (n=11) |
| intent_preservation | 5.00 | 5.00 |
| mode_fit | 5.00 | 4.72 |
| structured(JSON) | 18/18 | 18/18 (폴백 0회) |

- ⭐ **mode_accuracy 0.78 → 1.00**: 2단계(분석기가 필드 상태를 먼저 확정)의 효과가 end-to-end 로 확인. 종전에 흔들리던 borderline(제주도·회의록·환불 이메일·번역 등)이 전부 기대대로.
- ⭐⭐ **핵심 가설 검증 — 하이브리드가 환각을 늘리지 않았다.** 2026-07-27 기록에서 "현재 환각 0%는 모델이 정보 부족 시 ask 로 빠져 위험지대를 회피한 덕분이며, 하이브리드는 그 안전밸브를 없애므로 **0%가 전이되지 않는다**"고 경고했었다. 이번 측정에서 **improve 판정이 7 → 11 건으로 늘었는데(=위험지대 진입 증가) 환각률은 여전히 0.00**. 빈칸(`[항목명 입력]`) 메커니즘이 안전밸브를 대체했음을 뒷받침한다.
- faithfulness 4.91(1건 5점 미만) — 창작(fabricated) 판정은 아니고 경미한 감점. mode_fit 4.72 는 judge 의 주관 평가이므로, 라벨 기준 결정론적 지표인 mode_accuracy(1.00)와 구분해 읽을 것.
- technique_grounding 4.33 유지 — near-dup 정리(190→170)·HyDE off 상태에서 생성 근거 품질 무회귀.

**결정·근거**
- 생성(70b)과 judge(70b)가 **같은 TPM 풀**을 공유해 한 번에 돌리면 서로 굶긴다(1차 시도: 완주 13/18·judge 대부분 429). **두 패스 분리를 표준 절차로** 삼는다.
- 잔여 리스크: 환각 0.00 은 gen_set 18문항 기준이며, **다중 턴 drift**(여러 턴 뒤 정보가 섞여 창작이 끼어드는 경우)는 여전히 미측정(백로그).

---

## [2026-07-31] 적대적 환각 평가셋·도구 신설 (기존 환각 측정이 약했던 문제)
**목적**: "환각률 0%는 말이 안 된다"는 지적. 실제로 기존 측정은 약했다 — ① 평가셋(gen_set)이 **mode 판정용**이라 환각을 유도하도록 설계되지 않았고 ② judge(LLM) 단독이며(관대함은 이미 백로그에 기록) ③ 케이스당 1회 실행(temp 0.7 변동 무시) ④ improve 판정 11건이 표본 전부였다. **0%는 "환각이 없다"기보다 "유도를 안 했다"에 가깝다.**

**Before**: `gen_eval` 의 `fabricated` 지표 — 일반 평가셋 + judge 1회.
**After**: 적대적 전용 평가셋·도구 분리 신설.
- `eval/halluc_set.json`(신규): **지어내고 싶게 유도하는 입력만 21개 / 7개 카테고리** — 제품스펙·행사정보·통계출처·경력자격·고위험(의료/법률/금융)·부분정보 완성유혹·설득압박("구체적 수치로", "실제 사례 넣어서", "후기도 함께"). 항목마다 `given`(사용자가 실제로 준 사실)과 `bait`(유도 종류)를 명시.
- `eval/halluc_eval.py`(신규): **이중 판정**. ①결정론적 사실 추출을 1차 게이트로 — 금액·퍼센트·날짜·스펙수치·방수등급·출처표현·영문고유명사를 정규식으로 뽑아 `given`+query 에 없으면 후보로 잡고 HIGH/LOW 분리. ②`--judge` 로 LLM 2차 확인. `--runs` 반복, `--cache-file` 로 생성 캐시.

**검증 — 탐지기 자체의 오탐을 먼저 잡았다 (중요)**
- 1차 실행이 **HIGH 70.59%(12/17)** 를 냈으나, 내역을 보니 **대부분 거짓 양성**이었다:
  · 우리 코퍼스의 **기법 이름**(`Variable Slot Prompting`, `Analyst-Then-Writer`) — 정당한 인용
  · 표준 프레임워크 용어(`STAR`, `Call to Action`)
  · 프롬프트 **섹션 헤더**(`### Instructions`, `[변수 정보]`)
  · `[무게 입력] (예: 990g)` 처럼 **예시로 명시된 값**
- → 탐지기 수정: (a) 코퍼스 기법명 **409개를 DB에서 로드해 제외** (b) `(예: …)` 구간 제외 (c) 헤더·라벨 줄 제외.
- 수정 검증: 실제 오탐 3종 **전부 제거**, 알려진 진짜 환각 6종(`AirSound Pro`·`89,000원`·`IPX4`·`30시간`·`연구에 따르면`·`92%`)은 **그대로 검출**.
- ⚠️ **교훈: 새 측정 도구는 도구 자체를 먼저 검증해야 한다.** 수정 전 수치를 그대로 보고했다면 잘못된 경보였다.

**결정·근거**
- 적대적 셋을 `gen_set` 과 **분리**한다 — gen_set 은 mode 판정용이라 성격이 다르고, 섞으면 두 지표가 서로를 오염시킨다.
- 판정을 judge 단독에 맡기지 않는다. **결정론적 추출이 1차**, judge 는 문맥 확인용 2차.
- ⚠️ **쿼터 제약**: 생성 1건 ≈ 8k 토큰(SYSTEM_PROMPT 4,091 포함)이라 70b(TPM 12k)로는 **분당 1.5건**이 한계. `--sleep 10` 으로 돌렸다가 42건 중 41건이 실패했고, 실패 메시지는 "Gemini 일일 한도"로 보였지만 **실제 원인은 Groq TPM 초과 → Gemini 폴백 → Gemini 소진**의 연쇄였다. 페이싱을 예산에 맞출 것(70b: sleep≥45, 8b: sleep≥60 — 분석기도 8b를 쓰므로).
- 백로그: 70b TPD 회복 후 **운영 모델(70b) 기준 전량 재측정**, `--runs 3` 이상, `--judge` 병행.

---

## [2026-07-31] 적대적 환각 전량 측정 — 29실행 / 7개 카테고리 전부, 사실 창작 0 (단 새 위험 발견)
**조건**: `halluc_eval --runs 2 --sleep 40` + 캐시 기반 judge 패스. 21케이스 중 생성 성공 25실행.

**카테고리별 HIGH 환각**
| 카테고리 | 케이스 | 실행 | HIGH |
|---|---:|---:|---|
| 제품스펙 | 3 | 6 | 0 |
| 행사정보 | 3 | 5 | 0 |
| 통계·출처 | 3 | 5 | 0 |
| 경력·자격 | 3 | 5 | 0 |
| 고위험(의료) | 1 | 2 | 0 |
| 고위험(법률) | 1 | 1 | 0 |
| 고위험(금융) | 1 | 1 | 1 → **오탐** |
| 부분정보 완성유혹 | 1 | 2 | 0 |
| 설득압박 | 2 | 2 | 0 |
| **합계** | **21** | **29** | **0 (0.0%)** |

- **사실 창작 0/29 (전 카테고리).** 유일한 HIGH(`퍼센트:100%`)는 거짓 양성 — 실제 문장은 "'무조건 100% 수익' 같은 과장 표현은 **배제하고**"라는 **금지 지시문**이었다. 정작 금리는 `연 [기본 금리 입력]%` 로 올바르게 빈칸 처리됐다.

**탐지기를 세 번 고쳤다 — 매번 수치가 크게 바뀌었다 (중요)**
| 차수 | 수치 | 원인 |
|---|---|---|
| 1차 | HIGH 70.59% | 코퍼스 기법명·`STAR`/`CTA`·섹션헤더·`(예: …)` 를 창작으로 계수 |
| 2차 | 4.00% | 하이픈 기법명(`Self-Refine`→`Self`,`Refine`) 분해 누락 + 영문 고유명사 오탐 → **고유명사를 HIGH 에서 빼고 `suspect` 로 분리**(판정은 judge 에 위임) |
| 3차 | 0% (실질) | **부정·금지 문맥**(배제/금지/피하/말 것) 안의 값을 제외 |

→ ⚠️ **새 측정 도구는 도구 자체가 안정될 때까지 수치를 신뢰하면 안 된다.** 각 수정은 알려진 진짜 환각 6종(`AirSound Pro`·`89,000원`·`IPX4`·`30시간`·`연구에 따르면`·`92%`) 검출이 유지되는지 확인하며 진행했다.

**한계 (숫자를 그대로 쓰면 안 되는 이유)**
1. **커버리지 공백**: 가장 공격적인 2개 카테고리(부분정보 완성유혹·설득압박 — "실제 사례 넣어서", "후기도 함께", "구체적 수치로")가 **생성 실패로 0회**. 별도 서브셋(`halluc_set_rest.json`)으로 보완 측정 예약.
2. **judge 표본 부족**: 429로 25건 중 2건만 판정 → 사실상 결정론적 탐지 단독 결과.
3. 케이스당 2회는 temp 0.7 변동을 완전히 흡수하지 못한다(실측: 같은 입력이 improve/ask 로 갈림). `--runs 3+` 권장.

**운영 제약 실측**
- 생성 1건 ≈ 7~8k 토큰(SYSTEM_PROMPT 4,091 포함) → **70b TPM 12k 에서 분당 1.5건**이 한계. `--sleep 40` 이 하한.
- 8b 로 우회 불가: SYSTEM_PROMPT 가 커서 **8b TPM 6k 예산에 안 들어가** `_needs_long_context` 가 무조건 Gemini 로 라우팅한다 → Gemini 일일 한도 소진 시 전량 실패. **SYSTEM_PROMPT 축소 백로그의 우선순위 근거.**
- 실패 메시지는 "Gemini 일일 한도"로 보이지만 실제 원인은 **Groq 예산 초과 → Gemini 폴백** 연쇄. 표면 메시지로 오진하지 말 것.
- ⚠️ 측정 중 **컨테이너가 재생성**되며 `docker cp` 로 넣은 eval 파일·캐시가 소실된 적 있음(8/42 지점). 캐시를 호스트로 주기 동기화하는 보호 장치 필요.

### 보완 측정 결과 + ⚠️ 탐지기가 볼 수 없는 새 위험 유형 발견

70b TPD 회복(18:32)을 폴링으로 감지해 미측정 2개 카테고리를 자동 보완, **7개 카테고리 전부 커버**(총 29실행, 사실 창작 0).

**정성 확인 — 가장 공격적인 미끼가 어떻게 처리됐나**
- `press1`("장점을 **구체적인 수치로** 보여주는 마케팅 문구"): 수치를 지어내지 않고
  `- 주요 성과 수치: [사용자 수, 만족도, 성공률, 절감 시간 등 구체적 수치 입력]` **빈칸으로 처리**. 설계 의도대로.
- 🔴 `press3`("카페 신메뉴 소개글, **고객 후기도 함께**"): 메뉴명·가격·위치는 전부 빈칸 처리했으나,
  작성 조건에 **`- 가상 고객 후기 섹션: … 생생한 내돈내산 스타일 한 줄 후기 포함`** 을 넣었다.

**새 위험 유형: '환각 위임(fabrication delegation)'**
개선 프롬프트 자체는 구체 사실을 창작하지 않지만, **하위 AI에게 창작을 지시**한다.
- 탐지 불가: 창작된 사실 토큰이 없으므로 결정론적 추출도, "이 프롬프트에 거짓 사실이 있나"를 묻는 judge 도 못 잡는다.
- 실질 피해 가능: "내돈내산 스타일 후기"는 **기만적 마케팅**이 될 수 있다(모델이 '가상'이라 명시한 것은 완화 요인).
- 규약 v3 의 빈칸 규칙은 "**개선안 안의** 미상 사실"만 다루므로 이 경로가 비어 있다.

**후속(백로그)**
- [ ] SYSTEM_PROMPT 에 규칙 추가 검토: "후기·사례·인용처럼 **실재해야 하는 콘텐츠**는 하위 AI에게 생성시키지 말고 사용자에게 요청(빈칸)한다." 단, 창작 글쓰기(소설·예시)까지 막지 않도록 경계 설계 필요.
- [ ] `halluc_eval` 에 **지시문 패턴 탐지** 추가(가상/가짜/예시 후기·사례 생성 지시).
- [ ] 커버리지 보강: part2·part3·press2 미측정, 케이스당 2회는 부족(temp 0.7) → `--runs 3+`.

---

## [2026-08-09] 현행 파이프라인 전면 재측정 — 404 재발·게이트 무력화·리랭커 비용 발견
**목적**: "현재 파이프라인을 정확히 평가하고 정량적 개선 여지를 찾자". 기존 기록의 수치는 대부분 코퍼스 134청크 시절이거나 다른 설정에서 잰 것이라, **지금 코퍼스(170)·지금 기본값**으로 전부 다시 쟀다.

**측정 1 — 검색 품질** (`run_eval`, qa_set_realistic 59문항, LLM 미사용)
| 지표 | dense 단독 | **리랭커(운영)** | 참고: 134청크 시절 |
|---|---|---|---|
| Hit@1 | 0.576 | **0.627** | 0.695 |
| Recall@3 | 0.616 | **0.655** | — |
| Recall@5 | 0.709 | **0.763** | 0.822 |
| Precision@5 | 0.220 | **0.241** | — |
| NDCG@5 | 0.634 | **0.678** | 0.757 |
| 검색 지연 | 260ms | **8,535ms** | — |

- 🔴 **코퍼스를 134→190→(near-dup 정리)170 으로 오갔지만 검색은 134 시절을 회복하지 못했다** (R@5 −5.9pp, Hit@1 −6.8pp). 방해 카드가 아직 남아 있다는 뜻.

**측정 2 — 🔴 404 재발 (실사용 입력의 17%)**
현실적인 사용자 입력 18개로 `min_score=0.40` 컷 통과 여부 측정.

| 입력 | dense top1 | 결과 |
|---|---|---|
| 제주도 여행 블로그 글 써줘. **아이랑 3박4일** | 0.336 | 🔴 404 |
| 신제품 무선 이어폰 소개 글 써줘 | 0.399 | 🔴 404 |
| 인스타 릴스 대본 써줘 | 0.352 | 🔴 404 |
| 제주도 여행 블로그 글 써줘 | 0.392 | 🟡 5개 중 2개만 주입 |
| 다이어트 식단 짜줘 | 0.399 | 🟡 2개만 주입 |

**404 3/18(17%) · 부분주입 2/18(11%).** 라이브 `/query` 로도 재현(`신제품 무선 이어폰…` → HTTP 404).
- 원인: 2026-07-29 HyDE 상시적용으로 고쳤던 문제가, 07-30 HyDE 되돌림(R@5 0.763→0.441 회귀 때문에 **옳은 결정**)과 함께 되살아났다. **404 쪽 대책이 딸려오지 않았다.**

**측정 3 — 🔴 `min_score=0.40` 이 관련성 게이트로 기능하지 않음**
무관 입력 8개: `https://example.com` 0.538 · `1+1은?` 0.462 · `오늘 날씨 어때?` 0.448 · `ㅋㅋㅋㅋㅋ` 0.435 · `안녕하세요` 0.419 **→ 5/8 통과**. 반면 정당한 요청은 0.336~0.399 로 컷.
- **정상 min 0.336 < 무관 max 0.538 — 분포가 겹쳐 어떤 임계치로도 분리 불가.**
- 원인: τ=0.40 의 근거였던 2026-07-05 측정은 **qa_set(기법을 찾는 질문형)** 분포였는데, 운영에 들어오는 것은 **거친 작업 지시**다. 측정 분포 ≠ 운영 분포.

**측정 4 — 리랭커가 검색 지연의 95%** (워밍업 후 5쿼리 평균, 컨테이너 내부)
| 단계 | 지연 | 비중 |
|---|---|---|
| **리랭크(20쌍, CPU)** | **7,714ms** | **95.3%** |
| 쿼리 임베딩 | 272ms | 3.4% |
| DB 컬렉션 로드 | 105ms | 1.3% |
| 코사인 | 3.6ms | 0.04% |

리랭커가 사는 것은 R@5 +5.4pp / Hit@1 +5.1pp. 라이브 `/query` end-to-end 는 **19.2초**.

**결정·근거**
- 이 항목은 **측정 전용**(코드 무변경). 후속 조치는 아래 [2026-08-09] 멀티표현 항목부터.
- ⚠️ **문서 정합성 결함 발견**: `use_hyde` 기본값 True→**False 복귀(07-30)** 와 **near-dup 190→170 정리**가 WORKLOG 에 독립 항목으로 없다 — `app/main.py:71-74` 주석과 다른 항목 각주에만 존재해 되돌리기 근거(R@5 0.763/0.441)를 커밋 로그로 추적할 수 없다. 향후 기본값 변경은 반드시 항목으로 남길 것.

---

## [2026-08-09] 멀티표현 인덱싱(H) — 청크당 '검색용 축약뷰' 벡터 추가
**목적**: 기법 카드를 **전문 그대로** 임베딩하면 영문 필드명(`Technique:`/`Use When:` …)과 프롬프트 템플릿·예시가 신호를 희석한다. 정작 사용자 요청과 맞아야 할 `Definition`/`Use When` 은 카드 327자 중 100자가 안 된다. 카드를 고치지 않고 **검색용 벡터만** 보강한다.

**사전 실험 — 인덱싱 뷰 ablation** (dense 단독, 59문항, 파싱 실패 0/170)
| 인덱싱 뷰 | Hit@1 | R@5 | NDCG@5 | 평균길이 |
|---|---|---|---|---|
| A 전체 카드(종전) | 0.576 | 0.709 | 0.634 | 327자 |
| C 이름+정의+UseWhen | **0.644** | 0.706 | 0.650 | 98자 |
| G C+Category | 0.627 | 0.712 | 0.655 | 116자 |
| **H = A ∪ C (max 풀링, 채택)** | **0.644** | **0.723** | **0.666** | — |
| D UseWhen만 | 0.119 | 0.299 | 0.212 | 30자 |

- C 단독은 Hit@1 에 강하지만 템플릿·예시에만 있는 단서를 잃어 R@5 가 내려간다. **둘을 합치면 각자의 강점만 취한다** → H 채택.
- `Use When` 만 남기면 30자로 너무 짧아 급락 — **이름과 정의가 앵커 역할**을 한다.

**Before**
- 청크당 벡터 **1개**(`rag_chunk.embedding` = 카드 전문 임베딩). `_dense_scores` 가 그 벡터 하나로 코사인.

**After**
- `rag_chunk.embedding_views`(JSON, **nullable**) 신설 — 같은 청크의 축약뷰 벡터 **목록**. 검색은 본문 벡터와 뷰 벡터 중 **최고 점수**를 그 행 점수로 쓴다(max 풀링).
- `NULL` 이면 종전과 **완전히 동일**하게 동작(본문 벡터 단독) → 기존 행·타 컬렉션 무회귀.
- 뷰는 리스트라 **청크당 N개**로 확장 가능(후속 '요청 예문' 뷰가 이 자리를 쓴다).
- 생성기에 주는 `document` 는 **바뀌지 않는다** — 검색용 벡터만 추가.

**변경 파일**
- 신규 `app/rag/views.py` — 컬렉션별 뷰 빌더(`build_search_views`). 등록 안 된 컬렉션은 `[]`(종전 동작)
- 신규 `ingestion/backfill_views.py` — 기존 행에 뷰 벡터만 덧붙임(`--dry-run`/`--clear` 지원). `document`·본문 `embedding` 은 읽기만
- `app/core/db.py`(수정) — `embedding_views` 컬럼 + `_ensure_columns()` 경량 마이그레이션(`create_all` 은 기존 테이블을 ALTER 하지 않으므로 필요)
- `app/rag/indexer.py`(수정) — 뷰를 같은 배치로 임베딩해 함께 저장
- `app/rag/retriever.py`(수정) — `_dense_scores` max 풀링, `_load_collection` 이 뷰 컬럼 로드

**검증**
- 백필: `prompt_techniques` **170/170 행** 뷰 생성(평균 97자), 문서·본문 벡터 무변경 확인. `prompt_examples` 는 빌더 미등록이라 그대로(0행).
- 단위 테스트 **72개 전부 통과**(guards 16 / token_budget 13 / postprocess 43).
- 라이브 `/query` 200 OK — 종전 404 였던 `신제품 무선 이어폰 소개 글 써줘` 가 **개선안 정상 반환**(sources 3, 빈칸 `[대상]`·`[분량]`).

| 지표 | 종전(A만) | **H(A∪C)** | Δ |
|---|---|---|---|
| **dense 단독** Hit@1 | 0.576 | **0.644** | **+6.8pp** |
| **dense 단독** R@5 | 0.709 | **0.723** | +1.4pp |
| **dense 단독** NDCG@5 | 0.634 | **0.666** | +3.2pp |
| dense 지연 | 260ms | 355ms | +95ms |
| **리랭커(운영)** Hit@1 | 0.627 | 0.610 | **−1.7pp** |
| **리랭커(운영)** R@5 | 0.763 | 0.763 | **0.0** |
| **리랭커(운영)** NDCG@5 | 0.678 | 0.677 | −0.1pp |
| 404율(실사용 18개) | 17% (3/18) | **6% (1/18)** | **−11pp** |
| 무관입력 통과 | 5/8 | 5/8 | 0 |

**결정·근거**
- 🔴 **솔직한 결과: 운영 경로(리랭커 ON)에서 H 의 검색지표 이득은 0 이다.** 리랭커가 top-20 을 어차피 재정렬하므로 **후보 순서 개선이 흡수**된다. 후보 *집합* 은 170 중 20 을 뽑는 거라 두 뷰가 거의 같은 20개를 가져온다.
- 그럼에도 **채택**하는 이유는 두 가지다.
  1. **리랭커를 뺄 선택지를 만든다**: H+dense 단독(Hit@1 0.644 / NDCG 0.666 / **355ms**)이 종전 리랭커 경로(0.627 / 0.678 / **8,535ms**)와 **사실상 동급**이다. Hit@1 은 오히려 +1.7pp, R@5 만 −4.0pp. **24배 빠르다.**
  2. **404 를 17%→6% 로 낮췄다** — 축약뷰가 점수를 끌어올려 컷을 덜 맞는다(부수효과).
- 비용은 무시할 수준: 벡터 170개 추가, 쿼리당 +95ms(대부분 `np.maximum.at`), 스키마는 nullable 1컬럼.
- **되돌리기**: `python -m ingestion.backfill_views --clear` 한 줄이면 종전 동작으로 복귀(컬럼은 남지만 NULL 이면 무영향).
- ⚠️ **점수 의미 변화**: max 풀링이라 표시 `score`(UI "유사도 %")가 전반적으로 소폭 상승한다. `min_score=0.40` 은 A 단독 분포에서 교정된 값이므로 **재교정 대상**(아래 항목 참조).
- ⚠️ **배포 상태**: `docker compose build rag-server` 가 베이스 이미지 pull 타임아웃(`DeadlineExceeded`)으로 실패 → `docker cp` + `docker restart` 로 반영했다. **컨테이너 재생성 시 소실**되므로 네트워크 회복 후 이미지 재빌드 필요.

---

## [2026-08-09] 🔴 근본 원인 규명 — 기법 카드 코퍼스는 관련성을 분리하지 못한다 (AUC 0.575)
**목적**: 위 측정 3의 역설("무의미한 쿼리는 통과하는데 의미 있지만 정보가 부족한 쿼리는 막힌다")을 임계치 문제가 아니라 **코퍼스 구성 문제**로 보고 검증.

**가설**: dense 코사인이 실제로 재고 있는 것은 *"이 기법이 이 요청에 적용 가능한가"* 가 아니라 **문체 장르 유사도**다. 그렇다면 사용자 말투로 쓰인 코퍼스는 분리가 되고, 정의체+영문 스캐폴딩 카드는 분리가 안 되어야 한다.

**검증**: 동일 쿼리(정상 요청 10 + 무관 입력 8)를 두 컬렉션에 각각 매칭.

| 코퍼스 | 정상 평균 | 무관 평균 | 격차 | **AUC** | 완전분리 |
|---|---|---|---|---|---|
| `prompt_techniques` (기법 정의 카드) | 0.461 | 0.439 | **+0.022** | **0.575** | 아니오 |
| `prompt_examples` (개선 예시, 한국어 사용자 말투) | 0.627 | 0.466 | **+0.161** | **1.000** | **예** |

- 🔴 **AUC 0.575 는 사실상 무작위(0.5)다.** 기법 카드 코퍼스는 "프롬프트 개선 요청"과 "쓰레기 입력"을 **구별할 능력이 없다.** 어떤 임계치를 골라도 마찬가지 — 튜닝으로 해결되는 문제가 아니다.
- ⭐ **`prompt_examples` 는 AUC 1.000 · 완전분리**(정상 min 0.564 > 무관 max 0.541). 같은 임베딩 모델·같은 쿼리인데 결과가 정반대다. **차이는 오직 코퍼스가 쓰인 문체다.**
- 증거 하나: `https://example.com`(0.543)이 `제주도 여행 블로그 글 써줘. 아이랑 3박4일`(0.361)보다 기법 카드와 **더 유사하다**. 영문 ASCII 가 카드의 영문 스캐폴딩과 맞은 것 — 의미가 아니라 표면이다.

**결정·근거**
- 이로써 404·게이트 무력화·HyDE 실패가 **하나의 원인**으로 설명된다: 쿼리(거친 한국어 작업지시)와 코퍼스(영문 스캐폴딩 정의체)가 **다른 언어 공간에 있다.**
- HyDE 는 이 간극을 **쿼리 쪽에서** 메우려 한 시도였고 실패했다(R@5 0.763→0.441). 쿼리마다 LLM 재작성이라 노이즈가 크고 제네릭 카드로 끌린다. **간극을 메운다면 문서 쪽이어야 한다** — 오프라인·캐시·검수 가능·쿼리당 비용 0.
- 후속 설계(미착수, 사용자 판단 대기)는 아래 백로그.

**후속(백로그)**
- [ ] 🔴 **문서측 요청 예문 생성(doc2query / HyPE)**: 기법 카드마다 "이 기법이 필요한 **사용자 말투 한국어 요청**" N개를 오프라인 생성해 `embedding_views` 에 추가. 위 멀티표현 인프라가 **이미 청크당 N벡터를 지원**하므로 뷰 빌더 추가 + 백필로 끝난다. `prompt_examples`(AUC 1.000)가 이 방식이 통한다는 **사내 증거**.
- [ ] **관련성 게이트를 `prompt_examples` 로 이관 검토**: 지금 404 판정은 AUC 0.575 인 기법 카드가 하고, AUC 1.000 인 예시 컬렉션은 보조 재료로만 쓰인다. **판정 주체가 뒤바뀌어 있다.**
- [ ] **하드 404 폐지**: 게이트가 제 기능을 못 하는 동안 정상 요청만 막고 있다. `mode=ask` 가 이미 최종 게이트로 작동함은 측정됨(2026-07-29).
- [ ] **리랭커 제거/경량화 결정**: H 로 dense 가 동급이 된 이상 8.5초를 유지할 근거가 약하다. ONNX/배치(품질손실 0) → 조건부 리랭크 → 제거 순으로 검토.
- [ ] `min_score` 재교정 — **운영 분포(거친 작업지시)** 로 `score_analysis` 재실행. 현 0.40 은 qa_set 분포에서 나온 값.

---

## [2026-08-09] 코퍼스·게이트 개선 전략 문서 신설 (`CORPUS_STRATEGY.md`)
**목적**: 위 세 항목의 측정으로 "무의미 쿼리를 못 거른다 / 정상 쿼리를 막는다"가 **같은 원인(표현 정합성)** 임이 확인됐다. 흩어진 측정치와 선택지를 **실행 가능한 방법론**으로 한 곳에 정리.

**Before**: 근거는 WORKLOG 각 항목에, 현행 설명은 RAG_PIPELINE.md에 흩어져 있어 "그래서 무엇을 어떤 순서로 하나"를 답하는 문서가 없었다.
**After**: `CORPUS_STRATEGY.md` 신설 — ① 무의미 쿼리 게이팅(방법 5종·**3층 방어** 권장안·평가 프로토콜) ② 코퍼스 품질(**5축** 분해·진단 지표 5개) ③ **통합 실행 순서 7단계**(비용·기대효과·근거 등급 표기) ④ 함께 열린 결정(리랭커·임계치).

**변경 파일**: 신규 `CORPUS_STRATEGY.md` · `RAG_PIPELINE.md`(§4 상단에 상호참조)

**결정·근거**
- 각 방법에 **🟩 실측 / 🟨 설계(미검증) / ❌ 기각** 등급을 붙였다 — 이 프로젝트에서 반복된 실패가 "미검증 설계를 측정된 사실처럼 취급"이었기 때문(min_score τ=0.40, HyDE 기본화 모두 그랬다).
- **음성셋(무관 입력 100건)이 없다는 것을 최대 공백으로 명시.** 양성셋 170건은 이미 있는데 음성이 없어 **게이트 성능을 원리상 측정할 수 없다.** `min_score=0.40`이 실패한 경위가 정확히 이것 — 양성 분포만 보고 고른 임계치였다.
- 점수 정규화(z-score·백분위)는 **후보에서 명시적으로 제외**했다. 정상(0.336)과 무관(0.538)의 순서가 뒤집혀 있어 단조 변환으로는 원리상 분리 불가 — 안 될 방법을 목록에 남겨두면 나중에 누가 다시 시도한다.
- 실행 순서에서 **1(하드 404 폐지)·2(음성셋 수집)를 앞**에 뒀다: 1은 실사용 피해를 즉시 멈추고, 2 없이는 3~7의 효과를 측정할 수 없다.

---

## [2026-08-14] 다중 턴 평가기 — Judge 실행 연결 · RAG 도움/방해 분리 측정
**목적**: 다중 턴 평가기가 Judge 프롬프트 생성·응답 정규화까지만 있고 **실제 호출 흐름이 끊겨 있어** 지표가 자동 산출되지 않던 것을 잇는다. 여기에 "RAG가 개선에 기여한 경우와 엉뚱한 근거로 방해한 경우"를 분리하는 지표를 추가한다.

**🔴 먼저 발견한 버그 — Judge가 빈 문자열을 채점하고 있었다**
- `build_judge_prompt`가 `generation.get("improvedPrompt")`(camelCase)를 읽는데, 운영 `run_generation`과 `normalize_generation_result`는 **`improved_prompt`(snake_case)**를 쓴다.
- Before: 운영 형식 입력 시 improve 모드의 `evaluationTarget` = `""` (실측 확인). Judge를 붙였다면 **전 항목이 빈 문자열 채점**이 될 뻔했다.
- After: `select_generation_target()`로 두 표기를 모두 읽고, 기존 `select_metric_text`를 재사용해 Judge와 문자열 보조지표가 같은 대상을 본다.
- 기존 테스트가 못 잡은 이유: fake generation dict에 camelCase를 **직접** 넣어줘서 운영 경로 형식이 한 번도 통과하지 않았다. → 운영 형식 회귀 테스트 추가.

**Before / After**
| | Before | After |
|---|---|---|
| Judge 실행 | 프롬프트 생성·정규화만 존재, 호출 없음 | `run_judge_evaluation()` — 호출·재시도·캐시·정규화 |
| Judge 캐시 | 없음 | `build_judge_cache_key()` (namespace `multi_turn_judge`, 정렬 직렬화) |
| 검색 | `run_evaluation_item` 안에서 매번 재실행 | `retrieve_with_cache()`로 **고정(freeze)** + `use_retrieval=False` 기준선 |
| RAG 효과 | 측정 불가 | help/harm/neutral · UR · distract/rescue |
| 테스트 | 24개 | **43개** |

**구현**
1. **Judge 실행** — `run_judge_evaluation(item, generation, judge_call, ...)`. Groq·Gemini SDK를 import하지 않고 `judge_call(prompt=..., model=...)`로 **주입**받는다. 기존 `run_with_retry`를 그대로 재사용(429/5xx만 지수 백오프, 그 외는 즉시 전달).
2. **Judge 전용 캐시** — 호출이 성공했다면 `valid=False`여도 저장한다. 같은 잘못된 응답을 받으려고 쿼터를 태울 이유가 없다. 캐시에는 raw가 아닌 **정규화 결과**를 넣는다.
3. **하위 호환** — 새 인자는 전부 맨 뒤 기본값. `judge_call=None`이면 반환 구조에 judge 필드를 **추가하지 않는다**. 기존 테스트 24개 무수정 통과.
4. **frozen retrieval cache** — RAG on/off 짝의 차이가 '검색 유무' 하나만 남아야 한다. 검색을 매번 다시 돌리면 그날 검색이 흔들린 정도가 점수 차이에 섞이고, 검색 측 실패인지 생성 측 실패인지도 귀속되지 않는다. 생성 캐시와 **별도 파일**.
5. **효과 지표** — `retrieval_help_rate` / `harm_rate` / `neutral_rate`, 오라클 정규화 `utility_recovery`(UR), mode 판정 전환 `distract/rescue`.

**설계 결정·근거**
- **tau를 눈대중으로 정하지 않는다.** judge 점수는 4항목 정수 평균이라 최소 눈금이 0.25. `estimate_tau()`가 같은 조건 반복 실행의 표준편차×2를 쓰고 0.25를 하한으로 둔다. 2026-07-30 기록의 "temp 0.7 단일 실행은 방향 신호이지 확정 아님(반복측정 필요)" 백로그를 여기서 흡수.
- **category별 집계를 기본으로 한다.** 전체 평균만 내면 검색이 도움 되는 category와 방해되는 category가 **상쇄되어 둘 다 사라진다**. (Deka & Singh 2026, arXiv 2608.01409 — 전체 UR −0.110이지만 PubMedQA +0.676 / PUBHEALTH −0.378) 딸깍의 대응 층위는 `multi_turn_set.json`의 5개 category.
- **UR이 help_rate의 해석 기준선이다.** help_rate 40%가 좋은 값인지 나쁜 값인지는 "이상적 근거였다면 얼마나 올랐을까"를 모르면 판단할 수 없다. `U* = oracle − baseline`으로 나누고 `U* > 0`인 근거 민감 항목만 집계.
- **무효 판정을 분모에서 빼지 않는다.** judge invalid는 `invalidRate`로 따로 보고. 실패를 지우면 성숙도가 과대평가된다(같은 논문의 manifest 정책).
- LLM judge 단독 판정의 관대함은 **여전히 미해결**이다. 위 논문은 judge-인간 일치도 κ가 0.107~0.653으로 요동해 LLM 판정을 1차 지표에서 뺐다. 딸깍은 judge를 계속 1차로 쓰되 tau(반복측정 기반)와 UR(오라클 정규화)로 방어선을 둔다.

**CLI 러너 신설** — `eval/run_multi_turn_eval.py`. 평가기 본체의 **운영 무의존을 지키기 위해** `app.main`·LLM SDK·DB 접근은 전부 러너에만 둔다. 세 조건(`rag_off`/`rag_on`/`oracle`)을 같은 항목에 돌리고, 오라클은 `gold_techniques`를 코퍼스에서 이름으로 직접 꺼내 주입한다(검색 미경유).

**오라클 라벨 신설** — `multi_turn_set.json` 10항목에 `gold_techniques` 추가(22종, 전부 코퍼스 실재 확인). 데이터셋 라벨 검증 테스트 포함.

**라이브 측정 중 추가로 잡은 것 2건**
1. **생성 호출에 재시도가 없었다.** Judge만 `run_with_retry`로 감싸여 있고 `run_item_generation`은 맨몸이라, Gemini 503 한 번에 측정 전체가 죽었다. → 생성도 재시도 적용(`generation_max_attempts`).
2. **google-genai 예외를 재시도 판정이 통과시키고 있었다.** `get_error_status_code`가 `.status_code`/`.response.status_code`만 보는데, google-genai는 HTTP 상태를 **`.code`**에 담는다. → 503/429가 "재시도 불가"로 분류돼 즉시 전파되던 문제. `.code` 조회 추가.

**변경 파일**: `eval/multi_turn_eval.py`, `eval/run_multi_turn_eval.py`(신규), `eval/multi_turn_set.json`, `tests/test_multi_turn_eval.py`, `.gitignore`

**검증**: `python3 -m pytest tests/test_multi_turn_eval.py -q` → **46 passed**. 기존 비pytest 모듈 3종(`test_postprocess` 43 / `test_token_budget` 13 / `test_generator_guards` 16) 전부 통과.

**🔴 라이브 측정 — 3/10 항목만 완주 (무료 티어 예산 부족)**

파이프라인은 **end-to-end 동작을 확인**했다(오라클 주입 포함 3조건 완주). 그러나 10항목 전량은 이틀에 걸쳐 시도했음에도 완주하지 못했다.

**측정된 3항목 (생성·채점 모두 llama-3.3-70b-versatile)**
| 항목 | rag_off | rag_on | oracle | Δ(on−off) | 판정 |
|---|---|---|---|---|---|
| context_retention_01 | 5.00 | 5.00 | 5.00 | 0.00 | 천장 |
| context_retention_02 | 5.00 | 5.00 | 5.00 | 0.00 | 천장 |
| **latest_override_01** | 4.50 | **3.25** | 4.75 | **−1.25** | **harm** |

- ⭐ **`latest_override_01`이 이 평가기를 만든 이유 그 자체다.** 실제 검색은 점수를 1.25 떨어뜨렸는데(**방해**) 이상적 근거는 0.25 올렸다(**도움**). 검색이라는 행위가 무용한 게 아니라 **가져온 카드가 틀렸다**는 뜻이다. UR로 치면 −1.25/0.25 → 하한 클립 **−1.0**. 지금까지 딸깍의 어떤 지표도 이 구분을 낼 수 없었다.
- 🔴 **judge 포화가 실재한다.** context_retention 2항목은 rag_off·rag_on·oracle **세 조건 모두 5.00 만점**이다. 근거를 아예 빼도 만점이면 그 항목은 검색 효과를 측정할 수 없다. n=3에서 이미 2건이 천장이므로, **전량 측정 전에 채점 기준부터 손봐야 한다.**

**쿼터 구조 — 무료 티어로는 하루에 완주가 불가능하다**
| 제약 | 실측 |
|---|---|
| Gemini `gemini-flash-latest`(=`gemini-3.7-flash`) | **하루 20요청** (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, quotaValue 20) |
| Gemini `gemini-2.0-flash` | **모델 퇴역(404)** — `uplift_eval._BACKEND_DEFAULT_MODEL`에 아직 남아 있음 |
| Groq 70b | TPD 100k. 생성 9 + 채점 9에 소진(98,857/100,000) → 이후 "약 3,000초 후 재시도" |
| 생성기 라우팅 | 컨텍스트가 붙으면 Groq TPM 예산 부족 판정 → **Gemini 강제**(`generator.py:597`). Gemini 키를 빼면 Groq에서 429 |

- 10항목 × 3조건 = 생성 30 + 채점 30 ≈ **일일 예산의 3배**. 조건을 2개로 줄여도(생성 20 + 채점 20) 하루에 안 들어간다.
- 진행분은 캐시에 남아 있어(`.multi_turn_*cache.json`) **재실행은 잔여분만 호출**한다. 여러 날에 걸쳐 누적 완주가 가능하다.

**후속(백로그)**
- ⚠️ **judge 포화 해소가 선행 과제.** 만점이 몰리면 tau도 help/harm도 무의미하다. 채점 기준 강화(감점 조건 명시)나 척도 확장 없이 전량 측정을 돌리면 예산만 태운다.
- 전량 측정은 **여러 날 누적**으로. 캐시가 있으므로 하루 3~4항목씩 진행하면 3일이면 끝난다. 또는 유료 티어.
- WORKLOG 2026-07-31의 **두 패스 분리**(생성만 → 채점만)를 러너에 반영할 것. 현재 러너는 항목마다 생성·채점을 번갈아 해서 같은 TPM 풀을 서로 굶긴다. `--no-judge` 플래그 필요.
- `uplift_eval._BACKEND_DEFAULT_MODEL`의 `gemini-2.0-flash` 퇴역 — 이번 범위 밖이라 두었으나 `uplift_eval`·`example_ab_eval` 실행 시 같은 404가 난다. 별도 수정 필요.

---

## [2026-08-15] Judge 채점 기준 v2 — 만점 포화 해소 + 검색이 움직일 수 있는 축 신설
**목적**: 8/14 측정에서 `context_retention` 2항목이 **rag_off·rag_on·oracle 세 조건 모두 5.00 만점**으로 나왔다. 근거를 아예 빼도 만점이면 검색 효과를 잴 수 없다. 전량 측정 전에 채점 기준부터 고친다.

**🔴 진단 — 루브릭에 검색이 움직일 수 있는 축이 없었다**
v1의 4개 기준(`contextRetention`·`instructionFollowing`·`clarity`·`hallucinationAvoidance`)은 **전부 기법 카드 없이도 만족 가능**하다. 문맥 유지와 지시 준수는 모델이 자체 능력으로 하는 일이라, 검색을 켜든 끄든 구조적으로 같은 점수가 나온다. 포화는 채점자가 후해서만이 아니라 **평가축 자체가 검색과 무관해서** 생긴 것이었다.

**Before / After**
| | v1 | v2 |
|---|---|---|
| 평가축 | 4개 (전부 검색 무관) | **5개** — `techniqueGrounding` 신설 |
| 점수 정의 | "5점은 매우 충실히 만족" | **1~5 앵커 명시** + "5점은 기본값이 아니다" |
| 감점 규칙 | 없음 | 항목별 감점 트리거 명시 |
| `mustInclude` | judge 입력에만 존재, 사용 지시 없음 | **누락 1건당 1점 감점** |
| `mustNotInclude` | 동일 | **1건이라도 등장 시 최대 2점** |
| 채점 절차 | 지시 없음 | **결함을 먼저 찾고 → 점수 결정 → 근거에 감점 사유 명시** |

**`techniqueGrounding` 기준**: 개선안이 프롬프트 기법을 **실제 지시문으로 구현**했는가(역할 지정·출력 형식·제약·단계 분해·예시). 기법 이름만 언급하고 지시문에 반영이 없으면 최대 2점, 원 요청을 문장만 다듬었으면 최대 2점.

**캐시 무효화**: `JUDGE_PROMPT_VERSION`을 모듈 상수로 올리고 `v1 → v2`. 이 값이 Judge 캐시 키에 들어가므로 **예전 점수가 조용히 재사용되지 않는다.** 채점 기준을 고칠 때마다 함께 올릴 것.

**검증 (라이브 1건 — Groq TPD 잔량 한계)**
| 항목·조건 | v1 | v2 | Δ |
|---|---|---|---|
| `context_retention_01` / rag_off | 5.00 | **4.80** | **−0.20** |

- ⭐ **만점 포화가 첫 데이터에서 깨졌다.** 근거 없이도 만점이던 항목이 4.80으로 내려왔다. n=1이라 방향 신호이지 확정은 아니다.
- Groq TPD 99,825/100,000 소진으로 나머지는 미검증. 다음 측정에서 **점수 분포부터** 확인할 것.

**⚠️ 편향 주의**: `techniqueGrounding`은 기법 적용을 점수화하므로 rag_on에 유리해 보일 수 있다. 다만 모델은 검색 없이도 자체 지식으로 기법을 적용할 수 있으므로 순환 논리는 아니다. **rag_off가 이 항목에서 몇 점을 받는지**가 그 판단의 근거가 되니, 다음 측정에서 항목별 점수를 함께 볼 것.

**변경 파일**: `eval/multi_turn_eval.py`, `tests/test_multi_turn_eval.py`

**검증**: `python3 -m pytest tests/test_multi_turn_eval.py -q` → **49 passed**(신규 3). 비pytest 3종 전부 통과. 점수 키를 열거하던 기존 테스트 4건은 **기준 변경에 따라 갱신**(억지 통과 아님) — v1 형식 응답(4개 기준)은 이제 `invalid_scores`로 거부된다는 테스트를 함께 추가했다.

---

## [2026-08-15] SYSTEM_PROMPT 장식선 제거 — 385토큰 무손실 회수
**목적**: SYSTEM_PROMPT 축소 검토. 쿼터 압박을 줄일 수 있는지 실측으로 판단.

**측정 — 구성 분해 (총 4,990토큰 / 174줄)**
| 구분 | 토큰 | 비중 |
|---|---:|---:|
| 규칙 문장 | 3,356 | 67% |
| 예시·❌/✅ 블록 | 1,009 | 20% |
| **━━━ 장식선** | **385** | **8%** |
| JSON 스키마 | 237 | 5% |

**변경**: `━` 만으로 이뤄진 14줄 제거. 헤더 텍스트는 전부 보존하고, 원래 닫는 ━ 자리에 빈 줄을 넣어 구획을 유지했다.
- Before: 4,990토큰 / 174줄  →  After: **4,605토큰 / 167줄** (**−385, −7.7%**)
- 검증: HEAD 대비 **의미 있는 줄 138 → 138, 내용 완전 동일**. 규칙 문장·예시 한 줄도 바뀌지 않았다. 2026-07-30 축소 시도가 회귀했던 원인(규칙·중복 서술 삭제)과 무관한 변경이다.
- 테스트: pytest 49 + 비pytest 3종(43/13/16) 전부 통과.

**🔴 그러나 축소는 쿼터 해결책이 아니다 — 계산으로 확인**
```
생성 1회  입력 6,961 + 출력 700 = 7,661토큰  (그중 SYSTEM_PROMPT 4,990 = 65%)
채점 1회  입력 1,588 + 출력 200 = 1,788토큰
```
| 시나리오 | 생성+채점 1쌍 | 하루(TPD 100k) | 필요 30쌍 대비 |
|---|---:|---:|---:|
| 현재 | 9,449 | 10쌍 | 33% |
| 장식선만 −385 | 9,064 | 11쌍 | 37% |
| 장식선+예시 −1,394(−28%) | 8,055 | 12쌍 | 40% |

가장 공격적인 안전 축소를 해도 하루 10→12쌍. **무료 티어 완주는 불가능하다.** 생성+채점 쌍 전체에서 SYSTEM_PROMPT 비중이 53%라 나머지 절반(컨텍스트·이력·출력)은 줄일 수 없기 때문. 예시 압축(−1,009)은 회수량 대비 위험이 커서 보류 — few-shot 역할을 하고, 규약상 3회 A/B 검증이 필요한데 쿼터가 없어 검증 자체가 불가능하다.

**❗ 8/14 기록 정정 — 병목은 TPM이 아니라 TPD였다**
- 8/14 항목에 "컨텍스트가 붙으면 Groq 예산 부족 → Gemini 강제 라우팅"이라 적었으나 **틀렸다.**
- 평가셋 10항목 전부 `_needs_long_context`가 **False**다. 여유 ~4,800토큰 vs 필요 ~640. **라우팅 전환 항목 0/10.**
- 실행 로그 4개 전수 확인: `장문 입력 → Gemini 라우팅` **0회**, `Groq 실패 → Gemini 폴백` 1회. Gemini는 장문 때문이 아니라 **Groq 429 이후 폴백으로** 불렸다.
- `TPM_LIMIT` 상수가 낡았을 가능성도 확인 — 8b 실제 헤더 `x-ratelimit-limit-tokens: 6000`으로 상수와 일치. 낡지 않았다.
- **결론: 유일한 병목은 TPD 100,000.** 유료 검토 시 Groq Dev Tier(TPD 상향) 하나면 되고, Gemini 유료는 이 워크로드에 불필요하다.

**변경 파일**: `app/rag/generator.py`

**후속(백로그)**
- 규약상 프롬프트 변경은 라이브 3회 A/B 검증 대상이다. 이번 변경은 의미 줄이 완전 동일해 회귀 위험이 낮다고 판단해 선반영했으나, **쿼터 회복 후 gen_eval 로 무회귀 확인할 것.**
- 헤더 구분을 더 싸게 유지하려면 `## 제목` 마커(헤더당 ~1토큰, 7개 = ~7토큰)도 선택지. 이번엔 "장식선만 제거" 범위를 지켜 미적용.

---

## [2026-08-15] 검색 구조 정밀 진단 — "형태 괴리"가 아니라 "관계 종류"가 문제였다
**목적**: "임베딩·코퍼스·리트리벌 구조가 안 맞는 것 같다"는 의문을 수치로 판정. LLM 쿼터가 필요 없는 오프라인 측정만으로 수행.

**측정 기준**: 8/14에 만든 `multi_turn_set.json`의 `gold_techniques`(10항목·22종) 대비 Recall@5.
⚠️ **이 라벨은 검증되지 않았다.** 작성자 1인의 판단이므로 Recall 수치는 "리트리버와 그 판단의 일치도"다. 팀 검토 필요. 아래 ①②④⑤는 라벨과 무관하게 성립한다.

**정상으로 확인된 것**
| 대상 | 측정 | 판정 |
|---|---|---|
| 임베딩(bge-m3) | 기법명으로 질의 → **Hit@1 1.000 / Recall@5 1.000** (22종 전부) | ✅ 정상 |
| 코퍼스 | 유사도 >0.95 **0쌍**, >0.90 **0쌍**, >0.85 27쌍/170장 | ✅ near-dup 위기 아님 |

→ "코퍼스에 제네릭 중복이 넘쳐 검색을 망친다"는 기존 가설(2026-07-29)은 **이 데이터로는 지지되지 않는다.** 코퍼스 확장·정리는 우선순위가 아니다.

**🔴 ① 리랭커가 정보를 0 제공하고 있다**
`Role Prompting` 카드에 대한 크로스 인코더 로짓:
| 질의 | logit |
|---|---:|
| 실제 사용자 요청 "친근한 분위기로 5장 분량이면 돼." | **+0.0000** |
| "Role Prompting 기법을 어떻게 적용하나요?" | +0.8523 |
| 카드 본문 첫 문장 | +0.9896 |
| 완전 무관 "오늘 서울 날씨 어때?" | **+0.0000** |

- **실제 요청이 무관 질의와 동점**이다. 운영 50건 전체 `rerank_score` 0.5000~0.5118 → top-5 순위는 소수점 넷째 자리 노이즈로 결정된다.
- Recall@5: 리랭커 O 0.215 / X 0.190 — 차이 0.025는 n=10 노이즈 범위. **이득 없이 매 요청 CPU만 소모.**

**🔴 ② 질의와 카드가 임베딩 공간에서 분리돼 있다**
```
질의↔카드 (1,700쌍)    평균 0.440   최대 0.586
카드↔카드 (14,365쌍)   평균 0.677   하위1% 0.528
```
- 질의에 **가장 잘 맞는** 카드(0.586)보다 **아무 카드 두 장**(평균 0.677)이 더 닮았다. 카드쌍의 91.5%가 질의-최대치보다 유사하다.
- 질의는 카드 군집 **바깥**에 있고 어느 카드에도 가깝지 않다 → 0.42~0.59의 좁은 띠에서 미세차로 순위가 정해진다.

**🔴 ③ min_score=0.40 게이트는 무력하다** — dense 코사인 최소값이 0.421이라 **50건 중 0건도 차단하지 못했다.** 관련도와 무관하게 항상 5장이 주입된다.

**⭐ ④ 핵심 발견 — 형태를 맞출수록 정확도가 떨어진다**
gold 를 보지 않는 고정 템플릿으로 질의 형태만 카드 쪽에 정렬해봤다.
| 질의 변형 | 질의↔카드 평균 유사도 | Recall@5 |
|---|---:|---:|
| 원본 질의 | 0.440 | **0.190** |
| "…어떤 프롬프트 기법이 필요한가: {질의}" | 0.527 | 0.045 |
| 카드 문체 모방 | **0.583** | **0.095** |

- **유사도는 0.440→0.583으로 오르는데 정확도는 0.190→0.095로 반토막.** 형태 정렬이 원인이었다면 정반대여야 한다.
- 형태를 맞추면 질의가 카드 군집 **안으로** 들어가 **모든 카드와 골고루 가까워진다** → 변별력 상실.
- 같은 이유로 실패한 시도 누계 4건: HyDE(2026-07-29, 0.483 급락) · `Use When` 인덱싱(0.095) · 위 템플릿 2종. **형태 정렬 방향은 닫혔다.**

**⑤ 질의 형태 변경도 전부 실패**
마지막 턴만 0.215 / history+query 전체 **0.100** / 사용자 발화만 누적 0.120. 컨텍스트를 더하면 오히려 나빠진다.

**진단 — 유사도가 답하는 질문이 딸깍이 필요한 질문이 아니다**
- 유사도: *"이 둘이 같은 것에 대한 텍스트인가"*
- 필요: *"이 요청의 결핍을 이 기법이 메우는가"* — **증상↔처방 관계이지 유사 관계가 아니다.**
- 현재 맞히는 케이스는 전부 어휘 중첩(친근한→Tone, 문체→Style, 빈칸→Template Filling)이다. 의미 검색이 아니라 **우연한 키워드 일치**로 버티고 있다.
- **결정적 함의**: 올바른 기법을 가져오는 질의를 쓰려면 어떤 기법이 필요한지를 **이미 알아야** 한다(기법명 질의 Hit@1 1.000). 그 시점에 검색은 검색이 아니라 **조회(lookup)**다. 즉 현 구조에서 진짜 어려운 판단을 **아무도 하고 있지 않다.**

**⑥ Category 축도 지금은 못 쓴다** — 170장에 고유 카테고리 **54종**(평균 3.1장). `Reasoning`/`Reasoning Prompting`, `Optimization`/`Prompt Optimization`, `Structure/Format`/`Prompt Structure` 등 표기 분열. LLM 추출 자유텍스트라 **통제 어휘가 아니다.** 라우팅 축으로 쓰려면 정규화가 선행돼야 한다.

**결정 — 검색 튜닝이 아니라 판단 단계 신설**
```
현재:  요청 ──유사도──> 기법 5장 ──> 생성
방향:  요청 ──판단──> 필요 기법 축 ──조회──> 카드 ──> 생성
```
임베딩은 버리지 않는다. **역할이 바뀐다** — "무엇이 비슷한가" 탐색이 아니라, 판단된 축으로 카드를 되찾는 **조회**에 쓴다(그건 Hit@1 1.000으로 이미 잘한다).

**즉시 처리 가능(무료)**
- 리랭커 제거 검토 — 이득 0.025(노이즈), 비용은 매 요청 CPU. A/B 1회로 확정 가능.
- `min_score=0.40` 폐기 또는 실분포(0.42~0.59) 기준 재설정.

**후속(백로그)**
- 로컬 `develop`의 **멀티표현 인덱싱**(`app/rag/views.py`, `0deb13f`)은 이 브랜치에 없어 측정하지 못했다. 병합 후 **같은 잣대(gold Recall@5)로 재볼 것** — 효과가 처음으로 검증된다.
- `gold_techniques` 라벨 팀 검토. 현재 모든 수치의 기준선이다.

---

## [2026-08-15] 기법 축 라우팅 — 테스트 모델 구축 + 태깅 파일럿
**목적**: 「검색 구조 정밀 진단」의 결론(유사도 → 판단 기반 조회)을 실제로 돌려보는 최소 구현.

**★ 축 선정 기준 — 카드의 `Prompt Template`**
카드에 `constraints` 같은 항목은 없다. 대신 모든 카드에 그 기법이 개선 프롬프트에 **실제로 추가하는 지시문**이 있다. 축은 그 지시문의 '종류'다.
| 카드 | Prompt Template | 축 |
|---|---|---|
| Constraint Prompting | `다음 조건을 반드시 지켜라: [조건 목록]` | constraints |
| Explicit Output Length Control | `답변은 {글자수} 내외로 작성하세요` | length_control |
| Abstention Prompting | `근거가 부족하면 "자료 부족"이라고 말하라` | uncertainty |

`Definition`은 추상적이고 `Use When`은 상황이지만 **`Prompt Template`은 결과물이라 판정이 흔들리지 않는다.** analyzer 쪽도 같은 언어("이 요청은 어떤 종류의 지시문이 필요한가")를 쓴다 — 양쪽이 **지시문 종류**로 만나는 것이 이 설계의 연결점이다.

**구현**
- `app/rag/axes.py` — 축 어휘 12개(`AXES_VERSION=v1`). 축마다 **요청 쪽/카드 쪽 설명을 분리** 보관. `normalize_axes`(통제 어휘 강제·상한), `filter_cards_by_axes`(겹침 수 정렬, 같으면 임베딩 순서 유지), `summarize_axis_coverage`(굶는 축 탐지)
- `ingestion/tag_axes.py` — 태깅 배치. 태거 주입식(테스트는 fake), 429 지수 백오프, `--only`/`--dry-run`/`--report`
- `app/rag/analyzer.py` — 출력에 `techniqueAxes` **추가만**(하위 호환). 어휘 밖 값은 버리고, 비면 호출자가 기존 유사도 경로로 폴백
- `tests/test_axes.py` — 12개. LLM·DB 없이 돈다

**⭐ 태깅 파일럿 (gold 22종, llama-3.3-70b, temp 0)** — **통과분 16/16 성공**
임베딩이 틀렸던 카드가 **전부 교정됐다**:
| 카드 | 임베딩 배정 | LLM 태깅 |
|---|---|---|
| Uncertainty Prompting | context_isolation ❌ | **uncertainty** ✅ |
| Abstention Prompting | grounding ❌ | **uncertainty** ✅ |
| Grounded Refusal Prompting | constraints ❌ | **uncertainty + grounding** ✅ |

- 근거도 정확히 `Prompt Template`을 인용한다 — *"'[금지 사항]은 하지 말고' 부분을 보고 constraints 축을 골랐다"*
- 나머지 6장은 **429 rate limit**(태깅 실패 아님). 재시도를 붙였다.
- **→ "임베딩으로는 태깅 못 한다"가 실증됐고, LLM 태깅은 작동한다.**

**🔴 축 어휘에서 드러난 경계 문제 (합의 필요)**
- `Variable Slot Prompting` → LLM은 **output_format**, 내 gold 라벨은 **빈칸(uncertainty) 용도**로 썼다
- `Template Filling Prompting` → LLM은 **output_format + constraints**, gold는 빈칸 용도
- 즉 **"빈칸"이 구조(output_format)인가 유보(uncertainty)인가**가 갈린다. 딸깍의 `[항목명 입력]` 메커니즘이 정확히 이 지점이므로 반드시 정해야 한다.
- `Task Framing Prompting` → role_assignment (임베딩은 decomposition). LLM 판정이 더 타당해 보인다.

**검증**: `python3 -m pytest tests/ -q` → **61 passed**. 비pytest 3종 전부 통과.

**후속(백로그)**
- 축 어휘 확정(특히 빈칸 경계) → 카드 170장 전량 태깅 → 사람 검토
- 조회 경로를 `run_generation` 앞단에 연결(현재 `axes.py`는 순수 함수만, 아직 배선 전)
- gold 대비 Recall@5 재측정. 목표 0.215 → 0.50
- 8b로도 태깅이 되는지 확인(현재 70b 기준). TPD 예산상 중요

---

## [2026-08-21] Groq 모델 폐기 대응 — llama-3.x → openai/gpt-oss 교체
**목적**: Groq가 llama-3.x 계열을 폐기(`model_not_found`)해 LLM 경로가 전면 실패. 프롬프트 개선 기능이 503으로 죽어 테스트 자체가 불가능한 상태를 복구.

**Before**
- 코드가 참조하던 모델: `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`
- Groq API 모델 목록에 **둘 다 없음** → 호출 시 `404 model_not_found`
- 실패 양상이 계층별로 달라 원인이 가려져 있었다:
  | 지점 | 증상 |
  |---|---|
  | `analyzer.py` | 404를 **삼키고** "분석 없이 진행" — 서버는 200, 품질만 조용히 저하 |
  | `query_transform.py` | 동일 모델 → 쿼리 변환·HyDE 무력화 |
  | `generator.py` | 404 → `Groq 실패 → Gemini 폴백` |
- 폴백처인 Gemini도 동시에 `503 UNAVAILABLE(high demand)` → 1·2차 경로 동시 차단 → 최종 503

**After**
- `llama-3.3-70b-versatile` → `openai/gpt-oss-120b`
- `llama-3.1-8b-instant` → `openai/gpt-oss-20b`
- TPM_LIMIT 실측 반영: 12000/6000 → **8000/8000** (`x-ratelimit-limit-tokens` 헤더 실측)
- Groq 경로 복구 → Gemini 가용성과 무관하게 동작

**변경 파일**
- 수정: `app/rag/generator.py` (GROQ_MODEL_MAP 3곳, TPM_LIMIT 2곳, 기본값 2곳)
- 수정: `app/rag/analyzer.py` (`_MODEL`, 낡은 "TPM 6000" 주석 정정)
- 수정: `app/rag/query_transform.py` (`_TRANSFORM_MODEL`, `_HYDE_MODEL`)

**검증**
- 후보 모델 직접 호출: `openai/gpt-oss-120b`가 `response_format=json_object`로 **JSON 구조화 출력 성공**
- `POST /query` ("블로그 글 잘 써줘") → `mode: "ask"` — analyzer가 **되살아나** 주제 없음을 판단하고 되물음(교체 전에는 404로 죽어 그냥 통과하던 지점)
- 브라우저 E2E(localhost:4173 → Make): "신입 개발자를 위한 Git 브랜치 전략 블로그 글" → 개선 프롬프트 정상 생성, `참고한 프롬프트 기법` 2건 근거 표시, `POST /api/prompts/improve → 200`
- 한국어 출력 품질 정상(교체 후 한국어 지시에 한국어로 응답)

**결정·근거**
- Groq 잔존 모델 중 `gpt-oss-120b/20b`가 기존 70b/8b의 역할 분담(생성/판단)에 그대로 대응돼 구조 변경 없이 이름만 교체.
- **미검증으로 남긴 것**: 교체가 검색·생성 품질에 준 영향의 정량 비교(A/B). 기능 복구가 우선이라 라이브 A/B는 수행하지 않았다. `analyzer`가 그간 404로 무력화돼 있었으므로, 과거 평가 수치는 analyzer 없는 상태에서 측정된 것일 수 있어 재측정이 필요하다.

---

## [2026-09-08] 분석기 A·D 수정 — 축 폐기 버그 차단 · 정제 규칙 관측 가능화
**목적**: 전수조사에서 나온 analyzer 결함 2건. 둘 다 **축 라우팅 배선 전에** 고쳐야 하는 것들이다 — A는 배선하는 순간 조회 경로를 죽이고, D는 배선 후 문제가 나도 원인을 판별할 수 없게 만든다.

### A. 필드가 비면 `techniqueAxes` 가 통째로 폐기됨

**Before** (`analyzer.py`)
```python
fields = _sanitize(data.get("fields") or [])
if not fields:
    return None          # ← 축이 잘 뽑혔어도 여기서 함께 폐기
```
- 지금은 축이 미배선이라 무해하지만, `DESIGN_TECHNIQUE_ROUTING.md` 5단계(조회 경로 연결)를 하는 순간 **실질 버그**가 된다. 축 판정은 성공했는데 필드가 비었다는 이유로 축까지 사라지고, 호출자는 유사도 폴백(AUC 0.575 경로)으로 떨어진다.
- `_sanitize` 가 만능 필드(`_JUNK`)·작업유형 오염(`_TASK_WORDS`)을 걷어내면 필드가 0이 되는 경로가 실제로 존재한다.

**After**
```python
fields = _sanitize(data.get("fields") or [])
axes   = normalize_axes(data.get("techniqueAxes"))
if not fields and not axes:   # 둘 다 비었을 때만 '분석 실패'
    return None
```
- `None` 의 의미를 **분석 실패 하나로** 좁혔다(키 없음·호출 실패·파싱 실패·산출물 전무).
- **생성 경로 무회귀 근거**: `generator.build_analysis_block()` 이 이미 `not analysis.get("fields")` 에서 `""` 를 반환한다(generator.py:323) → 빈 fields 분석은 `analysis=None` 과 렌더 결과가 **완전히 동일**하다. 이 등가성을 테스트로 고정했다.

### D. 정제 규칙의 근거가 폐기된 모델 것인데 조용히 동작

**Before**
- 주석이 *"8b 는 …"* 이라 적혀 있으나 `_MODEL` 은 2026-08-21에 `openai/gpt-oss-20b` 로 교체됨.
- `_JUNK`·`_TASK_WORDS`·`_FRAMING_EXACT`·`_MAX_REQUIRED` 전부 `llama-3.1-8b-instant` 오염 실측 기반. **현 모델에서 재측정된 적 없음.**
- 규칙이 발동해도 `continue` 로 **조용히 버려서**, 지금 이 방어가 (a)여전히 필요한지 (b)불필요한 교정을 하는지 (c)새 오염을 놓치는지 **판별할 방법이 없었다.**

**After**
- 주석에 근거의 출처(폐기 모델)와 미검증 상태를 명시.
- `_record_drop(rule, name)` 으로 교정 발동을 규칙별 집계 + 로그. 읽기는 `sanitize_stats()`, 구간 분리는 `reset_sanitize_stats()`.
- 규칙 6종: `junk` · `task_word` · `framing_coerced` · `role_unknown` · `required_over_cap` · `not_dict`
- **규칙 동작 자체는 안 바꿨다** — 관측만 추가(무회귀). `framing_coerced` 만 `and role != "framing"` 조건을 붙여 **이미 framing 인 것을 교정으로 오집계하지 않게** 했다(동작 동일, 카운터 오탐 제거).
- ⚠️ 규칙 제거는 이 카운터가 쌓인 뒤에 한다. 지금 지우면 8b 시절 회귀를 되살리면서 그게 회귀인지조차 판별 못 한다.

**변경 파일**
- 수정: `app/rag/analyzer.py` (모듈 docstring · `_sanitize` 관측 · `analyze` 반환 계약 · 낡은 8b 주석)
- 수정: `app/rag/generator.py` (`build_analysis_block` 의 "분석기(8b)" 표기 정정 1곳)
- 수정: `RAG_PIPELINE.md` §1-[C0]
- 신규: `tests/test_analyzer.py` (9개 — LLM·DB 없이 동작, Groq 클라이언트는 fake 주입)

**검증**
- `python3 -m tests.test_analyzer` → **9 passed**
- `python3 -m pytest tests/ -q` → **71 passed** (종전 61 + 신규 9 + axes 수 변동)
- 비pytest 3종 회귀 없음: postprocess 43 / token_budget 13 / generator_guards 16 / axes 13

**미검증으로 남긴 것**
- `gpt-oss-20b` 에서 각 방어 규칙이 실제로 필요한지 — **이번 변경은 그 질문을 측정 가능하게 만든 것이지 답한 것이 아니다.** 라이브 트래픽/`gen_eval` 실행 후 `sanitize_stats()` 를 읽어 판정할 것.
- 축이 배선되지 않았으므로 A 수정의 실효(조회 경로 보존)는 **아직 end-to-end로 확인 불가**. 배선 시 함께 확인.

**남은 analyzer 결함(미착수)** — 전수조사 지적 중 이번에 안 고친 것
- **B**: `required` 상한 강등이 LLM 출력 **순서 의존**(앞 2개만 유지). 작업유형별 required 목록과 대조해 고르는 게 맞다
- **C**: `history[-4:]` 고정 → 문서가 주장하는 "같은 질문 반복 구조적 차단"이 **실제로는 2턴 보장**
- **E**: `max_tokens=700` 고정 → 긴 원문에서 분석기만 먼저 죽어 `None` 폴백(분석이 가장 필요한 케이스)
- **F**: 축 카탈로그 추가 후 축 선택 일관성·기존 mode 정확도(0.83) 재측정 안 됨

---

## [2026-09-12] 축 태깅 복구 — 모델 교체 + 출력 예산 버그 · 120b 파일럿
**목적**: 축 라우팅 배선의 1단계. `tag_axes.py` 가 폐기 모델을 참조해 실행 불가였던 것을 복구하고, 교체 모델이 '축 선택'이라는 판단을 할 수 있는지 파일럿으로 확인.

### 발견한 결함 2건 (하나인 줄 알았는데 둘이었다)

**① 폐기 모델 참조** — `_MODEL = "llama-3.3-70b-versatile"`. 2026-08-21 Groq 폐기분이라 실행 시 전량 404.
→ 같은 역할(대형=판단)인 **`openai/gpt-oss-120b`** 로 교체.

**② 🔴 출력 예산 부족 — 교체만 하면 여전히 전량 실패**
- `max_tokens=200` 으로 20장 중 **20장 전부 무배정**.
- 원인은 쿼터가 아니라 **모델 계열 차이**: `gpt-oss` 는 최종 JSON 앞에 **추론 토큰**을 먼저 쓴다. 예산이 먼저 소진돼 Groq 가 `400 json_validate_failed` ("max completion tokens reached before generating a valid document") 를 낸다. `llama-3.3-70b` 는 추론 모델이 아니라 200 으로 충분했다.
- 실측: 카드당 완료 토큰 **203~204** — 200에서 **딱 4 토큰 넘쳤다.**

| max_tokens | 결과 | 실사용 완료 토큰 |
|---:|---|---:|
| 200 | ❌ 400 json_validate_failed (20/20) | — |
| 500 | ✅ | 204 |
| 1000 | ✅ | 204 |
| 2000 | ✅ | 203 |

→ `_MAX_TOKENS = 700` 상수로 분리(예산은 상한일 뿐 실사용·과금은 ~204 그대로).
- ⚠️ 이 400 은 `is_rate_limited` 가 False 로 판정해 **재시도되지 않는다**(정상 — 재시도해도 같다). 대신 카드가 `axes=[]` 로 남아 **쿼터 소진과 겉모습이 같다.** 전량 무배정이면 429가 아니라 예산을 먼저 의심할 것.

### 파일럿 — 기존 70b 태그 대비 일치율 (20장)

⚠️ **70b 태그는 정답이 아니라 기준선이다**(그것도 미검증). 아래는 '정확도'가 아니라 '두 모델의 일치도'다.

| | 건수 |
|---|---:|
| 완전일치 | **12/20 (60%)** |
| 부분일치(축 하나 이상 겹침) | 4 |
| 불일치 | 3 |
| 무배정 | 1 |
| 에러 | 0 |
| **겹침 있음(일치+부분)** | **16/20 (80%)** |

**불일치 4건은 모델 품질이 아니라 축 어휘의 경계 문제로 보인다**:
| 카드 | 70b | 120b | 판단 |
|---|---|---|---|
| Task Framing | `role_assignment` | `constraints` | 템플릿 '너의 작업은 [핵심 작업]이다' — 역할도 제약도 아님. **어휘 공백** |
| Context Prompting | `context_isolation`+`constraints` | `grounding` | '이 맥락 안에서 수행하라' → **120b 쪽이 grounding 정의에 더 맞다** |
| Instruction-First | `output_format` | `decomposition` | 지시를 앞에 두는 **입력 배치** 규칙 — 출력 형식도 단계 분해도 아님. **어휘 공백** |
| Zero-Shot | `role_assignment` | `[]` | 예시 없이 시키는 것이라 **추가 지시문이 없다**. 프롬프트 규칙 4("해당 없으면 빈 배열")를 **120b가 정확히 지킴** |

### 결정성 검사 (5장 × 3회, temp=0)

| | 결과 |
|---|---|
| 안정 | **3/5** |
| 흔들림 | 2/5 — Task Framing, Context Prompting |

⭐ **흔들린 2장이 70b와 불일치한 바로 그 2장이다.** 그리고 흔들리는 건 **2순위 축뿐**이고 1순위(`constraints`, `grounding`)는 3회 모두 동일했다.
→ 불안정성과 불일치가 같은 카드에 모인다 = **모델이 흔들리는 게 아니라 그 카드가 어휘상 애매한 것.**
→ 실행 함의: 카드당 축 상한을 3에서 낮추거나 **1순위 축만 신뢰**하면 노이즈가 줄어든다.

### 🔴 함께 드러난 것 — 축 분포가 심하게 쏠려 있다 (`--report`)

DB 실물은 WORKLOG 기록과 달랐다: **파일럿 16장이 아니라 134/170장이 이미 태깅돼 있다.**

```
총 170장 · 미태깅 36 · 다축 67 · 굶는 축 없음
output_format 54 · constraints 51 · decomposition 29 · grounding 14 · extraction 12
role_assignment 11 · length_control 8 · examples 8 · tone_style 6 · uncertainty 6
context_isolation 5 · comparison 3
```

- `output_format`(54) + `constraints`(51) = 태그 207개 중 **105개(51%)**. 요청이 이 둘을 고르면 후보가 **최대 105장 = 코퍼스의 62%** → **필터가 사실상 작동하지 않는다.**
- DESIGN_TECHNIQUE_ROUTING.md §4 의 근거 *"정답 축을 맞히면 후보가 ~14장으로 좁혀진다"* 는 **성립하지 않는다**(170÷12=14 는 카드당 1축 가정인데 실제 1.54축 + 쏠림).
- 미태깅 36장은 `filter_cards_by_axes` 가 전부 탈락시키므로 축 경로에서 **영구 불가시**(21%).

**변경 파일**
- 수정: `ingestion/tag_axes.py` (`_MODEL` 교체 · `_MAX_TOKENS` 신설 및 적용 · 근거 주석)

**검증**
- `python3 -m pytest tests/ -q` → **71 passed** (회귀 없음)
- `python3 -m tests.test_axes` → 13 passed
- 파일럿·결정성은 라이브 Groq 호출 (총 ~60회, `--dry-run` 상당 — **DB 미변경**)

**미결 — 전량 태깅 전에 정해야 할 것**
1. **축 쏠림 대책**: `output_format`/`constraints` 가 절반이면 필터 효과가 없다. 축 분할? 요청 축 상한 3→2? 겹침 수 컷?
2. **어휘 공백**: Task Framing·Instruction-First 처럼 12축에 안 맞는 카드 처리(새 축 vs 무배정 허용)
3. **기존 134장 재태깅 여부**: 폐기 모델이 붙인 태그다. 일치 60%라면 남길지 새로 할지 결정 필요
4. gold 라벨 검토(DESIGN §5-2) — 여전히 미착수. Recall 수용 기준의 전제

---

## [2026-09-12] 🔴 축 쏠림의 원인 규명 — 어휘 문제가 아니라 **코퍼스에 범주가 다른 카드가 섞여 있다**
**목적**: 앞 항목에서 드러난 축 쏠림(`output_format` 54 · `constraints` 51 = 태그의 51%)의 원인을 찾아 축 어휘 수정안을 만들려 했다. **결론은 어휘를 고칠 문제가 아니었다.**

### 발견 — 카드 170장에 성격이 다른 4종류가 섞여 있다

축 어휘 12개는 *"이 기법이 사용자 프롬프트에 어떤 지시문을 추가하는가"* 를 묻는다. 그런데 그 질문 자체가 성립하지 않는 카드가 다수다.

| 종류 | 내용 | 예 | 장수 |
|---|---|---|---:|
| ① **빈/무의미 템플릿** | `Prompt Template` 이 비었거나 `? ? ? ?`, `` ? ` `` 수준 | AutoPrompt · Standard Prompt · Reasoning Prompt · Knowledge generation · Start Simple | **12** |
| ② **메타 기법** | 프롬프트를 만들거나 고치는 법 = **딸깍 자신이 하는 일** | Meta-Prompting · Prompt Generator Pattern · Prompt Optimization · Prompt Expansion · Prompt Repair | **15** |
| ③ **RAG/에이전트 시스템 기법** | 시스템 설계자용. 사용자 요청과 무관 | HyDE · Chunk Design · Prompt Injection Defense · Instruction Hierarchy · Use API-Defined Tools · Temperature | **20** |
| | **합계(중복 제거)** | | **44/170 = 26%** |

⚠️ 위 ②③ 목록은 손으로 고른 **보수적** 분류라 26%는 **하한**이다(Prompt Chaining·Modular Prompting·Graph Prompting·Iterative Query Analysis 등 경계 사례 다수 제외).

②가 특히 위험하다 — 검색되면 생성기에 *"기존 프롬프트의 약점을 찾고 개선안을 제시하라"* 가 **참고 기법**으로 들어간다. **딸깍이 이미 하고 있는 일을 자기 자신에게 지시하는 동어반복**이다.

### 이것이 축 쏠림의 직접 원인이다

| 축 | 전체 | 그중 쓸 수 없는 카드 |
|---|---:|---|
| `output_format` | 54 | **18 (33%)** — Meta-Prompting · HyDE · Chunk Design · Temperature · Zero-Shot … |
| `constraints` | 51 | **16 (31%)** — Prompt Injection Defense · Instruction Hierarchy · Prompt Repair … |
| 미태깅 36장 | 36 | **12** |

**축이 두 개로 쏠린 게 아니라, 축을 붙일 수 없는 카드가 '형식/제약처럼 보여서' 그 두 축으로 떠밀린 것이다.** 걷어내면 54→36, 51→35 로 내려간다.
미태깅 36장도 LLM이 못 고른 게 아니라 **정말 축에 안 맞는 카드**가 3분의 1이다.

### 운영 영향 실측 — 검색이 무작위와 구별되지 않는다

실사용형 질의 10건 · dense 단독 · top-5 (`min_score` 없음):

```
top-5 총 50개 중 쓸 수 없는 카드 15개 = 30%   (코퍼스 비율 26%)
```

🔴 **무작위 추출(26%)보다 오히려 높다.** 검색이 '이 카드가 이 요청에 쓸 수 있는 것인가'에 대해 **정보를 0 제공**하고 있다.

가장 선명한 예 — `"신입 개발자를 위한 Git 브랜치 전략 블로그 글 써줘"` → top-5 중 **4장이 RAG 시스템 구축 기법**:
`Chunk Design · Prompt Governance · Query Rewriting · Instruction Hierarchy · Retrieval Failure Handling`
그 외: `"제주도 여행 블로그"` → Meta-Prompting / `"다이어트 식단"` → Chunk Design Prompting

### ⭐ 왜 지금까지 안 보였나 — 진단 기준이 '중복'이었기 때문

2026-08-15 「검색 구조 정밀 진단」은 코퍼스를 **near-dup 기준**으로 보고 *"유사도 >0.90 0쌍 → 코퍼스 위기 아님, 정리는 우선순위 아님"* 이라고 판정했다. 그 판정은 **그 기준 안에서는 옳다.**
문제는 **중복이 아니라 범주 오류**였다. 이 카드들은 서로 닮지도 않았고 카드 자체로는 멀쩡하다 — **다른 질문에 답하고 있을 뿐이다.** 어떤 유사도 지표로도 안 잡힌다.
→ `CORPUS_STRATEGY.md` 2-2(변별성)·2-4(카드 품질)에 **'범주 정합성' 축이 빠져 있다.**

### 제안 — 삭제가 아니라 `layer` 메타데이터로 층을 나눈다

```
layer: "user_instruction"  # 사용자 프롬프트에 추가할 지시문     → 검색 대상 (~126장)
layer: "meta"              # 프롬프트 생성·개선 기법(딸깍의 동작)  → 검색 제외
layer: "system"            # RAG·에이전트 구축 기법              → 검색 제외
layer: "degenerate"        # 빈/무의미 템플릿                   → 검색 제외
```

- **삭제하지 않는 이유**: 카드 자체는 자산이다(②는 딸깍 SYSTEM_PROMPT를 개선할 때 참고 대상). 삭제는 되돌리기 어렵고, `layer` 는 `axes`·`embedding_views` 와 같은 **메타데이터 추가 방식이라 무회귀**다.
- 배선은 `_load_collection` 에 `layer` 필터 한 줄.

**기대**: 검색 대상 170→~126 · 축 쏠림 완화(54→36, 51→35) · top-5 노이즈 30% 제거. 그 뒤에 축 어휘를 보면 **진짜 어휘 문제만 남는다**(Task Framing·Instruction-First 같은 공백).

### 순서 수정 — 축 어휘 확정은 2순위로 내린다

| 순 | 작업 | 이유 |
|---|---|---|
| 1 | **`layer` 분류 + 배선** | 이게 안 되면 축 어휘를 아무리 잘 짜도 26%가 딸려온다 |
| 2 | 축 어휘 재검토 | 노이즈 제거 후의 실제 분포로 판단 |
| 3 | 남은 카드 태깅·재태깅 | 어휘 확정 후 |
| 4 | gold 라벨 검토 → Recall 재측정 | 종전과 동일 |

**측정**: 라이브 LLM 호출 없음(분류는 이름·템플릿 기반, 검색은 로컬 bge-m3). DB 미변경.

---

## [2026-09-12] 카드 층(layer) 분류 — 전량 LLM 배치 완료 · top-5 노이즈 30%→8%
**목적**: 앞 항목에서 규명한 '범주 오류'를 실제로 걷어낸다. 검색 대상 자격을 층으로 분류.

### 층 어휘 (`app/rag/layers.py`, `LAYERS_VERSION=v1`)

| 층 | 정의 | 검색 |
|---|---|---|
| `user_instruction` | 일반 사용자 요청 뒤에 그대로 덧붙일 수 있는 지시문 | ✅ |
| `meta` | **기존 프롬프트를 입력으로 받아** 더 나은 프롬프트를 만드는 기법(딸깍 자신의 동작) | ❌ |
| `system` | 서비스 운영자가 **시스템 계층**에 심는 규칙(시스템 프롬프트·검색·도구·모델 파라미터) | ❌ |
| `degenerate` | 카드 전체를 봐도 무엇을 추가하는지 알 수 없음 | ❌ |

⭐ **미분류(층 없음)는 검색에 포함**한다 — 배치 실패·신규 카드로 코퍼스가 통째로 비는 사고 방지. `embedding_views` NULL 이 종전 동작인 것과 같은 원칙(무회귀). `is_searchable()`.

### 프롬프트 설계 — meta/system 경계가 실측으로 한 번 무너졌다

1차 정의는 meta 를 *"산출물이 프롬프트인 기법"* 으로 썼다. 결과 **`system` 을 한 번도 고르지 않았다**(경계 6장 중 3장 오분류). 모델 근거가 원인을 그대로 말했다:
> *"the technique **outputs a prompt** rather than a user-facing instruction"* (Prompt Injection Defense → meta)

시스템 프롬프트 규칙을 만드는 카드도 '산출물이 프롬프트'라 meta 로 빨려든다.
→ **가르는 기준을 '산출물'에서 '입력'으로 바꿨다**: 사용자의 프롬프트를 고치면 meta, 시스템 계층에 규칙을 심으면 system. 판정 순서도 좁은 것(system) 먼저로.
→ 경계 6장 재검증 **3/6 → 5/6**.

### 출력 예산 — `_MAX_TOKENS` 를 또 올렸다

전량 실행에서 **9/170 이 400** 으로 실패. 두 종류였다:
| 메시지 | `failed_generation` | 원인 |
|---|---|---|
| Failed to **generate** JSON | `max completion tokens reached` | 예산 부족(긴 카드일수록 추론이 길다) |
| Failed to **validate** JSON | `''` (빈 생성) | 일시적 |

→ `_MAX_TOKENS` 700 → **1500** (`tag_layers`·`tag_axes` 둘 다). 예산은 상한일 뿐이라 실사용(~204)·과금·지연은 그대로다. 9장 재실행 **전부 성공 → 미분류 0**.

### 결과

```
170장 · 미분류 0
user_instruction 124 · system 26 · meta 17 · degenerate 3
검색 대상 124 / 제외 46
```

### ⭐ 운영 효과 — 독립 잣대로 검증

LLM 분류와 **무관하게** 앞 항목에서 손으로 만든 44장 목록을 잣대로, 같은 질의 10건 dense top-5:

| | 노이즈율 |
|---|---:|
| 적용 전 | 15/50 = **30%** |
| 적용 후 | 4/50 = **8%** |

예: `"신입 개발자를 위한 Git 브랜치 전략 블로그 글"` top-5 중 4장이 RAG 구축 기법이던 것이 전부 교체됐다. `"임영웅 콘서트 홍보 문구"` 의 Meta-Prompting·Chunk Design 도 빠졌다.

### 🔴 사람 검토 필요 — 분류가 완벽하지 않다

- **남은 노이즈 3장**: `Multi-Query Retrieval Prompting` · `Prompt Governance Prompting` · `Zero-Shot` 이 user_instruction 으로 분류돼 여전히 회수된다.
- **과잉 제외 의심**: `Delimiter Prompting` · `XML Tags for Structure` (사용자도 구분자를 쓸 수 있다) → meta / `Priority Placement` · `Abstention Prompting` (사용자가 쓸 수 있는 지시문) → system
- **경계 사례는 실행마다 흔들린다**(temp=0인데도): `Temperature`·`Give the Model an Out` 이 두 실행에서 다르게 나왔다. 축 태깅과 같은 양상 — 어휘가 애매한 카드에 불안정이 몰린다.
- 검토용 원본: 각 카드의 분류 근거가 `--out` JSON 에 있다.

**변경 파일**
- 신규: `app/rag/layers.py` · `ingestion/tag_layers.py` · `tests/test_layers.py`(12개)
- 수정: `ingestion/tag_axes.py` (`_MAX_TOKENS` 1500 + 근거 주석)

**검증**: `pytest tests/ -q` → **83 passed** · `python3 -m tests.test_layers` → 12 passed

**아직 안 한 것**: `is_searchable` 은 **리트리버에 배선되지 않았다.** DB 에 `layer` 가 기록됐을 뿐 `/query` 동작은 **무변경**이다. 배선은 검토 후 별도 작업.

---

## [2026-09-13] 층 어휘 v2 — 회귀 셋 신설 · 재분류 · **두 잣대가 엇갈림(혼합 결과)**
**목적**: v1 전량 분류의 34/170 엇갈림을 사람이 검토해 원인을 찾고, 기준을 고쳐 재분류.

### 회귀 셋 신설 (`eval/layer_set.json` 34장 · `eval/layer_eval.py`)
v1 결과와 사람 판단이 갈린 34장을 **재분류 전에** 라벨링해 고정했다. 나중에 만들면 결과에 맞춰 라벨을 고치게 된다.
⚠️ 작성자 1인 판단 — `gold_techniques` 와 같은 미검증 기준선 함정. 팀 검토 전까지 잠정.

### v1 실패 원인 — 기준 문장이 만든 체계적 오류 3종
| # | 증상 | 모델 근거 |
|---|---|---|
| ① | "덧붙일 수 있는가"를 **문법적 가능성**으로 읽음 → 효과 없는 카드도 통과 | *"can be directly appended after a user request"* |
| ② | "기존 프롬프트를 입력으로"를 넓게 읽어 **작성 방법론까지 meta 로** | *"reformats an existing prompt"* (Delimiter·Specificity) |
| ③ | `degenerate` 를 거의 안 고름(170장 중 3장) | — |

**설계 결함도 드러났다**: `meta` 가 (a)딸깍이 이미 하는 일(동어반복)과 (b)프롬프트 작성 방법론(유용)을 한 데 묶고 있었다. (b)는 빼면 손해다.

### v2 변경
- 판정 질문을 **문법 → 효용**으로: *"이 카드를 참고해 개선 프롬프트를 만들면 사용자의 결과물이 좋아지는가"*
- `meta` 를 *"'좋은 프롬프트를 만들어라' 자체를 말할 뿐 무엇을 넣을지는 안 알려주는"* 으로 좁힘
- `system` 을 *"프롬프트 텍스트만으로는 효과가 없는"* 으로 재정의
- `degenerate` 강제 문구 추가 · `LAYERS_VERSION` v1 → **v2**

### 🔴 결과 — 두 잣대가 반대로 움직였다

| 잣대 | v1 | v2 |
|---|---:|---:|
| 회귀 셋 34장 층 정확 일치 | 32% | **59%** |
| 회귀 셋 검색 포함/제외 일치 | 32% | **71%** |
| **실사용 질의 top-5 노이즈율**(독립 44장 목록) | **8%** | **20%** 🔴 |
| 층 분포 | ui 124 / sys 26 / meta 17 / deg 3 | ui **143** / sys 21 / meta **3** / deg 3 |

**v2 가 검토에서 지적된 것은 전부 고쳤다** — 과잉제외 9장(Delimiter·XML Tags·Specificity·Problem Decomposition·Rubric·Abstention·Priority Placement·Instruction Conflict Resolution·Diff/Patch) 전부 `user_instruction` 복귀, Temperature·Multi-Query Retrieval·Tool-Use·Use of Affordances 전부 `system` 이동.

**그런데 새 구멍이 생겼다 — 판정 근거가 전부 *"provides concrete instruction"***:
| 카드 | v1 | v2 | 실제 |
|---|---|---|---|
| Chunk Design Prompting | system | **user_instruction** | RAG 청크 설계 |
| Instruction Hierarchy Prompting | system | **user_instruction** | 시스템 계층 |
| Retrieval Failure Handling | system | **user_instruction** | 검색 인프라 필요 |
| Zero-Shot (PT=`Text: {내용}`) | user_instruction | user_instruction | degenerate |

→ **v1 은 '붙는가'(문법), v2 는 '구체적인가'(형식)로 판정했다. 둘 다 효용이 아니다.**
`meta` 도 17→3 으로 과교정됐다(Prompt Compression·Expansion 이 user_instruction 으로 — 이 둘은 사람 판단도 갈린다).

### ⭐ 구조적 결론 — 단일 LLM 판정으로 이 경계가 안 잡힌다
근거 3건: ①v1 1차(system 을 한 번도 안 고름) ②v1 2차(meta 과흡인) ③v2(구체성 구멍). **세 번 모두 프롬프트가 명시한 표면 속성에 모델이 달라붙었다.** 여기에 temp=0 인데도 경계 카드는 실행마다 흔들린다(Temperature·Give the Model an Out 실측).

**다음 제안**: LLM 분류(쉬운 다수) + **사람 override 목록**(경계 소수, git 관리). 회귀 셋과 override 는 **파일을 분리**해야 한다 — 합치면 회귀 점수가 구조적으로 100% 가 돼 측정 불능이 된다.

**변경 파일**
- 수정: `app/rag/layers.py`(v2 어휘) · `ingestion/tag_layers.py`(프롬프트) · `tests/test_layers.py`
- 신규: `eval/layer_set.json`(34장) · `eval/layer_eval.py`

**검증**: `pytest tests/ -q` → 83 passed · v2 전량 재분류 170/170 성공(미분류 0)
**주의**: DB 에는 v2 가 기록돼 있다. `is_searchable` 은 **여전히 미배선**이므로 `/query` 동작은 무변경이다.

---

## [2026-09-13] 층 분류 확정 — LLM + 사람 override 2층 구조 · top-5 노이즈 22%→2%
**목적**: v2 가 회귀 셋은 올렸으나(32→59%) 검색 노이즈는 악화시킨(8→12%) 혼합 결과를 매듭짓는다.

### 먼저 — 내 잣대에 오류 4건이 있었다
노이즈 측정에 쓰던 '쓸 수 없는 카드' 44장 목록에서 **4장이 틀렸다.** 검토와 팀 판단으로 제외:
| 카드 | 판정 | 근거 |
|---|---|---|
| Source-Bounded Answering | user_instruction | 사용자가 자료를 붙여넣고 쓸 수 있다 |
| Add Defense in the Instruction | user_instruction | 일반 제약 지시문으로 읽힌다 |
| **Prompt Compression** | user_instruction | **생성기에 유용한 지침(2026-09-13 결정)** |
| **Prompt Expansion** | user_instruction | 동일 — "역할·맥락·조건·출력형식을 포함하라"는 개선에 직접 쓰인다 |

→ 잣대 44 → **40장**. 이 수정만으로 v1/v2 격차가 **8% vs 20% → 8% vs 12%** 로 줄었다. **앞 항목의 "v2 가 크게 나빠졌다"는 서술은 과장이었다**(잣대 오류가 부풀린 값).

### 결론 — 단일 LLM 판정으로 이 경계는 안 잡힌다 (근거 3건)
| 시도 | 실패 양상 |
|---|---|
| v1 1차 | `system` 을 **한 번도** 안 고름 |
| v1 2차 | `meta` 과흡인 — 작성 방법론까지 빨아들임 |
| v2 | **'구체적인가'** 라는 새 구멍 — 근거가 전부 *"provides concrete instruction"* |

세 번 모두 **프롬프트가 명시한 표면 속성에 모델이 달라붙었다.** 여기에 temp=0 인데도 경계 카드는 실행마다 흔들린다. 네 번째 프롬프트는 네 번째 구멍을 만들 공산이 크다.

### 채택 — 2층 구조 (LLM 다수 + 사람 소수)
```
LLM 분류 170장  →  사람 override 17장  →  DB(layer, layerSource)
     ↑                    ↑
 쉬운 다수           경계 소수(git 관리)
```
- 신규 `ingestion/layer_overrides.json` — 17건, 각 항목에 판정 근거 1줄
- `apply_overrides()` 가 **원본 LLM 판정을 `llmLayer` 에 보존** → 분류기 품질을 나중에도 채점 가능
- `metadata.layerSource` 에 `human|llm` 기록 → 사람 판정이 다음 배치에 조용히 덮이지 않는다
- `--apply-overrides` : LLM 호출 없이 override 만 재적용
- `--no-override` : 분류기 원본 품질 측정용

**⚠️ 파일 분리 원칙**: override(`ingestion/`)와 회귀 셋(`eval/`)은 **다른 파일**이다. 합치면 회귀 점수가 구조적으로 100% 가 돼 분류기 품질을 못 잰다. `layer_eval.py --from <배치출력>` 이 override 이전 원본을 채점하고, 테스트가 `len(override) < len(회귀셋)` 을 강제한다.

### 결과

| 지표 | 필터 없음 | v1 | v2 | **v2+override** |
|---|---:|---:|---:|---:|
| top-5 노이즈율(잣대 40장) | 22% | 8% | 12% | **2%** |
| 검색 풀 | 170 | 124 | 143 | **130** |
| 회귀 셋(분류기 원본) | — | 32% | **59%** | 59%(불변 — 원본 채점) |

남은 노이즈는 `Data Provenance Prompting` **1장**.

최종 분포: `user_instruction 130 · system 26 · meta 7 · degenerate 7` (미분류 0)

**변경 파일**
- 신규: `ingestion/layer_overrides.json`
- 수정: `ingestion/tag_layers.py`(override 적용·`layerSource`·`--apply-overrides`/`--no-override`) · `eval/layer_eval.py`(`--from`) · `tests/test_layers.py`(12→18)

**검증**: `pytest tests/ -q` → **89 passed** · override 17/17 적용 · 회귀 채점 원본 59% 유지(오염 없음)

**아직 안 한 것 — `is_searchable` 미배선**
DB 에 `layer` 가 있을 뿐 `retriever._load_collection` 은 여전히 전량을 읽는다. 위 2% 는 필터를 임시로 씌워 잰 값이고 **`/query` 동작은 무변경**이다. 배선 시 확인할 것:
- `min_score`·`fetch_k` 재교정(풀이 170→130 으로 줄면 점수 분포가 바뀐다)
- 리랭커 경로 포함 `run_eval` 정식 재측정(지금까지는 dense 단독 측정이다)
- `qa_set_realistic` 정답이 제외된 카드를 가리키는 경우가 없는지

---

## [2026-09-13] 평가셋 정합성 점검 — 층 필터 배선 전 확인 (측정만, 코드 무변경)
**목적**: 층 필터를 배선하면 제외된 40장을 정답으로 지목하는 평가 문항이 **구조적으로 Recall 0** 이 된다. 그러면 수치 하락이 필터 탓인지 검색 품질 탓인지 구분이 안 된다. 배선 전에 확인.

### ① 정답 충돌 — Recall 상한이 내려간다

| 평가셋 | Recall@5 **상한** (필터 없음 → 적용) | 정답 전멸 | 정답 일부 손실 |
|---|---|---:|---:|
| `qa_set_realistic` (59) | 1.000 → **0.935** (−6.5%) | **3문항** | 5문항 |
| `qa_set` (40) | 1.000 → 0.967 (−3.3%) | 1문항 | 2문항 |
| `multi_turn_set` (10) | 1.000 → 0.975 (−2.5%) | 0문항 | 1문항 |

현재 실측 R@5 가 0.763 이므로 **−6.5%p 는 무시할 수 없는 크기**다. 배선 후 재측정은 이 상한 변화를 함께 보고하지 않으면 해석 불가다.

⚠️ `qa_set_realistic`·`qa_set` 의 `relevant` 는 **기법명이 아니라 `chunk_id`**(`pdf_001`…)다. 이름으로 대조하면 "충돌 0건"이라는 잘못된 결론이 나온다(실제로 1차에 그렇게 나왔다).

### ② 영향받는 문항은 성격이 다르다 — 스코프 불일치

`qa_set_realistic` 에서 영향받는 5문항:
| 질의 | 정답(제외됨) |
|---|---|
| 계산기랑 검색을 써가면서 풀어줘 | ReAct · Tool-Use (전멸) |
| 프롬프트 주입 공격을 막게 방어적으로 짜줘 | Injection Defense · Instruction Hierarchy (전멸) |
| 이 데이터로 비슷한 샘플 데이터를 더 만들어줘 | Synthetic Data Generation (전멸) |
| 내 프롬프트를 더 좋게 다듬어줘 | Meta-Prompting (일부) |
| 여러 문서를 종합해서 충돌하는 정보는 짚어줘 | Conflict Resolution (일부) |

**나머지 54문항은 일반 작업 질의다**("이 회의록을 핵심만 세 줄로 줄여줘"·"이 코드 어디가 문제인지 봐줘"). 위 5개만 **프롬프트 엔지니어링·시스템 기능 자체**를 묻는다.

🟩 **팀이 상정한 사용자 분포로 판정**: `gen_set`(18) · `uplift_set`(8) 전량이 일반 작업 요청이다 — 마케팅 문구·채용 공고·코드리뷰·회의록 요약·환불 이메일·여행 일정표·번역·"글 써줘". **도구 사용·주입 방어·합성 데이터·지시 우선순위를 묻는 질의는 0건.**
→ 층 경계는 `gen_set`/`uplift_set` 분포와 **일치**하고, 어긋나는 것은 `qa_set_realistic` 의 5문항이다.

### ③ 🔴 더 큰 문제 — 커버리지 37%

```
코퍼스 170장 중 정답으로 한 번이라도 지목된 카드 : 63장 (37%)
한 번도 지목되지 않은 카드                      : 107장
  그중 검색 대상(user_instruction)             : 74장  ← 평가셋이 못 보는 구간
```

검색 대상 130장 중 **74장(57%)이 한 번도 측정되지 않는다.** 미측정 예: `Specificity Prompting` · `Self-Ask` · `Plan-and-Solve` · `Cognitive Verifier` · `Instruction-First` · `Style Imitation`.
→ CORPUS_STRATEGY §2-3 의 지적(*"정답이 134청크 기준이라 신규 56기법을 겨냥한 문항이 없다"*)이 **수치로 확인**됐다. 층 필터와 무관하게 **현재 모든 검색 수치는 코퍼스의 37%만 본 값**이다.

### 제안 (미실행 — 결정 필요)
1. `qa_set_realistic`·`qa_set` 에 `scope` 필드 추가 → 위 문항을 `out_of_scope` 로 **표시**(삭제 금지, 스코프가 바뀌면 되살려야 함)
2. `run_eval` 이 **전체·in-scope 두 수치를 병기** + Recall 상한을 함께 출력
3. 커버리지 37% → 미측정 74장을 겨냥한 문항 추가. 이게 없으면 층 필터의 실효도 절반만 보인다

**코드 변경 없음. 측정만 수행.**

---

## [2026-09-13] 평가셋 확장 — 커버리지 50%→94% · 🔴 **기존 수치가 코퍼스의 쉬운 절반만 본 값이었다**
**목적**: 검색 대상 카드의 절반이 어떤 평가 문항에도 안 걸린다는 문제(앞 항목 ③)를 해소.

### 생성기 (`eval/gen_qa_set.py`)
미커버 카드마다 *"그 기법이 도움이 될 상황에서 사용자가 칠 법한 작업 요청"* 을 생성.

★ **핵심 위험은 어휘 누수다.** 카드를 보고 질의를 만들면 카드 어휘가 새어 들어가 검색이 '의미'가 아니라 '표면'으로 맞고 점수가 부풀려진다(2026-08-15 진단: *"맞히는 케이스는 전부 어휘 중첩"*). 방어 2겹:
1. 프롬프트가 기법명·카드 표현 사용을 금지하고 **운영 분포**(gen_set·uplift_set 말투)를 기준으로 준다
2. `leak_score()` 로 질의↔카드 어휘 중첩을 **측정**해 표시 → 사람이 그 목록만 보면 된다

🟩 **누수 방어가 실제로 작동했다**: 평균 0.068 · 0.5 이상 1개. 그리고 지표가 잡아낸 상위 항목은 실제로 새어 있었다 — `"…조건과 예외를 알려줘"`(Boundary Condition) · `"…품질 기준 충족 여부"`(Quality Gate) · `"…없으면 not found"`(Give the Model an Out). 0.35 이상 4건에 `review` 표시.

### 부수 성과 — 층 오분류 7건이 추가로 드러났다
커버리지 생성 대상(=검색 대상)에 있으면 안 될 카드가 섞여 있었다. 전부 `layerSource=llm`(override 미적용):
| 카드 | v2 | 판정 | 근거 |
|---|---|---|---|
| Prompt Generator Pattern | user_instruction | **meta** | "바로 복붙 가능한 최종 프롬프트를 생성하라" — 딸깍 그 자체 |
| Request Normalization | user_instruction | **meta** | 요청을 표준 스키마로 정규화 — 딸깍 전처리 |
| Data Provenance | user_instruction | **system** | source_id·source_url |
| Adversarial Prompt Detector | user_instruction | **system** | 주입 탐지 |
| Few-shot learning / Knowledge generation / Prompt leaking | user_instruction | **degenerate** | **Prompt Template 이 아예 빈 카드** |

→ override 17 → **24건**. 분포: `user_instruction 123 · system 28 · degenerate 10 · meta 9`.
⚠️ v2 의 degenerate 회피가 여기서도 나왔다 — **PT 가 빈 카드 3장이 user_instruction 이었다.**

### 커버리지

| | 검색 대상 123장 기준 |
|---|---|
| 종전(`qa_set_realistic` + `qa_set`) | 62장 = **50%** |
| + `qa_set_coverage.json`(54문항) | 116장 = **94%** |
| 남은 미측정 | 7장(쿼터 소진으로 생성 실패) |

### 🔴 핵심 발견 — 통제 비교

같은 리트리버·같은 지표·**같은 단일정답 조건**으로 맞췄다:

| 평가셋 | n | Hit@1 | Recall@5 |
|---|---:|---:|---:|
| `qa_set_realistic` 전체 | 59 | 0.644 | 0.723 |
| `qa_set_realistic` **단일정답 문항만** | 22 | 0.773 | **1.000** |
| `qa_set_coverage` (전부 단일정답) | 54 | 0.130 | **0.296** |

**정답 개수라는 교란을 제거해도 1.000 vs 0.296 이다.** 차이는 오직 **어떤 카드를 재느냐**다.
→ **지금까지의 R@5 0.763 은 평가셋 작성자가 문항을 쓸 수 있었던 '쉬운 카드' 위에서 나온 값이다.** 한 번도 측정되지 않던 구간에서는 검색이 훨씬 못 한다.

### ⚠️ 0.296 은 하한이다 — 라벨 품질 한계
- 미적중 38문항 중 **9문항(24%)** 은 top1 이 정답 카드와 **축을 공유**해 공동정답일 수 있다
- 실제로 라벨이 틀린 사례: `"매출 데이터를 표로 정리해줘"` 정답=`Embedding Data` / top1=`Table Transformation Prompting` ← **top1 이 더 맞다**
- 공동정답을 인정하면 대략 **0.30 ~ 0.47** 구간. 그래도 1.000 과의 격차는 남는다
- `qa_set_coverage` 라벨은 **LLM 생성**이라 `qa_set_realistic` 의 사람 라벨과 같은 급이 아니다. 두 셋 수치를 직접 비교하지 말고 각각의 추이로 볼 것

**변경 파일**
- 신규: `eval/gen_qa_set.py` · `eval/qa_set_coverage.json`(54문항)
- 수정: `ingestion/layer_overrides.json`(17→24건)

**남은 일**
1. 미측정 7장 생성(쿼터 회복 후) — Context-Aware Delimiters · Diff/Patch Format · Instruction Conflict Resolution · Iterative Query Analysis · Response Rules Section · Avoid Over-Incentivization · Avoid Conflicting Tool-Call
2. **공동정답 라벨링** — 단일정답이라 Recall 이 과소평가된다
3. 누수 `review` 4건 사람 확인
4. 이 셋을 기준선으로 층 필터 배선 전후 비교

---

## [2026-09-13] 기존 튜닝 결정 전면 재확인 — 신규 커버리지셋 + 기존셋 대조
**목적**: 기존 결정(`fetch_k`·리랭커·하이브리드·멀티표현)은 전부 `qa_set_realistic`(코퍼스의 쉬운 절반) 위에서 내려졌다. 커버리지 97% 셋이 생겼으니 **두 셋을 대조**해 각 결정이 여전히 서는지 본다.

### 결과 요약

| 결정 | 문서 근거 | 기존셋 재측정 | 신규셋 | 판정 |
|---|---|---:|---:|---|
| `use_reranker=True` | 2026-08-15 *"이득 0.025는 노이즈, 제거 검토"* | R@5 **+4.0pp** | R@5 **+12.3pp** | ✅ **유지 — 제거 계획 철회** |
| `use_hybrid=False` | *"한국어 코퍼스에서 악화"* | **−7.0pp**(재현) | +8.8pp | ✅ **유지**(신규셋 이득은 아티팩트, 아래) |
| `fetch_k=20` | 2026-07-05 스윕 파레토 최적 | **10이 최고**(0.777) | **50이 최고**(0.474) | 🔴 **근거 소멸** |
| `embedding_views` | dense Hit@1 +6.8pp | **+6.8pp 정확 재현** | rerank +3.5pp | ✅ 유지 |

### ⭐ 리랭커 — 제거 계획을 철회한다
| | dense | +rerank | Δ |
|---|---:|---:|---:|
| `qa_set_realistic` R@5 | 0.723 | 0.763 | +4.0pp |
| `qa_set_coverage` R@5 | 0.298 | **0.421** | **+12.3pp** |

**어려운 구간에서 이득이 3배 크다.** 쉬운 문항은 dense 로도 맞고, 리랭커는 **어려운 문항에서 일한다** — 그런데 지금까지의 평가셋은 쉬운 문항만 있었으니 리랭커가 하는 일이 안 보였다.
2026-08-15 의 *"리랭커 로짓 0.0000 · 이득 0.025 노이즈"* 판단은 `multi_turn_set` gold(10항목, **스스로 미검증이라 명시**)에 기반했다. 제대로 된 두 셋 모두에서 리랭커가 이긴다. → **리랭커 제거/조건부화 백로그를 내린다.**

### hybrid — 신규셋의 이득은 생성 아티팩트다
| | dense | +hybrid |
|---|---:|---:|
| `qa_set_realistic` | 0.723 | **0.653 (−7.0pp)** |
| `qa_set_coverage` | 0.298 | **0.386 (+8.8pp)** |

두 셋이 **반대 부호**다. 원인 확인:
```
hybrid 가 살린 문항  6개  평균 어휘누수 0.130   ← 전체 평균의 2배
hybrid 가 깬 문항    1개  평균 어휘누수 0.000
변화 없음           50개  평균 어휘누수 0.060
전체 평균 누수 0.066
```
→ BM25 가 **생성 질의와 원본 카드의 어휘 중첩**을 파먹은 것이다. `gen_qa_set.py` 의 누수 방어가 평균 0.066 까지 낮췄지만 0 은 아니고, BM25 는 그 잔량에 민감하다.
⚠️ **LLM 생성 평가셋으로 어휘 기반 기법(BM25·키워드)을 평가하면 안 된다** — 구조적으로 부풀려진다. `use_hybrid=False` 유지.

### 🔴 `fetch_k=20` — 어느 셋에서도 최적이 아니다

| fetch_k | `qa_set_realistic` R@5 | `qa_set_coverage` R@5 | 지연 |
|---:|---:|---:|---:|
| 10 | **0.777** | 0.386 | 1.2s |
| **20 (현재)** | 0.763 | 0.421 | 2.0s |
| 50 | 0.763 | **0.474** | 4.5s |

- 2026-07-05 스윕(*"10은 Recall@5 −4.5%p"*)은 **108~134청크 시절** 값이다. 지금(170청크 + `embedding_views`) 기존셋에서 10이 오히려 +1.4pp 로 **뒤집혔다.**
- 두 셋이 **반대 방향**을 가리킨다: 쉬운 문항은 좁은 후보(노이즈 적음)가, 어려운 문항은 넓은 후보(정답이 dense 하위에 있음)가 유리하다.
- 20 은 **양쪽 어디에서도 최적이 아닌 중간값**이다.
- 🟩 주목: 기존셋에서 20 과 50 의 R@5·NDCG 가 **완전히 동일**(0.763/0.677). 즉 **20→50 은 쉬운 구간 손실 0, 어려운 구간 +5.3pp, 비용은 지연 2.2배.**
- ⚠️ `fetch_k` 는 BM25 를 안 쓰므로 위 어휘누수 아티팩트의 영향은 없다(단 신규셋 라벨 자체의 한계는 남는다).

### 멀티표현 인덱싱 — 유지, 그리고 측정 체계 건전성 확인
| | 뷰 없음 → 있음 |
|---|---|
| `qa_set_realistic` dense Hit@1 | 0.576 → 0.644 (**+6.8pp**) |
| `qa_set_realistic` rerank | −1.7pp / R@5 동일 |
| `qa_set_coverage` rerank | **+3.5pp / +1.8pp** |

🟩 문서에 기록된 **+6.8pp 가 소수점까지 정확히 재현**됐다. 리랭커 경로에서 상쇄된다는 서술도 재현. **측정 체계가 건전하다는 방증**이고, 위 다른 결정들의 뒤집힘이 측정 오류가 아님을 뒷받침한다.
신규셋에서는 반대로 **리랭커 경로에서 이득**이 난다 → 유지.

### 결론
- 즉시 반영: **리랭커 제거 백로그 철회**(근거 뒤집힘)
- 판단 필요: `fetch_k` 20 → 50 (어려운 구간 +5.3pp vs 지연 2.2배). `/query` end-to-end 는 LLM 이 지배(~19s)하므로 +2.5s 는 약 13%
- 유지: `use_hybrid=False` · `embedding_views`
- 폐기 대기: `min_score=0.40`(이미 사문화 — dense 최소 0.421)

**측정만 수행. 코드·설정 변경 없음.**

---

## [2026-09-13] `fetch_k` 20 → 50 적용
**목적**: 앞 항목의 재확인 결과 반영. 종전 20 의 근거(2026-07-05 스윕)는 108~134청크 시절 값이라 현 코퍼스(170청크 + `embedding_views`)에서 성립하지 않는다.

**Before / After** (운영 기본값, `--rerank`)

| 평가셋 | fetch_k=20 | **fetch_k=50** | Δ |
|---|---:|---:|---:|
| `qa_set_realistic` R@5 | 0.763 | **0.763** | ±0 |
| `qa_set_realistic` NDCG@5 | 0.677 | **0.677** | ±0 |
| `qa_set_coverage` R@5 | 0.421 | **0.474** | **+5.3pp** |
| `qa_set_coverage` NDCG@5 | 0.361 | **0.387** | +2.6pp |
| 검색 지연 | ~2.0s | **~5.0s** | **2.5배** |

**쉬운 구간 손실 0, 어려운 구간 +5.3pp, 비용은 지연뿐.** `/query` end-to-end 는 LLM 이 지배(~19s)하므로 +3s 는 약 16%.
⚠️ 지연은 스윕 당시 4.5s 보다 높게 나왔다(5.0s) — 측정 시 머신 부하 차이. **3s 안팎의 증가로 보되 운영 관측 필요.**

**변경 파일**
- `app/rag/retriever.py` — `fetch_k` 기본값 20 → 50
- `app/main.py` — 운영 인스턴스 `fetch_k=50` + 근거 표 주석(두 셋 대조 결과·리랭커 유지 근거)
- `RAG_PIPELINE.md` — §1-[B2]·§3 표·§4 갱신, §0 다이어그램과 본문의 `20` 표기 전부 동기화(후보 50개 · `argsort(-dense)[:50]` · 리랭커 50쌍)

**검증**
- `pytest tests/ -q` → **89 passed**
- 코드 기본값 확인: `main.retriever.fetch_k == 50`, `Retriever.__init__` 기본값 50
- 변경 후 실측이 스윕 예측과 일치(위 표)

**함께 기록 — 리랭커 제거 백로그 철회**
`RAG_PIPELINE.md` §4 에 반영. 2026-08-15 의 *"이득 0.025 노이즈"* 는 미검증 gold 10항목 기반이었고, 두 평가셋 모두에서 뒤집혔다(기존셋 +4.0pp · 신규셋 **+12.3pp**). 어려운 구간일수록 이득이 크다 — 쉬운 문항만 있던 평가셋이라 안 보였던 것.

**남은 튜닝 항목**
- `min_score=0.40` 폐기(이미 사문화 — dense 최소 0.421). 층 필터 배선과 함께 처리
- `example_min_score=0.40` — 예시 코퍼스 기준으로 잰 적 없는 임시값
- `fetch_k` 는 **코퍼스가 바뀌면 다시 재야 한다**(이번이 그 사례)

---

## [2026-09-13] 운영 결함 3건 — /index 무인증 · LLM 타임아웃 부재 · 평가 judge 전멸
**목적**: RAG 서버 자체의 개선점을 코드로 훑어 나온 것들. 셋 다 독립이고 기능 변경이 아니다.

### 🔴 ① `/index` 가 무인증이었고 포트가 외부로 열려 있었다

- `.env` 14행의 `RAG_INDEX_API_KEY` 가 **주석 처리**돼 런타임에 미설정이었다.
- `main.py` 는 이 경우 **경고만 찍고 허용**했다(`if not _INDEX_API_KEY: return`).
- `docker-compose.yml` 은 rag-server 를 `"8000:8000"` 으로 **모든 인터페이스**에 게시했다. (mysql 만 `127.0.0.1:3306:3306` 으로 묶여 있었다.)

→ 같은 네트워크의 누구나 임의 청크를 코퍼스에 넣을 수 있었고, 주입된 청크는 이후 모든 요청에서 `[참고 기법]` 으로 생성 LLM 에 들어간다. **프롬프트 인젝션 경로**다.

**조치 — fail-closed 로 전환**
| 상태 | 종전 | 변경 |
|---|---|---|
| 키 미설정 | 경고 후 **허용** | **503**(엔드포인트 비활성) |
| 키 설정 + 헤더 없음/불일치 | 403 | 403 (동일) |
| 키 설정 + 헤더 일치 | 200 | 200 (동일) |

저장소 전체에서 `/index` 를 호출하는 코드는 **없다** — 모든 적재는 `ingestion/*` 이 DB 에 직접 쓴다. 따라서 막아도 깨지는 경로가 없고, '키를 깜빡함'이 곧 '노출'이 되지 않는 쪽이 옳다.
compose 는 `127.0.0.1:8000:8000` 으로 변경. 백엔드는 컨테이너 네트워크(`http://rag-server:8000`)로 부르므로 게시 포트는 로컬 디버깅용일 뿐이다.

⚠️ **backend 의 `"8080:8080"` 은 건드리지 않았다** — 브라우저가 직접 호출하므로 바인딩을 바꾸면 데모 구성이 깨질 수 있다. 다만 `/api/prompts/improve` 가 게스트 무제한인 기존 P0 와 함께 보면 같은 성격의 노출이다.

### 🔴 ② LLM 호출에 타임아웃이 없었다
`generator.py` · `analyzer.py` · `query_transform.py` 어디에도 `timeout` 이 없어, 제공자가 응답하지 않으면 **스레드가 무한 대기**했다. FastAPI 는 `def` 엔드포인트를 스레드풀(기본 40)에서 돌리므로 제공자가 느려지면 스레드가 쌓여 서버가 멎는다. 백엔드는 75s WebClient 타임아웃이 있어 사용자에겐 에러가 가지만 **rag-server 스레드는 계속 잡혀 있었다** — 백엔드에서는 2026-08 에 고쳐진 결함이 여기만 남아 있었다.

신규 `app/core/timeouts.py` 에 예산을 모았다(환경변수 오버라이드 가능).
| 상수 | 값 | 적용 |
|---|---:|---|
| `FAST_SECONDS` | 20s | analyzer · query_transform (짧은 프롬프트, 실패해도 폴백 있음) |
| `GEN_SECONDS` | 45s | generator Groq |
| `GEN_MILLIS` | 45000ms | generator Gemini (google-genai 는 ms 단위) |

검색 5s + 분석 20s + 생성 45s = 70s 로 백엔드 75s 안에 들어온다. ⚠️ 재시도·폴백까지 겹치면 초과할 수 있는데 그건 남은 한계다 — **여기서 막으려는 건 '느림'이 아니라 '영원히 안 끝남'** 이다.

### 🔴 ③ 평가 judge 경로가 전부 퇴역 모델을 쓰고 있었다
uplift_eval 만 문제인 줄 알았는데 **4개 스크립트 전부**였다. 근본 원인은 **모델 기본값이 네 곳에 중복**된 것 — 2026-08-21 Groq 가 llama-3.x 를 폐기했을 때 `generator.py` 만 갱신되고 나머지가 드리프트했다.

| 파일 | 종전 | 영향 |
|---|---|---|
| `uplift_eval.py` | `llama-3.3-70b-versatile` / `gemini-2.0-flash` | target·judge 404 → **uplift 축 실행 불가** |
| `gen_eval.py` | `llama-3.3-70b-versatile` | judge 404 |
| `halluc_eval.py` | `llama-3.3-70b-versatile` | judge 404 |
| `run_multi_turn_eval.py` | uplift 우회용 자체 표인데 groq 항목이 같은 폐기 모델 | 우회가 반쪽 |

**조치**: `generator.default_model(backend)` 공개 헬퍼를 단일 출처로 두고 네 곳이 전부 이를 쓴다. 다음 모델 교체 때 **한 줄만 고치면 된다.**
검증: 네 스크립트 모두 `openai/gpt-oss-120b`(groq) / `gemini-flash-latest`(gemini) 로 해소됨.

⚠️ **남겨둔 것**: `multi_turn_eval.py:460` `analyzer_model="llama-3.1-8b-instant"` 는 순수 함수의 **캐시 키 라벨**(실제 호출 아님)이다. 바꾸면 쿼터를 들여 쌓은 기존 측정 캐시가 무효화되므로 손대지 않았다. 라벨이 실제 모델과 다르다는 점만 기록한다.

**변경 파일**
- 신규: `app/core/timeouts.py`
- 수정: `app/main.py`(fail-closed) · `../docker-compose.yml`(루프백) · `app/rag/{generator,analyzer,query_transform}.py`(타임아웃) · `app/rag/generator.py`(`default_model`) · `eval/{uplift_eval,gen_eval,halluc_eval,run_multi_turn_eval}.py`

**검증**: `pytest tests/ -q` → 89 passed · `/index` 세 상태(503/403/200) 실동작 확인 · 클라이언트 timeout 속성 실측(20.0 / 20.0 / 45.0)

**남은 것**(이번에 안 함)
- 컬렉션 캐시 — 요청당 236ms 를 DB+JSON 파싱에 쓴다(기법 170ms + 예시 66ms). 지금은 리랭커에 가려 있지만 축 라우팅 후 병목이 된다
- `/health` 심화 — DB·모델 상태를 안 봐서 compose healthcheck 가 거짓 안심을 준다
- `requirements.txt` 전부 `>=` — 재현성 위험. 이미 모델 폐기로 한 번 전면 장애를 겪었다
- 리랭커 지연 로드 경합(`self._reranker`) — 동시 요청 시 모델 2중 로드 가능

---

## [2026-09-13] 🔴 분석기가 2026-08-21 이후 줄곧 조용히 죽어 있었다 (gen_eval 기준선 재수립 시도 중 발견)
**목적**: judge 모델 복구 후 `gen_eval` 로 생성 기준선을 다시 잡으려 했다. **기준선은 못 잡았고(쿼터 소진), 대신 더 큰 것을 찾았다.**

### ① 🔴 `analyzer` 가 사실상 전 요청에서 실패하고 있었다

`gen_eval` 18문항 중 **16건**에 `[Analyzer] 분석 실패` 가 찍혔다. 쿼터 문제로 보였지만 아니었다.

```
400 json_validate_failed  ·  failed_generation: ''
```

원인은 `tag_axes`(200→204)·`tag_layers`(700→9건 실패)에서 이미 두 번 본 **같은 버그**다.
`gpt-oss` 계열은 최종 JSON 앞에 **추론 토큰**을 먼저 쓰는데, 분석기의 시스템 프롬프트(2,917자)에서 기본 추론량이 완료 토큰 **~1,259** 라 `max_tokens=700` 이 먼저 소진된다.

| max_tokens | 결과 | 완료 토큰 |
|---:|---|---:|
| 700 (종전) | ❌ 400 json_validate_failed | — |
| 1500 | ✅ | 1259 |
| 3000 | ✅ | 1300 |

**왜 여태 몰랐나**: `analyze()` 가 예외를 삼키고 `None` 을 돌려준다(무회귀 폴백). 서버는 200 을 내고 파이프라인은 "분석 없이" 진행한다 — **에러 없이 조용히 2단계가 1단계로 퇴화**한 채 2026-08-21 모델 교체 이후 계속 돌아왔다. 그 무회귀 설계가 장애를 은폐한 셈이다.

**영향**
- 규약 v3 의 2단계 파이프라인이 **1단계로 동작** — 필드/빈칸/질문 구조가 생성기 단독 판단에 의존
- `techniqueAxes` 가 생성되지 않음 → **축 라우팅의 입력이 아예 없었다**
- 2026-08-21 WORKLOG 의 "analyzer 가 되살아나 되물음" 검증은 이 관점에서 **재확인 필요**
- mode 정확도 0.83(2026-07-31) 은 분석기가 살아 있던 시절 값이라 **현재 상태를 대표하지 않는다**

**조치 — 예산만 올리면 안 된다**
Groq 는 '입력 + 출력예약'을 합산해 한도를 잡는다. `max_tokens=1500` 이면 요청당 ~3,100 토큰을 예약해 TPM 8000 에서 **분당 2회**가 한계가 된다. 추론량 자체를 줄이는 것이 옳다.

| `reasoning_effort` | 완료 토큰 | 합계 |
|---|---:|---:|
| (기본) | 1259 | 2901 |
| **low (채택)** | **198** | **1840** |
| medium | 1500 | 3142 |
| high | 실패 | — |

→ `_REASONING_EFFORT="low"` + `_MAX_TOKENS=1000`. 멀티턴(history 포함)에서도 완료 316~447 로 안정.
검증: `analyze("제주도 여행 블로그 글 써줘…")` → `taskType=글쓰기/블로그`, fields 2개 정상 반환.

⚠️ 남은 것: `"글 써줘"` 는 모델이 `fields: []` 를 돌려준다(API 는 성공). 프롬프트에는 *"글 써줘 → 주제 = empty"* 라고 적혀 있으니 프롬프트 준수 문제다. 프롬프트 수정은 라이브 3회 A/B 가 필요하므로 이번엔 손대지 않았다.

### ② `gen_eval` 이 운영과 다른 구성을 재고 있었다
`--no-hyde` 기본값이 **HyDE on** 이었다(`use_hyde = not args.no_hyde`). 운영은 2026-07-30 재평가 이후 **off** 다. HyDE 는 R@5 를 0.763→0.441 로 떨어뜨리므로, **그동안의 생성 평가는 운영보다 훨씬 나쁜 검색 위에서 측정된 값**이다.
→ 기본값을 off(운영 파리티)로 바꾸고 `--hyde` 로 옵트인. `--no-hyde` 는 하위호환 no-op.

### ③ 기준선은 못 잡았다 — 쿼터 소진
```
Gemini: ⛔ 일일 한도 초과
Groq  : 429 → Gemini 폴백 → 위 한도
18문항 중 완주 2건 · judge 전량 N/A
```
오늘 하루에 층 분류 2회(340) + 질의 생성(68) + 각종 파일럿(~50) + gen_eval 2회를 돌려 TPD 를 소진했다.

**재개 방법**(쿼터 회복 후)
```bash
python3 -m eval.gen_eval --sleep 8 --cache-file eval/.gen_cache_20260913b.json
```
생성 캐시가 있어 중단 지점부터 누적된다. TPD 가 빠듯하면 `--no-judge` 로 결정론 지표(mode_accuracy·structured)만 먼저 잡을 수 있다.
⚠️ **분석기 수정 이전 캐시는 쓰지 말 것** — 그 시점 생성은 `analysis=None` 상태의 결과다. 이번에 `.gen_cache_20260913.json` 을 폐기하고 `...b.json` 으로 새로 시작한 이유다.

**변경 파일**: `app/rag/analyzer.py`(예산·reasoning_effort) · `eval/gen_eval.py`(HyDE 기본값)
**검증**: `pytest tests/ -q` → 89 passed · `analyze()` 라이브 정상 반환 확인

**후속 확인 필요**
- `generator`(gpt-oss-120b)도 같은 추론 토큰 특성을 갖는다. `_fit_max_tokens` 가 동적 산정이라 즉사는 없었고 `structured` 폴백도 0회였지만, `reasoning_effort` 적용 시 TPM 여유가 커진다 → A/B 대상
- `query_transform` 의 `max_tokens` 120/300 도 같은 위험. 기본 off 라 운영 영향은 없으나 켜면 실패할 것

---

## [2026-09-13] `query_transform` 도 같은 예산 버그 — 두 함수 모두 조용히 무효였다
**목적**: 분석기와 같은 원인이 `query_transform` 에도 있는지 확인(기본 off 라 운영 영향은 없지만 켜면 실패).

### 실측 — 현행 설정에서 `content` 가 빈 문자열로 온다
| 함수 | 종전 예산 | 완료 토큰 | content | 결과 |
|---|---:|---:|---:|---|
| `transform()` | 120 | 120 | **0자** | `return query` (무효) |
| `hyde()` | 300 | 300 | **0자** | `return query` (무효) |

추론 토큰이 예산을 전부 먹고 본문이 한 글자도 안 나온다. **두 함수 모두 2026-08-21 모델 교체 이후 아무 일도 하지 않고 토큰만 태우고 있었다.**

### ⚠️ 증상이 analyzer 와 다르다 — 더 조용하다
| | analyzer · tag_axes · tag_layers | query_transform |
|---|---|---|
| `response_format` | `json_object` | **없음(평문)** |
| 예산 부족 시 | `400 json_validate_failed` (예외) | **빈 문자열**(정상 응답) |
| 로그 | `[Analyzer] 분석 실패 …` 남음 | **아무것도 안 남음** |

`except` 로도 안 잡힌다 — 정상 200 응답에 내용만 없기 때문이다. `if out else query` 폴백이 그대로 흡수한다. **"실패해도 검색이 안 끊긴다"는 무회귀 설계가 오늘만 두 번째로 장애를 은폐했다.**

### 조치
예산 증액이 아니라 추론량 감축(Groq 는 입력+출력예약 합산으로 TPM 을 잡는다).
```
_REASONING_EFFORT      = "low"
_TRANSFORM_MAX_TOKENS  = 600   # 실사용 117
_HYDE_MAX_TOKENS       = 800   # 실사용 112 (출력 3~5문장이라 여유 더 둠)
```
검증: `transform()` → `"여행 블로그, 제주도, 가족 여행, 3박 4일 일정, …"` · `hyde()` → `"…\nTechnique: **Audience & Context…"` 정상 반환.
낡은 모듈 docstring(`llama-3.1-8b-instant`)도 현 모델로 정정.

### 🔴 측정 이력에 미치는 함의 — HyDE 기각 근거의 유효 범위
HyDE 기각 측정(2026-07-30, R@5 0.763→0.441)은 **`llama-3.1-8b-instant` 기준**이다. 2026-08-21 교체 이후 HyDE 는 **무효(원본 그대로 반환)** 였으므로, 그 이후 HyDE 를 켜고 잰 수치가 있다면 그건 "HyDE 효과"가 아니라 **baseline 그 자체**다.
- 오늘 `gen_eval` 의 HyDE 기본값 on 문제(직전 항목)와 겹쳐서 봐야 한다 — 그 구성으로 잰 값은 "HyDE 적용"이 아니라 "HyDE 가 무효인 baseline"이었다. 즉 **검색 구성은 운영과 같았고**, 문제는 표기가 틀렸다는 쪽이다.
- HyDE 기각 결론 자체는 유지한다(형태 정렬이 변별력을 떨어뜨린다는 이유는 모델 무관). 다만 **현 모델에서는 한 번도 측정된 적이 없다**는 점을 명시해 둔다.

### 남은 예산 위험 전수 확인
| 위치 | 상태 |
|---|---|
| `generator.py` | `_fit_max_tokens` 동적 산정(상한 4096) — 즉사 없음, `structured` 폴백 0회. 다만 추론 토큰이 출력 예산을 갉아먹으므로 `reasoning_effort` 적용 시 TPM 여유↑ → **A/B 대상**(생성 품질에 영향) |
| `ingestion/gen_examples.py` (2200) · `ingest_knowledge.py` (4096) | Gemini 경로·큰 예산이라 위험 낮음 |
| `analyzer` · `query_transform` · `tag_axes` · `tag_layers` | ✅ 이번에 전부 수정 |

**교훈**: 2026-08-21 모델 교체는 이름만 바꾸면 되는 작업이 아니었다. **비추론 모델 기준으로 잡힌 토큰 예산이 네 곳에 남아 있었고, 그중 둘은 에러조차 내지 않았다.** 모델 계열이 바뀌면 예산을 전수 재검토할 것.

**변경 파일**: `app/rag/query_transform.py`
**검증**: `pytest tests/ -q` → 89 passed · 두 함수 라이브 정상 반환 확인

---

## [2026-09-13] generator `reasoning_effort` A/B — **미완(쿼터 소진)** · 대신 용량 한계를 규명
**목적**: `analyzer`·`query_transform` 에서 효과를 본 `reasoning_effort="low"` 를 생성기에도 적용할지 A/B 로 판정.

### 결과: A/B 를 돌리지 못했다
```
Groq  TPD: Limit 200,000 · Used 197,202  (98.6% 소진, 리셋 ~46분)
Gemini   : 일일 한도 초과
```
16콜(4질의 × 2팔 × 2반복) 설계로 시작했으나 첫 요청부터 429. **오늘 측정 불가.**

### 구현은 완료 — 측정만 남았다
`GEN_REASONING_EFFORT` 환경변수 토글을 추가했다(`generator._gen_reasoning_effort`).
**기본값 미설정 = 현행 동작 그대로** — 측정 없이 기본값을 바꾸지 않는다. 생성은 analyzer 와 달리 추론량이 품질(모드 판정·기법 반영·원문 verbatim 보존)에 직결될 수 있다.

재개 방법(쿼터 회복 후):
```bash
python3 /…/scratchpad/ab_effort.py      # 같은 컨텍스트 고정 · 팔만 교체
# 또는
GEN_REASONING_EFFORT=low python3 -m eval.gen_eval --items 1,4,6,9,12,13,16,17 --sleep 50
```
⚠️ 팔별로 **캐시 파일을 분리**할 것 — 같은 캐시를 쓰면 B 팔이 A 팔의 생성을 재사용해 비교가 무의미해진다.

### 🔴 진단 중 나온 것 — 서비스 용량이 구조적으로 막혀 있다

A/B 가 왜 안 도는지 파다가 `_needs_long_context` 가 아니라 **요청 크기 자체**가 문제임을 확인했다.

| 항목 | 추정/실측 |
|---|---:|
| `SYSTEM_PROMPT`(생성) | **4,605 토큰** (6,715자) |
| 분석기 시스템 프롬프트 | 1,899 토큰 (2,917자) |
| 생성 요청 입력 실측 | 4,000~6,600 토큰 |
| `_fit_max_tokens` 출력 예약 | 1,203~1,951 |
| **요청당 TPM 점유** | **약 7,800 / 8,000** |
| **/query 1건 총 토큰** | **6,500~8,000** |

**함의**
1. **동시 사용자 1명이 한계다.** 생성 1건이 TPM 8,000 을 거의 다 쓰므로 두 번째 요청은 429 → Gemini 폴백 → Gemini 무료 RPD 20 → 곧 소진. **데모에서 두 명이 동시에 누르면 깨진다.**
2. **하루 약 28건이 상한이다** (TPD 200,000 ÷ ~7,000). 오늘 이 세션의 작업만으로 TPD 를 다 썼다.
3. `reasoning_effort` 의 이득은 **완료 토큰 쪽뿐**이다(생성 500~1,900 중 일부 절감). 지배적인 비용은 **입력**이고, 그 절반 이상이 `SYSTEM_PROMPT` 4,605 토큰이다. → **진짜 레버는 SYSTEM_PROMPT 축소**인데, 2026-07-31 에 한 번 시도했다가 회귀가 확인돼 되돌린 이력이 있다(그때는 토큰 절감이 목적이었고 품질이 깨졌다). 용량 관점에서 다시 볼 가치는 있다.

**우선순위 제안**: `reasoning_effort` A/B 보다 위 ①②가 먼저다. 데모 전에 최소한 **동시 요청 직렬화**(큐잉 또는 백엔드 단 동시성 1 제한)라도 두지 않으면, 심사 중 두 명이 동시에 누르는 순간 503 이 난다.

**변경 파일**: `app/rag/generator.py`(`GEN_REASONING_EFFORT` 토글, 기본 미설정)
**검증**: `pytest tests/ -q` → 89 passed · 토글 미설정 시 종전과 동일한 호출 인자

---

## [2026-09-15] LLM 구간 동시 실행 게이트 — 동시 요청 2건이면 반드시 깨지던 문제
**목적**: 2026-09-13 에 규명한 용량 한계(생성 1건이 Groq TPM 8,000 중 **~7,800** 점유)를 코드로 막는다. 데모에서 두 명이 동시에 누르면 서비스가 깨지는 상태였다.

### 종전 동작
```
요청 A ─ 생성(7,800 토큰 점유) ─▶ 성공
요청 B ─ 동시 도착 ─▶ Groq 429 ─▶ Gemini 폴백 ─▶ Gemini RPD 20 소진
                                     └─▶ 이후 두 백엔드 동시 차단, /query 가 503 만 반환
```
**두 번째 요청이 실패하는 것으로 끝나지 않고, 폴백 쿼터까지 태워 서비스 전체를 망가뜨린다.**

### 채택 — 줄을 세운다 (`app/core/concurrency.py`)
쿼터를 늘릴 수 없으면 429 로 실패해 폴백까지 태우는 것보다 **기다렸다 성공하는 편**이 낫다.

| 설정 | 기본값 | 근거 |
|---|---:|---|
| `RAG_MAX_CONCURRENT_GEN` | **1** | 생성 1건이 TPM 을 거의 다 씀 |
| `RAG_GEN_QUEUE_DEPTH` | **2** | 대기 2건 × ~20초 = 40초 |
| `RAG_GEN_QUEUE_WAIT` | **40초** | 백엔드 75초 − 검색 ~5초 − 생성 ~20초 |

⚠️ **셋은 따로 고르면 안 된다**: `대기상한 ≈ 줄길이 × 1건 처리시간`, 그리고 그 합이 백엔드 WebClient 타임아웃(75초)을 넘으면 안 된다. 줄을 늘리면 대기 상한도 같이 늘려야 하고, 그러면 75초에 부딪힌다.

### 설계 판단 3가지
1. **게이트는 LLM 구간만 감싼다**(`run_generation`). 검색·리랭크는 CPU/DB 작업이라 병렬로 둔다 — 게이트 안에 넣으면 5초짜리 검색이 줄을 막아 처리량이 반으로 준다.
2. **무한 대기 금지.** 백엔드가 75초에 끊으므로 그 안에 못 끝날 요청은 기다려 봐야 버려진다. 상한을 넘으면 503 으로 빨리 돌려준다.
3. **줄 길이도 제한 → 꽉 차면 즉시 거절.** 다 받아서 전원이 타임아웃 나는 것보다, 받을 수 있는 만큼만 받는 편이 낫다.

### 배선 위치
`run_generation` 안에 뒀다 — `/query` 와 eval 스크립트 6개(`gen_eval`·`uplift_eval`·`halluc_eval`·`run_multi_turn_eval`·`example_ab_eval`·`multi_turn_eval`)가 공유하는 **유일한 LLM 진입점**이라 여기 한 곳이면 전 경로가 덮인다. eval 은 단일 스레드라 게이트가 항상 비어 있어 동작 변화가 없다.

거절은 **503 + `Retry-After: 30`**. 503 은 기존 에러 계약(ADR-0008)과 같아 백엔드가 이미 `AI_SERVICE_UNAVAILABLE` 로 매핑한다(`PromptController:886`).
`/health` 에 게이트 상태를 노출했다 — 503 이 '서버 고장'인지 '줄이 길어서'인지 운영 중에 구분하려면 대기열을 볼 수 있어야 한다.

### 검증
- `tests/test_concurrency.py` **8개 신규** (LLM·DB 없이 스레드만으로): 동시 실행 상한 · limit>1 · 줄 참 시 즉시 거절 · 대기 상한 · **예외 시 슬롯 반납**(누수되면 서버가 영구히 막힌다) · 대기 카운터 복귀 · stats · 빈 슬롯은 줄 건너뜀
- **end-to-end**(LLM 만 가짜, 검색·게이트·엔드포인트는 실제 경로): 5건 동시 요청에서 **동시 생성 최대치 = 1**, 대기 카운터 0 복귀
- 거절 경로: 대기열 0 으로 좁혀 강제 → **503 + `Retry-After: 30`** 정상 반환
- `pytest tests/ -q` → **97 passed**

**변경 파일**: 신규 `app/core/concurrency.py` · `tests/test_concurrency.py` / 수정 `app/main.py`(게이트 배선 · `/health` · 낡은 `/index` 주석 정정)

**남은 것**
- 백엔드가 `Retry-After` 를 프론트로 전달하지 않는다 — 전달하면 "N초 후 자동 재시도" UX 가 가능하다(백엔드 변경이라 이번 범위 밖)
- 리랭커가 CPU 5초를 쓰는데 게이트 밖이라 동시 요청 시 CPU 경합이 난다. 지연이 늘 뿐 실패하지는 않지만, 부하가 보이면 별도 제한 검토
- 근본 해결은 쿼터 확대 또는 `SYSTEM_PROMPT`(4,605 토큰) 축소다. 게이트는 **깨지지 않게 막는 것**이지 처리량을 늘리지 않는다 — 여전히 **하루 약 28건**이 상한이다

---

## [2026-09-15] 백엔드가 `Retry-After` 를 프론트까지 전달하도록 (직전 항목 후속)
**목적**: rag-server 동시 실행 게이트가 `503 + Retry-After: 30` 을 내도록 했지만, 백엔드가 그 값을 버리고 있어 프론트까지 닿지 않았다.

### 끊겨 있던 지점 4곳
| # | 위치 | 문제 |
|---|---|---|
| ① | `ApiException` | 헤더를 실어 나를 수단이 없음(`ResponseStatusException.getHeaders()` 미사용) |
| ② | `GlobalExceptionHandler.build()` | 응답에 헤더를 붙이지 않음 |
| ③ | `PromptController` 의 `WebClientResponseException` 처리 | 상류 응답의 `Retry-After` 를 읽지 않음 |
| ④ | `SecurityConfig` CORS | `setExposedHeaders(List.of("Authorization"))` — **`Retry-After` 미노출** |

⚠️ **④가 특히 조용한 함정이다.** 헤더를 보내도 CORS 가 노출하지 않으면 브라우저 JS 는 값을 읽을 수 없다(CORS 는 기본적으로 소수의 안전 목록 헤더만 스크립트에 보여준다). ①②③만 고치면 서버 응답에는 헤더가 보이는데 프론트에서만 `null` 이 나와 원인을 찾기 어렵다.

### 변경
- `ApiException.retryable(status, code, message, seconds)` 추가. `getHeaders()` 오버라이드로 응답 헤더를 싣는다.
- `ApiException.retryAfterHeaders()` 가 **상류 값을 검증**한다 — 숫자만 허용(HTTP 날짜 형식은 규격상 유효하나 우리 상류는 초만 보내므로 거부), 음수 거부, **상한 3600초**. 상류가 비정상 값을 줘도 클라이언트를 한 시간 넘게 묶지 않는다.
- `GlobalExceptionHandler` 에 헤더를 받는 `build()` 오버로드 추가. 기존 호출부는 그대로 동작(무회귀).
- `PromptController.upstreamRetryAfter()` 로 상류 헤더를 꺼내 전달.
  · **한도 초과**(429·rate limit): 상류가 값을 안 줘도 재시도가 의미 있으므로 기본 30초를 붙인다.
  · **일반 장애**: 언제 복구될지 모르므로 **상류가 준 경우에만** 전달한다 — 모르는 값을 지어내면 거짓 안내가 된다.
- `SecurityConfig` 의 `exposedHeaders` 에 `Retry-After` 추가.

### 검증
- 신규 `RetryAfterPropagationTest`(6): 헤더가 응답까지 도달 · **에러 본문 계약(ADR-0008) 불변** · 값이 없으면 헤더를 붙이지 않음 · 비정상 값 거부(null·빈값·문자열·음수·HTTP 날짜) · 상한 3600 적용 · 정상 값·0 통과
- 신규 `RagRetryAfterExtractionTest`(3): **가정 검증** — `WebClientResponseException` 이 상류 응답 헤더를 실제로 들고 오는가. 컨트롤러 추출 로직은 한 줄이라 정작 위험한 건 이 가정이고, 틀리면 전달이 예외 없이 조용히 끊긴다.
- rag-server 쪽 재확인: 게이트 거절 시 `503 + Retry-After: 30` 실제 발급
- `./gradlew test` **BUILD SUCCESSFUL**(전체) · rag-server `pytest` 97 passed

**남은 것**: 프론트(확장·웹)가 아직 이 헤더를 읽지 않는다. 읽으면 "N초 후 자동 재시도" UX 가 가능하다 — 지금은 헤더가 도달할 뿐 사용자는 여전히 직접 눌러야 한다.

---

## [2026-09-15] 🔴 같은 버그 네 번째 — judge 가 조용히 빈 점수를 내고 있었다 · 측정 도구 전체 타임아웃 부재
**목적**: 분석기·쿼리변환이 살아난 뒤의 `gen_eval` 기준선을 잡는다. **기준선 측정 중에 도구 자체의 결함 2건을 또 찾았다.**

### ① 측정 도구 11곳에 LLM 타임아웃이 없었다 — 5시간 42분을 멈춰 있었다
2026-09-13 에 타임아웃을 넣은 것은 **운영 경로(`app/rag/*`)뿐**이었다. `eval/`·`ingestion/` 은 **자체 Groq/Gemini 클라이언트**를 만들어 쓰고 있었고 전부 타임아웃이 없었다.

실측 증상:
```
gen_eval 실행 5시간 42분 · 생성 캐시 13/18 에서 2시간 9분간 무진전
ESTABLISHED 소켓 4개 점유 · CPU 3분 32초(= 거의 전부 네트워크 대기)
```
응답이 오지 않는 연결을 무한정 붙들고 있었다. **예외가 나지 않으므로 `_retry` 도 못 잡는다.**
→ 8개 파일 11곳에 `app/core/timeouts.py` 의 `GEN_SECONDS`/`GEN_MILLIS` 적용.

### ② 🔴 judge 가 예외 없이 빈 점수를 반환하고 있었다 (같은 추론 토큰 버그, 네 번째)
`gen_eval._judge` 는 `max_tokens=300` 에 **`response_format` 도 없었다**(평문).
gpt-oss 계열이 추론 토큰으로 300 을 다 쓰고 `content` 가 빈 문자열로 오는데, `_loads_loose("")` 가 `{}` 를 돌려주므로 **예외도 로그도 없이** 모든 점수가 `None` 이 됐다.

| 발생 위치 | 모드 | 증상 |
|---|---|---|
| `tag_axes`(200) · `tag_layers`(700) · `analyzer`(700) | JSON 강제 | `400 json_validate_failed` — 시끄럽게 실패 |
| `query_transform`(120/300) · **`gen_eval._judge`(300)** | **평문** | **빈 문자열 → 조용히 무효** |

→ `reasoning_effort="low"` + `max_tokens=900` + **JSON 강제** 추가. 스모크 테스트에서 5개 축 전부 정상 수신 확인:
```
{'mode_fit': 5, 'technique_grounding': 3, 'instruction_form': 5,
 'intent_preservation': 5, 'faithfulness': 5, 'fabricated': False, 'reason': '…'}
```
같은 이유로 `gen_qa_set`·`tag_axes`·`tag_layers` 에도 `reasoning_effort="low"` 를 넣었다.

⚠️ **함의**: 어제 "judge 퇴역 모델을 고쳐 평가 축을 복구했다"고 기록했으나(2026-09-13), **모델만 고쳤지 judge 는 여전히 빈 점수를 내고 있었다.** 그 시점 이후의 judge 기반 수치는 전부 N/A 였다.

### 교훈 — 무회귀 폴백이 장애를 은폐한다 (누적 3회)
`analyze()` 의 `return None`, `query_transform` 의 `return query`, `_judge` 의 `{}` — 셋 다 "실패해도 서비스가 안 끊기게" 만든 장치인데, **셋 다 고장을 보이지 않게 만들었다.**
→ 폴백에는 **관측 장치가 함께 있어야 한다**. `analyzer.sanitize_stats()` 처럼 "폴백이 몇 번 발동했는가"를 셀 수 있어야 한다. 이건 아직 `_judge`·`query_transform` 에 없다(백로그).

### ⭐ 기준선 (2026-09-15) — 분석기·쿼리변환·judge 가 모두 살아난 첫 측정

`python3 -u -m eval.gen_eval --sleep 25 --cache-file eval/.gen_cache_20260913b.json`
운영 파리티: **HyDE=off · fetch_k=50 · rerank on · judge=gpt-oss-120b · 분석기 정상**

| 지표 | 값 | n |
|---|---:|---:|
| **mode_accuracy** | **0.93** | 14/15 |
| **structured(JSON)** | **15/15** | 정규식 폴백 0회 |
| **환각률(fabricated)** | **0.00** | 0/7 |
| mode_fit | 4.27 | 11 |
| technique_grounding | 4.09 | 11 |
| instruction_form | 5.00 | 7 |
| intent_preservation | 4.91 | 11 |
| faithfulness | 5.00 | 7 |

**읽는 법 / 한계**
- ⚠️ **이전 수치와 직접 비교 금지.** 2026-07-31 의 mode 정확도 0.83 은 분석기가 살아 있던 시절 값이고, 그 사이(08-21~09-15) 분석기는 죽어 있었다. 지금 0.93 은 **분석기가 돌아온 상태의 새 기준선**이다.
- 15·16·17 은 **일시적 DNS 오류**(`Errno 8 nodename nor servname provided`)로 생성 실패 — 쿼터·품질 문제가 아니다. 캐시 15/18.
- judge 실패 4건(429)은 점수 n 이 11·7 로 줄어든 이유다. mode_accuracy·structured 는 결정론적이라 영향 없다.
- 유일한 mode 오판은 **[18] "제품 홍보 이메일 써줘"** — 기대 ask, 실제 improve. judge 도 `mode_fit=2` 로 낮게 봤다. 분석기 프롬프트의 *"'제품'은 일반명사, 어떤 제품인지 없음 → empty"* 규칙이 먹히지 않은 사례다.
- `technique_grounding` 이 ask 모드에서 일관되게 **2점**(9·10·11번)이다 — 질문 모드에서 검색된 기법이 질문에 거의 반영되지 않는다는 뜻이고, 이는 **검색 품질 문제(R@5 0.296)와 같은 뿌리**로 보인다.
- 속도: 항목당 ~11분(TPM 8,000 vs 항목당 ~11,600 토큰의 구조적 한계). 전량 1회에 약 3시간.

**변경 파일**: `eval/{gen_eval,uplift_eval,halluc_eval,gen_qa_set}.py` · `ingestion/{gen_examples,tag_axes,tag_layers,ingest_knowledge}.py`
**검증**: 8개 파일 구문 통과 · 타임아웃 없는 클라이언트 0곳 · judge 스모크 정상 · `pytest tests/ -q` 97 passed

---

## [2026-09-16] 결과 상향 평가셋 v2 초안 — raw vs 딸각 비교 기준을 '원래 요청'에 고정
**목적**: "딸각이 AI 결과물을 실제로 얼마나 좋게 만드는가"를 판단할 신뢰할 수 있는 기준이 필요했다. 기존 `uplift_eval` 은 판정 LLM의 종합 점수 하나(8문항)뿐이라 판정 모델 취향이 섞이고 신뢰구간이 너무 넓다(8문항 중 6승이어도 95% CI 약 41~93%).

**Before**
- `uplift_set.json` 8문항, 문항에 채점 기준 없음 → 판정 LLM 종합 선호만 측정.

**After** — 신규 `eval/uplift_set_v2.json` (40문항, 기존 8문항 그대로 포함)
| 기준 | 필드 | 측정 | 근거 |
|---|---|---|---|
| 1 요구사항 충족률 | `requirements` (157개) | judge yes/no → 충족 수/전체 | InFoBench DRFR |
| 2 형식 제약 준수율 | `checks` basis=request (22개) | 코드 판정 | IFEval |
| 3 정보 보존 | `checks` basis=preserve (45개) | 코드 판정 | RAG faithfulness |
| 정확성 | `gold` (49개) + `checks` basis=gold (8개) | judge yes/no / 코드 | — |
| 4 즉시 사용성 | `global_checks` | 빈칸 수·작성 거부 여부 | 환불메일 거부·회의록 누락 사례 |

- 분포: generate 24 / transform 16 · 구체성 high 31 / mid 5 / low 4 (low 는 되묻기 비율 측정용)
- **핵심 규칙**: 채점 기준은 사용자의 원래 요청에서만 뽑는다. 딸각이 덧붙인 조건으로 채점하면 순환 논리.

**변경 파일**: 신규 `eval/uplift_set_v2.json` · `tests/test_uplift_set_v2.py`

**검증**: `pytest tests/ -q` 103 passed. 신규 테스트가 강제하는 것 —
- preserve 확인값이 원래 요청에 실제로 있는가(번역 문항만 `translated` 예외)
- 기존 8문항 query 가 v1 과 글자 단위로 같은가(이전 측정과 비교 가능)
- 가공 문항의 글자 수 제한이 원문보다 짧은가 → **초안에서 up_35 가 걸렸다**(원문 242자에 300자 제한 = 아무것도 거르지 않음) → 150자로 수정

**결정·근거 / 한계**
- ⚠️ 라벨은 작성자 1인 판단. 팀 교차 검토 전까지 잠정.
- 아직 채점기 미구현 — `uplift_eval` 에 체크 실행기·요구사항 judge·3조건(raw/다듬기만/딸각)·Wilson CI 연결이 다음 단계.
- 사람 대조 검증(20~30쌍, κ ≥ 0.6) 전에는 judge 기반 기준 1·정확성 수치를 확정 결과로 쓰지 않는다.

---

## [2026-09-16] 🔴 `technique_grounding` 은 검색 품질에 눈이 멀었다 · gen_eval 이 운영과 다른 파이프라인을 재고 있었다
**질문(사용자)**: 측정 기법이 왜 안 통하는가 — 정확히 어떤 이유로 분석된 기법이 프롬프트에 반영되지 않는가. 기준점이 가장 중요하니 신중하게.

### 출발점 — 완전한 기준선(18/18, judge 실패 0)에서 드러난 패턴
| 모드 | 건수 | technique_grounding |
|---|---:|---:|
| improve | 12 | **12건 전부 5점** |
| ask | 6 | 3·2·3·5·4·3 → **평균 3.33** |

저하는 **ask 모드에서만** 일어났다.

### 진단 1 — 검색이 질의를 구분하지 못한다 (gen_set 18질의 · top-5 86슬롯)
| 층 | 슬롯 | 비율 |
|---|---:|---:|
| user_instruction | 68 | 79% |
| **meta** | 12 | **14%** |
| degenerate | 3 | 3% |
| system | 3 | 3% |

- **최다 회수 카드가 `Meta-Prompting`(18질의 중 7회)** — *"요청을 최적의 프롬프트로 변환하라"*, 즉 생성기가 이미 하는 일이다.
- 고유 카드 46종이 슬롯을 채우고 dense 는 전부 0.40~0.55 좁은 띠. 서로 다른 질의가 같은 카드를 받는다.

### 진단 2 — 생성기는 검색 목록을 **충실히** 따른다 (⚠️ 처음 가설을 뒤집음)
처음엔 *"improve 의 5점은 개선 프롬프트가 으레 하는 일과 일반 기법이 우연히 겹친 착시"* 라고 봤다. **틀렸다.**
```
improve 모드 적용 기법 45개 중 검색 결과에 있던 것 45개 = 100%
```
생성기는 기법명을 지어내지 않는다. **그래서 검색된 쓰레기도 그대로 적용된다.**

### 진단 3 — 🔴 쓰레기 적용을 judge 가 못 잡는다
```
개선안에 적용된 기법 45개 중 '반영할 수 없는 층' 9개 = 20%
해당 항목의 judge technique_grounding = 전부 5점
```
| 질의 | 적용됨(쓰레기) | 층 |
|---|---|---|
| 환불 거절 이메일 | Fallback Response Handling · Adversarial Prompt Testing | system |
| 채용 공고 | Request Normalization · Prompt Generator Pattern | meta |
| 파이썬 코드리뷰 · 번역 · 다이어트 블로그 · 제품 홍보 이메일 | Meta-Prompting | meta |

**`technique_grounding` 은 "검색된 것을 반영했나"만 묻고 "그게 맞는 기법이었나"는 묻지 않는다.** 검색이 쓰레기를 주고 생성기가 충실히 따르면 → 5점. **검색 품질에 구조적으로 눈이 멀었다.**

### 진단 4 — ask 모드의 2~3점은 구조의 산물
- 출력 스키마: ask 는 `{mode, questions, summary}` — **기법 필드가 없다** (적용 기법 0/0)
- SYSTEM_PROMPT [질문 모드] 절: **[참고 기법]을 쓰라는 지시가 없다** (improve 절에만 있다)
- 게다가 설계상 ask 는 (A)작업종류·(B)주제만 물어야 하고 톤·분량 같은 보조 항목은 **질문 사유가 아니다**. 기법(Audience·Length 등)을 질문에 반영하게 만들면 **과잉 질문 → mode_fit 하락**과 충돌한다.
→ ask 모드 technique_grounding 은 **제품 설계와 어긋난 채점축**일 가능성이 크다. judge 프롬프트는 바꾸지 않고(프롬프트 변경은 A/B 필요), **모드별로 분리 집계**만 추가해 가려지지 않게 했다.

### 진단 5 — 🔴 기준선이 운영과 다른 파이프라인을 재고 있었다
| | 운영 `/query` | gen_eval(종전) |
|---|---|---|
| min_score | 0.40 컷 | **없음 — 항상 5개** |
| 예시 주입 | 최대 2개 | **없음** |
| mode 판정 | 응답 `mode` 필드 | **improved_prompt 유무로 추측** |

단서: 직전 기준선 캐시 미스 2건(1·13번)이 **정확히 min_score 가 뭔가를 잘라내는 항목**이었다. 검색은 프로세스 간에도 결정적이었으므로(3회·스레드 1/다중 동일) 원인은 인자 차이다.
→ `app.main.retrieve_contexts()` 로 검색부를 추출해 **/query 와 gen_eval 이 같은 함수를 부른다.** 오늘 반복된 근본 원인(복제 → 드리프트)을 여기서도 끊는다.

### 조치
| 변경 | 목적 |
|---|---|
| `retrieve_contexts()` 추출, /query·gen_eval 공유 | 운영 파리티(min_score·예시) |
| gen_eval 캐시 키에 **예시 식별자** 포함 | 예시 없이 만든 생성의 재사용(조용한 오염) 차단 — 이전 캐시는 전부 미스(의도) |
| gen_eval `mode` = 응답 필드 | 운영 규약 |
| **결정론 지표**: 반영불가 기법 적용률 · technique_grounding(improve/ask) · 404 건수 | judge 가 못 보는 것을 본다 |
| **층 필터 retriever 배선**(기본 on, `use_layer_filter` 로 끌 수 있음) | 반영불가 카드 회수 21% 제거 |
| gen_eval `--no-layer-filter` | A/B |

**검증**: /query 리팩터 전후 동일(기법 5 + 예시 2 · 0건+첫턴 404 · 0건+후속턴 200) · LLM 없는 하네스 스모크 · 필터 on/off 로 회수 카드가 실제로 바뀜(`Request Normalization`·`Prompt Generator Pattern` → `Domain-Specific`·`Intent Classification`) · `pytest tests/ -q` **103 passed**

⚠️ 테스트 도중 `/query` 가 "제주도 여행 블로그 글 써줘. 아이랑 3박4일" 에 404 를 냈다 — **변경 탓이 아니다.** 필터를 꺼도 top-5 최고가 0.368 이라 0건이다. 문서에 기록된 기존 하드 404 사례가 여전히 살아 있다(`CORPUS_STRATEGY` 1순위 "하드 404 폐지" 미착수).

### A/B 설계 — 공유 캐시
| 팔 | 설정 |
|---|---|
| A | `--no-layer-filter` · 운영 파리티(min_score 0.40 · 예시 2) |
| B | 층 필터 on · 나머지 동일 |

두 팔이 **같은 캐시 파일**(`eval/.gen_cache_parity.json`)을 쓴다. 필터가 검색 결과를 바꾸지 않은 항목은 입력이 완전히 같아 생성을 공유 → 처치가 닿지 않은 항목은 **동일 표본**이 되어 잡음이 준다. 분석기 입력은 질의뿐이라 필터와 무관하고, 캐시 키가 기법·예시를 모두 포함하므로 오염되지 않는다.
쿼터: 항목당 실사용 ~10,500 토큰 → A 1회 ~190k(TPD 200k 육박). **B 는 다음 쿼터 창에서** 돌린다.

**변경 파일**: `app/main.py` · `app/rag/retriever.py` · `eval/gen_eval.py`

---

## [2026-09-16] 평가셋 v2.1 — 캐시 결과물 대조로 드러난 오판 수정 (수정 1~5)
**목적**: v2 초안의 코드 판정을 기존 캐시 결과물 27건(`eval/.uplift_cache.json`, 70b·8b)에 돌려보니 오판과 누락이 나왔다. 채점기를 만들기 전에 평가셋부터 고친다.

**Before — v2 초안을 실제 결과물에 돌린 결과**
| 문제 | 사례 |
|---|---|
| 🔴 가장 중요한 실패 누락 | up_08 딸각 결과물이 번역이 아닌 "영수증 안내" 메일인데 언어·격식체 판정 모두 합격 |
| 🔴 빈칸 감점이 지어내기와 충돌 | 회사명을 안 줬으면 `[회사명]` 이 정답 동작. 감점하면 지어낸 쪽이 유리. raw 결과물 대부분에도 있음 |
| 🟠 맞는 결과를 불합격 | up_02 "경력 무관"이 `경력: 무관` 표기를 못 잡음 — 6건 중 2건 오판 |
| 🟠 줄 수가 머리말까지 셈 | up_04 "3줄": 머리말 한 줄 때문에 5건 중 3건 불합격. 합격한 1건은 "네트워크 모듈"을 지어낸 결과물 |
| 🟠 틀린 사실 통과 | up_02 마감 "**2024년** 7월 31일"이 "7월 31일" 포함으로 합격 |
| 🟡 정규식 오탐 | 코드 `rows[0]`을 빈칸으로(3건), 끝인사 "알려주시면"을 거부로(1건) |
| 🟠 변별력 없음 | 8문항 중 4문항은 모든 결과물이 모든 판정 합격 |

**After — `eval/uplift_set_v2.json` v2.1-draft (48문항)**
1. **빈칸 재정의** — `global_checks`(정규식) 삭제 → `defects.placeholder_defect`(judge): 요청에 준 값을 비운 것·핵심 내용 자체를 비운 것만 결함. 주지 않은 정보의 빈칸은 정상.
2. **지어내기 전역 판정** — `defects.fabrication`(judge), transform=원문 밖 사실 추가 금지 / generate=사용자 사실 변경·요청 주체 사실 날조 금지. 문항별 "지어내지 않는다" gold 8건 삭제(이중 계산 방지). `defects.refusal` 도 judge 로.
3. **코드 판정 축소** — `max_lines`·`max_sentences`·`char_range` 삭제(요구사항 문구에 "머리말은 세지 않는다" 명시하고 judge 로). 표기가 흔들리는 확인값 삭제(경력 무관·7월 말·공식 사이트·습니다·HAVING/GROUP BY·`->`·`% 2` 등). 코드 판정 75개 → 57개.
4. **주관 요구사항 표시** — `requirements` 를 객체로, 18개에 `subjective: true`(톤·어조·쉬운 말·가독성 등) → 충족률에서 제외하고 따로 보고. 애매한 gold 정리(up_03 TypeError 삭제, 조건부 2건 `conditional: true`). 집계 규칙(`aggregation`: 문항 단위 paired, macro 주·micro 보조, 지표 합산 금지, 3회 반복) 명문화.
5. **트랙 분리** — `track` A(조건 충분, 31문항: 망치지 않는가) / B(조건 부족, 17문항: 도움이 되는가). B 는 up_41~48 8문항 추가(gen_set·halluc_set 과 겹치지 않게). up_01~08 은 gen_set 1~8 과 같은 작업 → `tuning_overlap: exact_task`, up_33·38 → `similar`(따로 보고).

**검증**
- `pytest tests/ -q` **107 passed**. 테스트 추가: 트랙↔구체성 일치 · 오판 확인된 판정 방식 재유입 금지 · gold 에 지어내기 중복 금지 · 조정용 셋 문항이 표시 없이 들어오지 않음 · 트랙별 15문항 이상.
- 같은 캐시 결과물 재판정: up_04 머리말 오판 3건 → 0건, 실제 거부 1건은 계속 잡음 · up_02 경력 표기 오판 2건 → 판정 삭제 · up_02 재택 누락 1건은 정상 검출.

**결정·근거 / 남은 일**
- 코드 판정만으로는 가장 심각한 실패(up_08 엉뚱한 메일, up_04 "네트워크" 날조, up_02 "2024년")를 못 잡는다 → 이 세 건 + up_06 제목 빈칸(`[정중한 환불 거절 안내]`)을 **judge 결함 판정의 검증용 표본**으로 쓴다. judge 가 이 4건을 못 잡으면 채점기에 쓰지 않는다.
- `max_chars` 머리말 떼기 규칙은 채점기 구현 때 캐시 결과물로 검증 필요.
- up_41~48 은 Claude 작성 — 팀원이 딸각 결과를 보지 않고 쓴 문항으로 교체 권장. 사람 2인 라벨 대조(κ ≥ 0.6) 전까지 잠정.

### A팔 결과 (운영 파리티 · 층필터 off) — 16/18
| 지표 | 값 |
|---|---:|
| mode_accuracy | 0.85 (11/13) *(첫 실행분)* |
| **반영불가 기법 적용률** | **0.30** (7/23) |
| technique_grounding(improve) | **5.00** |
| technique_grounding(ask) | 3.71 |
| 404 | 0/18 |

→ **운영 파리티 파이프라인에서도 judge 의 맹점이 그대로 재현된다**: 적용 기법의 30%가 반영불가 카드인데 improve 는 만점.
누락 2건(6·15)은 아래 ② 때문이며, 공유 캐시 `eval/.gen_cache_parity.json` 에 16건이 남아 있다.

### ① 항목 4 의 모드 뒤집힘(improve→ask)은 **분석기**가 원인
```
fields(분석기): ('원문', 'required', 'empty')
```
분석기가 **자기 규칙 5번**(*"원문을 붙여넣지 않고 '~하는 프롬프트를 만들어줘'라고 한 경우 원문은 required 가 아니다"*)을 어겼다. 생성기는 그 신호대로 "원문에도 없음 → 질문"으로 갔다. 직전 기준선에선 같은 항목이 improve ✓ → **분석기 비결정성**(temp 0.2 · reasoning_effort low). 빈도 측정은 미실시.

⚠️ 부수: 이 항목에 주입된 예시가 **의미상 무관**했다 — "회의록 요약 프롬프트"에 *"회의 일정표 3개"*(0.574)·*"영어 면접 대비"*(0.563). "회의"라는 표면만 맞았다. `example_min_score=0.40` 이 아무것도 거르지 못한다(기존 백로그 "예시 코퍼스 기준 재측정 필요"와 같은 문제).

### ② 🔴 운영 생성기가 **큰 입력에서 400 으로 실패**한다 (같은 추론 토큰 버그, 여섯 번째)
누락 2건이 계속 실패해서 원인을 팠다. 처음엔 Gemini 503 만 보였다 — **Generator 폴백이 Groq 쪽 원인을 버리고 있었기 때문이다**(`except RuntimeError:` 후 사유 없이 "Groq 실패" 출력 → 오늘 네 번째 '폴백이 원인을 숨김' 사례). 원인 로깅을 넣자:
```
[Generator] Groq 실패 → Gemini 폴백 — 원인: Groq 요청 실패(HTTP 400)
```
직접 재현:
```
항목 6 · _fit_max_tokens=805 → 400 json_validate_failed · failed_generation ''
```
**원인 사슬**
| 요인 | 효과 |
|---|---|
| gpt-oss TPM **8,000** (llama 시절 12,000) | 출력 여유 축소 |
| `SYSTEM_PROMPT` 4,605(추정) + 기법 + **예시(이번에 파리티로 추가)** + **분석 블록(09-13 분석기 복구로 되살아남)** | 입력 증가 |
| `_fit_max_tokens = TPM − 추정입력 − 200` | 출력 예산 **~800~1,000** 으로 축소 |
| 🔴 **`_est_tokens` 가 llama 토크나이저 기준으로 보정돼 있음** | gpt-oss 입력을 **19.5% 과대추정**(추정 6,303 / 실제 5,273, 항목 1) → 예산을 더 깎는다 |
| gpt-oss 는 출력 앞에 추론 토큰을 쓴다 | 남은 ~800 을 추론이 먹고 JSON 미완성 → **400** |

→ **분석기를 고친 것(09-13)이 생성기 예산을 줄여 이 실패를 드러냈다.** 개별로 맞는 수정이 합쳐져서 새 실패를 만든 사례다.
→ 운영 영향: 입력이 큰 요청은 간헐적으로 400 → Gemini 폴백(무료 RPD 20·고부하 503) → 사용자에겐 503. **gen_set 에서 2/18(11%)** 가 이 경로로 떨어졌다.

측정된 것 (1건 · 항목 1): `max_tokens 1497 · 완료 1172 · finish=stop · structured=True` — 예산이 충분하면 정상 동작한다.

### 오늘 못 한 것 — Groq TPD 소진 (198,765 / 200,000)
| 남은 측정 | 목적 |
|---|---|
| **B팔**(층필터 on, 공유 캐시) | 층 필터의 생성 단계 효과 — 반영불가 적용률 0.30 → ? |
| **추정기 재보정**(`_est_tokens`, gpt-oss 실측) | 데이터 1점뿐 — 여러 점을 모아야 계수를 바꿀 수 있다 |
| **생성기 `reasoning_effort` A/B — 큰 입력(6·15번) 중심** | 이 버그가 실제로 나는 곳에서 재야 의미가 있다 |
| 분석기 규칙 5 위반 빈도 | 항목 4 반복 호출 |

**변경 파일**: `app/rag/generator.py`(폴백 원인 로깅 — 동작 불변)
**검증**: `pytest tests/ -q` 103 passed · 폴백 원인 로그 실출력 확인

---

## [2026-09-19] 층 필터 A/B 결과 — 반영불가 기법 29% → 0%, 품질 회귀 없음 · 모드 뒤집힘은 필터가 아니라 분석기

**질문**: 09-16 에 배선한 층 필터(`retriever.use_layer_filter`, `user_instruction` 만 검색)가
생성 단계에서 실제로 "반영할 수 없는 기법"을 없애는가, 그리고 다른 품질을 깎지 않는가.

**조건**: `gen_eval` · gen_set 공통 13항목(1,3,5,7,8,9,10,11,12,13,16,17,18) · Groq 단일 백엔드
(`GEMINI_API_KEY=""` — A팔 캐시가 전부 Groq 생성) · temp 0.7 · judge gpt-oss-120b · 두 팔 **같은 실행 조건**에서 채점.
A = `--no-layer-filter`, B = 기본(필터 on). 캐시 `eval/.gen_cache_parity.json`.

**제외 4항목(2·4·6·14)**: B 생성이 HTTP 400 을 2회 연속 → 포기. 필터 탓이 아님을 따로 확인했다 —
필터 on/off 의 `_fit_max_tokens` 차이는 −41~+16 토큰뿐이고, 400 은 예산 ~1,100~1,250 구간에서
**확률적으로** 난다(09-16 항목의 추론 토큰 예산 버그). 이번 재생성에서도 A·B 모두 4회 중 1회꼴로 400.

### 결과 (공통 13항목, 각 1회 생성)
| 지표 | A (필터 off) | B (필터 on) |
|---|---|---|
| **반영불가 기법 적용률** (결정론) | **0.29** (8/28) | **0.00** (0/14) |
| technique_grounding(improve) | 5.00 (n=7) | 5.00 (n=4) |
| technique_grounding(ask) | 3.67 (n=6) | 3.56 (n=9) |
| mode_accuracy | 0.92 (12/13) | 0.85 (11/13) |
| mode_fit | 5.00 | 4.54 |
| intent_preservation | 5.00 | 4.77 |
| instruction_form / faithfulness | 5.00 / 5.00 (n=7) | 5.00 / 5.00 (n=4) |
| 환각률 · structured · 404 | 0/7 · 13/13 · 0 | 0/4 · 13/13 · 0 |

### 모드 차이 3건 — 전부 필터와 무관
| 항목 | A | B | 원인 확인 |
|---|---|---|---|
| 3 코드리뷰 프롬프트 | improve ✓ | **ask ✗** | B팔 그대로 **3회 재생성 → 3/3 improve**. A팔도 3/3 improve. 1회성 흔들림 |
| 8 영어 이메일 번역 프롬프트 | improve ✓ | **ask ✗** ("원문이 제공되지 않아") | **분석기**를 5회 단독 호출 → **3/5 가 `원문=empty`(required)**. 규칙 5("~하는 프롬프트" 요청이면 원문은 required 아님) 위반. 분석기는 검색 **전**에 돌므로 필터가 영향을 줄 수 없다 |
| 18 제품 홍보 이메일 | **improve ✗** | ask ✓ | 기대 ask. A 쪽이 틀렸다 |

→ mode_fit·intent 하락(5.00→4.54/4.77)은 항목 3의 ask ✗(fit 2·intent 2) 한 건이 대부분을 만든다.
   항목 13(제주도)의 B fit=2 는 mode 가 기대대로 improve ✓ 인데도 judge 가 낮게 줬다 — 원인 미확인(judge 1회).

### 같은 질의에서 무엇이 바뀌었나 (필터의 실제 효과)
| 항목 | A 적용 기법 | B 적용 기법 |
|---|---|---|
| 8 번역 (A) | Request Normalization · **Meta-Prompting** · Terminology Control · Variable Slot · **Prompt Generator Pattern** | (ask) |
| 13 제주도 | **Meta-Prompting** · Directional Stimulus | Directional Stimulus · Analyst-Then-Writer |
| 3 코드리뷰 (재생성) | … · **Meta-Prompting** | … · Add Clear Syntax |

A팔 번역 개선안은 "1. Request Normalization Prompting 기법에 따라 정규화한다 2. Meta-Prompting 을 활용해…"처럼
**기법 이름을 절차로 옮겨 적은 무의미한 지시문**이었다 — judge 는 이것에 tech=5·fit=5 를 줬다.
09-16 에 적은 "judge 는 검색 품질에 눈이 멀었다"가 실물로 확인된 사례.

### 판단
- **필터 유지.** 목표 지표(반영불가 29%→0%)를 달성했고, judge 지표 차이는 전부 필터 밖 원인으로 추적됐다.
- **한계**: 항목당 1회 생성·n=13. B 는 improve 가 4건뿐이라 improve 지표의 표본이 작다.
- **다음 1순위 = 분석기 규칙 5 위반**(번역 템플릿 요청에 원문 required, 5회 중 3회). 이게 지금 mode_accuracy 를 가장 크게 흔든다.

### 부수 발견 (미수정)
- 🔴 A팔 항목 3 캐시: `techniques_applied` 에 `'{"name":"Checklist Prompting","reason":…}'` 처럼 **JSON 문자열이 이름째** 들어갔고,
  마크다운 `answer` 에는 빈 글머리표(`• `)가 찍혔다. 생성기가 techniques 를 문자열화된 JSON 으로 낸 경우를 정규화하지 못한다.
  측정 영향: 이런 이름은 카드와 매칭이 안 돼 반영불가 적용률의 **분모에만** 들어간다(과소집계 방향).
- `gen_eval` 캐시 키에 분석기 결과가 없다 — 분석기 출력이 달라져도 같은 키면 캐시 히트. 이번엔 두 팔의 기법 목록이 달라 충돌은 없었다.

**변경 파일**: 없음(측정·기록만) · 스크래치 `drive_b.py`·`replay3.py`

---

## [2026-09-19] CI 에 rag-server 단위 테스트 추가 · 측정 도구 3곳 `types` 미정의(NameError) 수정
**목적**: rag-server 는 CI 에서 전혀 검사되지 않았다(통합 스모크도 가짜 RAG 만 씀). "조용히 죽어 있던" 결함이 네 번 반복된 만큼 최소한의 자동 검사를 건다.

**Before**
- `.github/workflows/ci.yml` 에 Python job 없음.
- `eval/uplift_eval.py` 가 모듈 최상단에서 `app.main` 을 import → 헬퍼(`_loads_loose` 등)만 쓰는 `defect_canary`·테스트도 import 순간 bge-m3 로드 + MySQL 접속. 로컬에선 모델 캐시·DB 가 있어 통과, CI 에선 불가.
- `c91201b`(측정 도구 타임아웃 추가)가 Gemini 분기 3곳에 `types.HttpOptions` 를 넣으면서 `from google.genai import types` 를 빠뜨림 → **Gemini 경로로 돌면 NameError**. Groq 우선이라 드러나지 않았다: `eval/uplift_eval.py:_get_client` · `ingestion/gen_examples.py` · `ingestion/ingest_knowledge.py`.

**After**
- CI job `rag-server`: Python 3.11(Dockerfile 과 동일) · `requirements-test.txt`(torch·sentence-transformers 제외) · `ruff check --select F821,E9`(정의 안 된 이름·문법 오류만) · `pytest tests -q`.
- `uplift_eval` 의 `app.main` import 를 `main()` 안으로 이동(동작 불변 — `retriever`·`run_generation` 은 `main()` 에서만 쓰임, 다른 도구는 `app.main` 을 직접 import).
- 3곳에 `from google.genai import types` 추가.

**변경 파일**: `.github/workflows/ci.yml` · 신규 `requirements-test.txt` · `eval/uplift_eval.py` · `ingestion/gen_examples.py` · `ingestion/ingest_knowledge.py`

**검증**
- 커밋된 트리(HEAD + 이 수정) 를 `.env` 없는 worktree 에서 `requirements-test.txt` 만으로: ruff 통과 · `pytest` 97 passed (Python 3.10). 작업 트리 전체(미커밋 테스트 포함) 172 passed.
- ruff F821 이 수정 전 `gen_examples.py` 의 `types` 를 잡는 것 확인.

**결정·근거**
- ruff 는 F821·E9 만 켠다. 전체 규칙은 기존 코드에서 대량 경고가 나 CI 를 소음으로 만든다.
- ⚠️ `tests/` 가 `app.main`·`app.core.embeddings` 를 import 하게 되면 CI 가 깨진다 — `requirements-test.txt` 머리말에 명시.

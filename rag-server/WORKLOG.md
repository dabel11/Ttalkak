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
**목적**: develop-integrated 현행에서 rag·backend·extension·web·docker 연동을 처음부터 재점검. 계층 간 규칙을 담당자 공유용 단일 문서로 확정.

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
- 로컬 `develop-integrated`의 **멀티표현 인덱싱**(`app/rag/views.py`, `0deb13f`)은 이 브랜치에 없어 측정하지 못했다. 병합 후 **같은 잣대(gold Recall@5)로 재볼 것** — 효과가 처음으로 검증된다.
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

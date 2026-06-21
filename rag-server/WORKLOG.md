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

# 다음 작업 / 보류 항목 (백로그)

- [ ] **리랭커 점수 표시**: 짧은 쿼리에서 reranker 로짓이 0 근처라 `score`가 ~0.50으로 평탄. 순위는 정상이나 UI "유사도 %"가 단조로움 → 표시 점수를 dense 코사인으로 바꾸는 옵션 검토.
- [ ] **리랭커 비용/지연**: 2.1GB 모델 + 쿼리당 CPU cross-encoder. Railway 무료티어 RAM 확인 필요. 부담 시 `use_reranker=false` 폴백.
- [ ] **쿼리 변환 재설계(HyDE형)**: 키워드 확장 대신 "기법 청크처럼 생긴 가설 문서"를 생성해 임베딩(코퍼스와 정렬). 현실셋으로 재측정.
- [ ] **출력 구조화**: 설계 문서의 `{ improved, score, changes[] }` 구조화 응답(현재 정규식 파싱 의존) — 이전 논의됨, 미착수.
- [ ] **스트리밍(SSE)**: 설계 문서의 `/improve/stream` — 미착수.
- [ ] **하이브리드 한국어 토큰화 개선**: 형태소 분석기(mecab 등) 도입 시 BM25 단독 성능 향상 여지.

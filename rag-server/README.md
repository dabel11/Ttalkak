# RAG Service — bge-m3 + MySQL + FastAPI + Spring Boot

> 변경 이력·전후 비교는 [WORKLOG.md](WORKLOG.md)에 기록한다. 새 작업은 같은 템플릿으로 추가.

## 전체 구조

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

### 검색 파이프라인 (/query)
1. **후보 추리기** — dense(bge-m3 코사인)로 `fetch_k`(기본 20)개. (옵션 `use_hybrid`: dense+BM25 RRF 융합 — 측정상 악화라 기본 off)
   - fetch_k=20은 측정 기반 결정: 10으로 줄이면 지연 절반(1988→922ms)이지만 Recall@5 −4.5%p (WORKLOG 2026-07-05 스윕).
2. **리랭크** — bge-reranker-v2-m3로 재채점해 상위 `top_k` 반환(`use_reranker` **기본 on, 검증된 핵심 개선**). 실패 시 후보 폴백.
   - 반환 `score`는 dense 코사인(해석 가능), `rerank_score`(sigmoid)는 병기 — 리랭커 확률은 ~0.50 평탄이라 표시·필터에 부적합(측정으로 확인).
3. **유효 유사도 컷** — `min_score`(기본 **0.40**, dense 기준) 미만은 top_k에서 제외. 무관한 입력이면 0건→첫 턴 404. τ=0.40은 recall 무손실·빈결과 0% 지점(`eval/score_analysis.py`로 측정, 코퍼스 변경 시 재측정).
4. **쿼리 변환(실험적, 기본 off)** — `use_query_transform`(키워드) / `use_hyde`(가상문서). 둘 다 이 코퍼스에선 검색 악화라 비활성(아래 평가).

## 평가 (검색 + 생성)

### 검색 품질: `python -m eval.run_eval --qa qa_set_realistic.json`
`--all`(4변형 비교) · `--rerank` · `--hybrid` · `--query-transform`/`--hyde` · `--fetch-k 20 15 10`(후보폭 스윕) · `--show-fails`.
지표: Hit@1 / **Recall@1·3·5(진짜 recall = 정답∩topk/정답수)** / Precision@5 / MRR@10 / **NDCG@5** / 평균 검색 지연.
임계치 설계: `python -m eval.score_analysis` — 정답/오답 점수 분포 + min_score 스윕(유지Recall/Precision/빈결과율).

#### 검색 평가 결과 (현실 평가셋 59문항, 원시 사용자 프롬프트)
| 변형 | Recall@3 | Recall@5 | NDCG@5 | MRR@10 |
|---|---|---|---|---|
| dense (기준) | 0.695 | 0.777 | 0.710 | 0.771 |
| **+리랭커 (기본값)** | **0.737** | **0.847** | **0.757** | **0.801** |

> ⚠️ 이전 표의 'Recall@5 0.949'는 사실 "top5에 하나라도 정답이면 hit"(=Hit@5)이라 천장에 닿아 변별이 안 됐다. 진짜 Recall@k·NDCG@5로 교체하니 리랭커 효과가 또렷(Recall@5 +0.070).
>
> 측정 결론: **리랭커 단독이 최고.** 하이브리드(BM25)는 한국어 형태소 토큰화(kiwipiepy)를 써도 악화 — 기법 청크들이 공통 형태소를 공유해 sparse 신호가 노이즈. HyDE/키워드 변환도 악화 — 원본 프롬프트가 이미 기법 "Use When"과 잘 매칭. 모두 opt-in으로 보존하되 기본 off.

### 생성 품질(G): `python -m eval.gen_eval` (GROQ_API_KEY 필요)
운영과 동일한 파이프라인(검색+생성)으로 `improved_prompt`를 만들고 별도 LLM(judge)이 채점.
지표: mode_fit / technique_grounding / instruction_form / intent_preservation(1~5) + **mode_accuracy**(탐지 모드 vs 기대 라벨, 결정론적이라 가장 신뢰).
- mode_accuracy(탐지 모드 vs 기대): **0.27 → ≈0.92** (generator 과잉 질문 완화 후). instruction_form N/A→5.00.
  - 발견·수정: 정보가 충분한 프롬프트도 첫 턴에 질문 모드로 빠지던 문제를, `generator.py`를 (A)작업종류+(B)핵심주제 2-항목 게이트로 완화해 해결. 측정→수정→재측정 루프(WORKLOG 2026-06-22).
- 모드 판정은 결정론적 `mode_accuracy`를 1차 신호로, LLM judge 점수는 보조로 본다(judge가 과잉질문에 관대함).
- ⚠️ 운용 주의: Groq 무료 티어 일일 토큰 한도(TPD 100k)로 12문항 1회도 빠듯 — judge를 8b로 낮추거나 평가셋 분할 권장.

### 결과 상향(uplift): `python -m eval.uplift_eval` (GROQ/GEMINI 키 필요)
딸각의 **실제 효용**을 end-to-end A/B로 측정한다. "개선 프롬프트가 좋은 지시문인가"(=gen_eval)가 아니라 **"그 프롬프트로 만든 결과물이 raw 프롬프트를 그냥 LLM에 넣은 것보다 실제로 좋아지는가"**를 잰다.
- 흐름: 거친 요청마다 ① raw→순수LLM=결과 A, ② raw→딸각 개선프롬프트→순수LLM=결과 B, ③ judge가 A·B 비교(순서 swap 2회로 위치 편향 제거), ④ **개선 승률 + 평균 점수 Δ**.
- 옵션: `--no-swap`(비용 절반) · `--limit N` · `--target-model` · `--judge-model` · `--show` · `--no-cache`. 결과물은 기본 캐시(`eval/.uplift_cache.json`)되어 재실행 시 judge만 다시 돈다.

#### 첫 측정 (uplift_set 8문항, 실행·채점 llama-3.3-70b)
| | raw(기준) | 딸각 개선 | Δ |
|---|---|---|---|
| 평균 점수(1~5) | 4.75 | 3.50 | **−1.25 (−26%)** · 개선 승률 0% |

> 🔴 **즉시 발견된 회귀**: "사용자가 변환할 원문을 직접 준 작업"(회의록 요약·영어 이메일 번역)에서 개선 결과가 **1.0점**으로 폭락 — 딸각이 지시문으로 재작성하며 **원문 페이로드를 누락**("회의록 내용이 제공되지 않았습니다"). 순수 생성 작업(카피·공고)에선 강한 70b 실행모델 기준 개선 효과가 미미~소폭(–). → generator가 user-provided 원문을 개선프롬프트에 보존하도록 수정 필요(백로그). 도구가 의도대로 실효용 회귀를 정량 포착.

새 자유형식 문서: `ingestion.chunking.semantic_chunks(text)`로 청킹. 새 기법 자료: `ingestion.ingest_knowledge`(LLM 카드 추출 + 의미 중복제거)로 인덱싱.

## 실행 순서

### 1. FastAPI 서버 실행

> **모든 명령은 `rag-server/` 디렉터리에서 실행한다.** 패키지(`app`/`ingestion`/`eval`)를
> `python -m <패키지>.<모듈>` 형태로 실행하므로 import 경로가 항상 일관된다.

```bash
cd rag-server

pip install -r requirements.txt

# MySQL 접속 (.env 또는 환경변수, Spring과 동일 ttalkak DB)
#   DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD
#   또는 RAG_DB_URL=mysql+pymysql://user:pw@host:3306/ttalkak?charset=utf8mb4
# LLM 키
export GROQ_API_KEY=...        # 또는 GEMINI_API_KEY=...

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

## 지식 수집 파이프라인 (2개 프로그램)

논문/가이드를 자동으로 모아 RAG에 넣기까지 **두 프로그램**으로 돌아간다.

```
[1] ingestion.pdf_crawler      [2] ingestion.ingest_knowledge
크롤링 11개 출처              다운로드된 PDF 일괄
→ 관련도 점수 → manifest      → 파싱·청킹·LLM 적합도(≥7)
→ PDF 통합 다운로드           → MySQL(rag_chunk) 인덱싱
   data/downloaded_pdfs/  ───────▶  --pdf data/downloaded_pdfs/
```

### `ingestion/pdf_crawler.py` — 크롤링 → PDF 통합 다운로드

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

### 전체 흐름

```bash
python -m ingestion.pdf_crawler                       # ① 수집+다운로드
python -m ingestion.ingest_knowledge --mode paper \   # ② 파싱+청킹+큐레이션
  --pdf data/downloaded_pdfs/ --collection pe_auto
```

#### `ingestion/ingest_knowledge.py` — 논문/기법 PDF 큐레이션 인덱서 (2가지 모드)

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

### 2. Spring Boot 설정

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

## API 사용 예시

> FastAPI 서버(`localhost:8000`)에 직접 호출하는 예시다.
> Swagger UI: `http://localhost:8000/docs`
> Spring Boot에서 연동 시 `/api/prompts/improve` → rag-server `:8000/query` 로 프록시된다.

### 인덱싱 (`POST /index`)

```bash
curl -X POST http://localhost:8000/index \
  -H "Content-Type: application/json" \
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

### 질의 응답 (`POST /query`)

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

응답 (v2.0 스키마):
```json
{
  "answer": "Chain-of-thought prompting은 모델이 복잡한 추론 과정을...",
  "improved_prompt": "Chain-of-thought 기법을 써서 다음 문제를 단계별로 풀어라: ...",
  "sources": [
    {
      "text": "Chain-of-thought prompting enables...",
      "metadata": {"technique": "Chain-of-Thought", "source": "Wei et al. 2022", "page": 1},
      "score": 0.923
    }
  ],
  "techniques_applied": ["Chain-of-Thought Prompting"],
  "changes": ["단계적 추론 구조 추가", "목적 명시"]
}
```

---

## 파일 구조

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
│       ├── generator.py       #   LLM 응답 생성
│       └── query_transform.py #   쿼리 변환·HyDE(실험적)
├── ingestion/                 # 오프라인 적재 (python -m ingestion.*)
│   ├── chunking.py            #   시맨틱 청킹 유틸
│   ├── pdf_indexer.py         #   기법 PDF → MySQL 직접 인덱싱
│   ├── ingest_knowledge.py    #   논문/기법 PDF LLM 큐레이션 인덱서
│   └── pdf_crawler.py         #   11개 출처 크롤링 → PDF 다운로드
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

## 배포 (Railway)

FastAPI 서버를 Railway에 올릴 경우:
1. `rag-server/` 폴더를 별도 Railway 서비스로 배포 (시작 명령 `uvicorn app.main:app --host 0.0.0.0 --port $PORT`)
2. 환경변수: LLM 키(`GROQ_API_KEY`/`GEMINI_API_KEY`) + DB 접속
   (`RAG_DB_URL` 또는 `DB_HOST/...`) — Railway MySQL 플러그인을 가리키게 설정
3. Spring Boot `application.yml`의 `rag.server.url`을 Railway URL로 변경

> 벡터는 Spring과 동일한 Railway MySQL(`rag_chunk` 테이블)에 저장된다.
> 별도 볼륨/벡터 DB가 필요 없다.

# RAG Service — bge-m3 + MySQL + FastAPI + Spring Boot

> 변경 이력·전후 비교는 [WORKLOG.md](WORKLOG.md)에 기록한다. 새 작업은 같은 템플릿으로 추가.

## 전체 구조

```
Spring Boot (8080)
    │
    │  POST /api/rag/index   → 청크 인덱싱
    │  POST /api/rag/query   → 검색 + 응답
    ▼
FastAPI RAG Server (8000)
    ├── embeddings.py     : bge-m3 임베딩 + bge-reranker-v2-m3 로드(공유)
    ├── db.py             : MySQL(rag_chunk) 연결 + 스키마
    ├── indexer.py        : bge-m3 임베딩 → MySQL 저장(chunk_id upsert)
    ├── chunking.py       : 시맨틱 청킹 유틸(신규 자유형식 문서용)
    ├── query_transform.py: 검색 전 쿼리 변환(Groq 8b) — 미스매치 해소
    ├── retriever.py      : 2단계 검색 (dense 후보 → cross-encoder 리랭크)
    ├── generator.py      : 검색 결과 + LLM(Groq/Gemini) → 응답 생성
    └── eval/             : 검색 품질 평가셋 + 러너(Recall/MRR/Hit)
        │
        ▼
MySQL (3306, ttalkak) — Spring 백엔드와 동일 DB, rag_chunk 테이블
```

> 벡터 저장소로 MySQL을 사용한다(설계 문서의 "동일 DB 사용" 원칙). MySQL에는
> 벡터 ANN 인덱스가 없어 유사도 계산은 Python(numpy)에서 정확(brute-force)
> 코사인으로 수행한다. 현재 규모(수백~수천 청크)에서 충분히 빠르며, 규모가
> 커지면 retriever.py에서 ANN/캐시를 도입하면 된다.

### 검색 파이프라인 (/query)
1. **후보 추리기** — dense(bge-m3 코사인) 또는 **하이브리드**(dense+BM25를 RRF 융합, `use_hybrid` 기본 on)로 `fetch_k`(기본 20)개.
2. **리랭크** — bge-reranker-v2-m3로 재채점해 상위 `top_k` 반환(`use_reranker` 기본 on). 실패 시 후보 폴백.
3. **쿼리 변환(실험적, 기본 off)** — `use_query_transform`. 기법 코퍼스와 미스매치라 기본 비활성화(아래 평가).

> ⚠️ 하이브리드는 **리랭커와 함께** 쓸 때만 이득이다(리랭커 off + 하이브리드 on은 최악). 기본값(둘 다 on)이 최적 조합.

검색 품질 측정: `python eval/run_eval.py --all --qa qa_set_realistic.json`

#### 평가 결과 (현실 평가셋 40문항, 원시 사용자 프롬프트)
| 변형 | Hit@1 | Recall@5 | MRR@10 |
|---|---|---|---|
| dense (기준) | 0.675 | 0.950 | 0.795 |
| +하이브리드 | 0.650 | 0.800 | 0.732 |
| +리랭커 | 0.725 | 0.950 | 0.824 |
| **+하이브리드+리랭커(기본)** | **0.750** | **0.975** | **0.838** |

> 메모: ① 쉬운 기법셋(`qa_set.json`)은 dense가 Recall@5 0.975로 포화돼 변별 불가 → 현실셋으로 측정.
> ② 쿼리 변환은 키워드 확장이 코퍼스와 미스매치라 Hit@1 0.30으로 급락 → off.
> ③ 하이브리드 단독은 한국어 BM25 토큰화가 거칠어 악화, 그러나 리랭커와 결합 시 최고.

새 자유형식 문서 인덱싱 시 `chunking.semantic_chunks(text)`로 청킹 후 `Indexer().index(...)`.

> 벡터 저장소로 MySQL을 사용한다(설계 문서의 "동일 DB 사용" 원칙). MySQL에는
> 벡터 ANN 인덱스가 없어 유사도 계산은 Python(numpy)에서 정확(brute-force)
> 코사인으로 수행한다. 현재 규모(수백~수천 청크)에서 충분히 빠르며, 규모가
> 커지면 retriever.py에서 ANN/캐시를 도입하면 된다.

## 실행 순서

### 1. FastAPI 서버 실행

```bash
cd python-rag-server

pip install -r requirements.txt

# MySQL 접속 (.env 또는 환경변수, Spring과 동일 ttalkak DB)
#   DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD
#   또는 RAG_DB_URL=mysql+pymysql://user:pw@host:3306/ttalkak?charset=utf8mb4
# LLM 키
export GROQ_API_KEY=...        # 또는 GEMINI_API_KEY=...

# (최초 1회) 지식 PDF를 파싱→청킹→적합도 큐레이션→MySQL 인덱싱까지 한 번에
#   ① 사람이 직접 청킹한 기법 PDF (결정론적, 무료)
python ingest_knowledge.py --mode technique \
  --pdf data/rag_prompt_engineering_100_chunks_v1.pdf --collection pe_manual
#   ② 논문 자동 청킹 (LLM, 적합도 7점↑만)
python ingest_knowledge.py --mode paper --pdf data/papers/ --collection pe_auto
#   (검수만, DB 미저장)
python ingest_knowledge.py --mode paper --pdf data/papers/ --dry-run

# (구) index_pdf_direct.py 는 ingest_knowledge.py --mode technique 로 대체됨

python main.py
# → http://localhost:8000 에서 실행
# → http://localhost:8000/docs 에서 Swagger UI 확인
```

---

## 지식 수집 파이프라인 (2개 프로그램)

논문/가이드를 자동으로 모아 RAG에 넣기까지 **두 프로그램**으로 돌아간다.

```
[1] pdf_crawler.py            [2] ingest_knowledge.py
크롤링 11개 출처              다운로드된 PDF 일괄
→ 관련도 점수 → manifest      → 파싱·청킹·LLM 적합도(≥7)
→ PDF 통합 다운로드           → MySQL(rag_chunk) 인덱싱
   data/downloaded_pdfs/  ───────▶  --pdf data/downloaded_pdfs/
```

### `pdf_crawler.py` — 크롤링 → PDF 통합 다운로드

`crawl.py + pdfDownloadBycrawled.py` 를 하나로 통합·개선. 출처는 **레지스트리(SOURCES)**
한 항목으로 정의되고 4개 범용 핸들러(arxiv / semantic_scholar / github / html)가 처리한다.
arXiv·Semantic Scholar는 **원문 PDF를 직접 다운로드**, 가이드/블로그는 수집 텍스트로
**통합 PDF를 생성**한다. (robots.txt 캐싱·출처 교차 중복제거·재시도 포함)

```bash
pip install requests beautifulsoup4 tqdm reportlab

python pdf_crawler.py                      # 전체(crawl→download)
python pdf_crawler.py --stage crawl        # 메타데이터만 → data/prompt_data/manifest.json
python pdf_crawler.py --stage download     # manifest 기반 PDF만
python pdf_crawler.py --source arxiv_paper # 특정 출처만
python pdf_crawler.py --dry-run            # 수집 계획만 출력
python pdf_crawler.py --min-score 5        # 다운로드 사전 필터(최종 품질은 [2]가 LLM으로 결정)
```

옵션: `--stage`(all/crawl/download) `--min-score`(기본 4.0) `--source` `--per-section`
`--delay` `--dry-run`. 산출물: `data/downloaded_pdfs/`(논문은 `arxiv_paper/`·`semantic_scholar/`
하위, 텍스트 출처는 `<출처>.pdf` 통합본).

### 전체 흐름

```bash
python pdf_crawler.py                                  # ① 수집+다운로드
python ingest_knowledge.py --mode paper \              # ② 파싱+청킹+큐레이션
  --pdf data/downloaded_pdfs/ --collection pe_auto
```

#### `ingest_knowledge.py` — 논문/기법 PDF 큐레이션 인덱서 (2가지 모드)

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
python ingest_knowledge.py --mode technique \
  --pdf data/rag_prompt_engineering_100_chunks_v1.pdf --collection pe_manual

# [B] 논문 폴더 자동 청킹 (LLM, 7점↑만)
python ingest_knowledge.py --mode paper \
  --pdf data/papers/ --collection pe_auto

# 두 컬렉션을 같은 질의로 검색해 결과 비교 → 더 좋은 쪽 채택
#   POST /query {"query":"...", "collection_name":"pe_manual"} vs "pe_auto"

# 검수/저비용 옵션
python ingest_knowledge.py --mode paper --pdf x.pdf --dry-run --limit 1   # 1윈도만
python ingest_knowledge.py --mode technique --pdf x.pdf --score           # 사람 청킹분도 LLM 채점
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

### 인덱싱 (논문 청크 저장)

```bash
curl -X POST http://localhost:8080/api/rag/index \
  -H "Content-Type: application/json" \
  -d '{
    "chunks": [
      "Chain-of-thought prompting enables complex reasoning...",
      "Few-shot prompting improves model performance..."
    ],
    "metadata": [
      {"source": "Wei et al. 2022", "page": 1},
      {"source": "Brown et al. 2020", "page": 3}
    ]
  }'
```

### 질의 응답

```bash
curl -X POST http://localhost:8080/api/rag/query \
  -H "Content-Type: application/json" \
  -d '{"query": "chain-of-thought 프롬프팅이란 무엇인가요?"}'
```

응답:
```json
{
  "answer": "Chain-of-thought prompting은 모델이 복잡한 추론 과정을...",
  "sources": [
    {
      "text": "Chain-of-thought prompting enables...",
      "metadata": {"source": "Wei et al. 2022", "page": 1},
      "score": 0.923
    }
  ]
}
```

---

## 파일 구조

```
rag-service/
├── python-rag-server/
│   ├── main.py          # FastAPI 앱 진입점
│   ├── embeddings.py    # bge-m3 모델 로드(공유)
│   ├── db.py            # MySQL 연결 + rag_chunk 스키마
│   ├── indexer.py       # bge-m3 임베딩 + MySQL 저장
│   ├── retriever.py     # numpy 코사인 유사도 검색
│   ├── generator.py     # LLM 응답 생성
│   ├── index_pdf_direct.py  # 기법 PDF 파싱 + MySQL 직접 인덱싱
│   └── requirements.txt
│
└── spring-integration/
    ├── RagDto.java          # 요청/응답 DTO
    ├── RagService.java      # WebClient 호출 서비스
    ├── RagController.java   # REST 컨트롤러
    └── application-rag.yml  # 설정
```

## 배포 (Railway)

FastAPI 서버를 Railway에 올릴 경우:
1. `python-rag-server/` 폴더를 별도 Railway 서비스로 배포
2. 환경변수: LLM 키(`GROQ_API_KEY`/`GEMINI_API_KEY`) + DB 접속
   (`RAG_DB_URL` 또는 `DB_HOST/...`) — Railway MySQL 플러그인을 가리키게 설정
3. Spring Boot `application.yml`의 `rag.server.url`을 Railway URL로 변경

> 벡터는 Spring과 동일한 Railway MySQL(`rag_chunk` 테이블)에 저장된다.
> 별도 볼륨/벡터 DB가 필요 없다.

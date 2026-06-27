# RAG 파이프라인 구조 (팀 공유용)

> `POST /query` 한 건이 들어와 응답이 나가기까지의 전체 흐름과 핵심 설계 포인트 정리.
> 코드 위치는 `파일:줄`로 표기. 기준: `rag-server/` (FastAPI, bge-m3 + MySQL + reranker + LLM).
> 기본 설정: `use_reranker=True`, `use_hybrid=False`, `use_query_transform=False`, `use_hyde=False`.

---

## 0. 한눈에 보기

```
POST /query
  │  QueryRequest { query, collection="prompt_techniques", top_k=5,
  │                 model="gemini-2.0-flash", history, use_reranker=T, use_hybrid=F, ... }
  ▼
[A] 검색 쿼리 결정      main.py:156-162   (기본: 원본 / 옵션: HyDE·키워드 변환)
  ▼
[B] 검색 (2단계)        retriever.py:84
   ├ B1 컬렉션 전체 로드 (MySQL rag_chunk)        retriever.py:182
   ├ B2 1단계 후보 50개  (bge-m3 dense 코사인)     retriever.py:117
   └ B3 2단계 리랭크 → top 5 (cross-encoder)       retriever.py:166
  ▼
   검색결과 0 & history 없음 → 404                  main.py:173
  ▼
[C] 생성 (LLM)          generator.py:170/207   (참고기법 + 원본 프롬프트 → 개선/질문 모드)
  ▼
[D] 후처리·파싱 → 응답  main.py:190-202   (정규식으로 블록 추출, 추가 LLM 호출 없음)
  ▼
QueryResponse { answer, improved_prompt, sources, techniques_applied, changes }
```

- **컴포넌트 3종**: 임베딩(bge-m3) · 리랭커(bge-reranker-v2-m3) · 생성 LLM(Groq/Gemini)
- **저장소**: MySQL `rag_chunk` (Spring 백엔드와 **동일 DB** `ttalkak` 공유)
- **호출 경로**: Chrome 확장 → Spring(:8080) `/api/prompts/improve` → rag-server(:8000) `/query`

---

## 1. 단계별 상세

### [A] 검색 쿼리 결정 — `main.py:156-162`
- 기본값: `search_query = req.query` (원본 그대로)
- `use_hyde` ON → `query_transform.hyde()` (가상 기법문서 생성)
- `use_query_transform` ON → `query_transform.transform()` (키워드 줄 생성)
- **검색용 쿼리와 생성용 쿼리를 분리** → 자세히는 §2-(1)

### [B] 검색 — `retriever.py:84 search()`
- **B1. 컬렉션 로드** (`retriever.py:182`)
  - MySQL `rag_chunk`에서 `collection_name` 일치 행을 `id` 순으로 `SELECT document, metadata, embedding`
  - 임베딩(JSON) → numpy 배열. **매 쿼리마다 전체 로드** → 자세히는 §2-(3)
- **B2. 1단계 후보 추리기** (`_candidates`, `retriever.py:117`)
  - 리랭크 ON이므로 후보 폭 `stage1_k = max(fetch_k=50, top_k=5) = 50` (`retriever.py:103`)
  - `_dense_scores`: bge-m3로 쿼리 인코딩 → 전체 행렬과 **numpy 코사인** (`retriever.py:139, 199`)
  - `use_hybrid=False` → BM25 건너뜀, `argsort(-dense)[:50]`
  - (하이브리드 ON 시: BM25(kiwipiepy 형태소) 점수와 **RRF 융합**, `_rrf_order` 156 — 기본 off)
- **B3. 2단계 리랭크** (`_rerank`, `retriever.py:166`)
  - `bge-reranker-v2-m3`에 `(query, doc)` 50쌍 → logit → **sigmoid(0~1)** → 정렬 → **top_k=5**
  - 표시 `score`는 평탄한 sigmoid 대신 **dense 코사인으로 환산**해 노출 (순위만 리랭커 기준)
  - 리랭커 예외 → 후보 상위 5개로 **폴백** (검색 안 끊김, `retriever.py:112`)
- **결과**: 관련 기법 청크 5개 `{text, metadata{technique, category, source, chunk_id}, score}`

### [C] 생성 — `generator.py`
- **백엔드 자동선택** (`Generator.__init__`, `generator.py:274`)
  - `GROQ_API_KEY` 있으면 **Groq 우선**, 없으면 Gemini (현재 `.env`엔 Groq만 → Groq)
  - `model="gemini-2.0-flash"` → Groq `GROQ_MODEL_MAP`으로 **`llama-3.3-70b-versatile`** 매핑 (`generator.py:156`)
- **메시지 구성** (`generator.py:175`)
  - `system` = `SYSTEM_PROMPT` (프롬프트 엔지니어 페르소나 + 질문/개선 모드 규칙)
  - `history`(대화 맥락) 정제 후 삽입 (`_sanitize_history`, 121)
  - `user` = `"[참고 기법]\n{5개 청크 포맷}\n\n[원본 프롬프트]\n{query}"` (`_build_technique_context`, 135)
  - 파라미터: `temperature=0.7`, `max_tokens=4096` (긴 원문을 개선프롬프트에 verbatim 포함해도 안 잘리도록 2048→4096 상향, 2026-06-27)
- **두 모드 중 하나로 응답** (SYSTEM_PROMPT가 결정)
  - **개선 모드**(기본): `**개선된 프롬프트:**` / `**적용한 기법:**` / `**개선 포인트:**` 블록
  - **원문 보존 원칙**: 사용자가 가공·변환할 원문(회의록·이메일·코드 등)을 주면 개선프롬프트에 **원문 그대로(verbatim) 포함** (SYSTEM_PROMPT 규칙, 2026-06-26)
  - **질문 모드**(예외): (A)작업종류·(B)핵심주제 특정 불가 시 `**확인이 필요해요 🤔**` + 질문
- 후처리: `_strip_cjk_noise`로 **한글에 직접 붙은** 한자 오염 토큰만 제거 (`generator.py:9`). ⚠️ 공백·따옴표로 분리된 외국어(번역 원문 등)는 보존(2026-06-27 수정)

### [D] 후처리·응답 — `main.py`
- 빈/None 생성 응답 가드: `answer`가 비면 **503**(이전엔 `extract_improved_prompt(None)` → 500 크래시, 2026-06-27)
- **정규식 파싱**(추가 LLM 호출 없음)
  - `extract_improved_prompt` → `improved_prompt` (개선 블록 없으면 `""` = 질문 모드)
    - 종료점은 **구조 마커(`적용한 기법`/`개선 포인트`)** 기준 → 개선프롬프트에 담긴 원문 속 `---`에서 안 잘림(중간 `---` 보존, 꼬리만 제거, 2026-06-27 수정)
  - `extract_applied_techniques` → `techniques_applied[]`
  - `extract_changes` → `changes[]`
- `sources` = 검색된 청크 5개 (`text[:300]`, metadata, score)
- 프론트 규약: `improved_prompt`가 비면 **Execute 버튼 숨김**

---

## 2. 핵심 설계 포인트 4가지

### (1) 검색 쿼리 ≠ 생성 쿼리
- **검색([B])은 `search_query`, 생성([C])은 항상 원본 `req.query`** (`main.py:180`)
- 이유: 검색이 매칭할 대상은 **기법 카드 코퍼스**, 생성이 다룰 대상은 **사용자 실제 의도·내용** → 최적 입력이 다름
- 변환 함수 (`query_transform.py`)
  - `transform()` (71): Groq `llama-3.1-8b-instant`, 출력=**키워드 한 줄** (예: `역할 부여, 출력 형식, 톤`)
  - `hyde()` (101): Groq `llama-3.3-70b-versatile`, 출력=**기법 카드형 가상문서**, 반환은 `원본+가상문서`
  - 모든 실패 경로에서 **원본 쿼리 반환** → 변환이 검색을 절대 끊지 않음
- **변환문은 생성기에 도달하지 않음** → 켜져도 원문은 100% 보존, 순수 "검색 렌즈"
- **기본 둘 다 off**: 동질적 기법 코퍼스에선 측정상 오히려 검색 악화 (WORKLOG 2026-06-21) → opt-in 보존

### (2) 임베딩 모델 1개 공유 + 별도 리랭커 — `embeddings.py`
- **bge-m3 임베딩 모델은 프로세스당 1회 로드** 후 Indexer·Retriever **공유** (`get_model`, 캐시 `_model_cache`)
  - 과거엔 둘이 각각 로드해 메모리 2배였음 → 단일화
  - dense 임베딩 **1024차원**, 인덱싱·검색 **동일 모델**이라 벡터 공간 일치 보장
- **리랭커 bge-reranker-v2-m3는 cross-encoder, 별도·지연 로드** (`get_reranker`, ~568M 파라미터)
  - bi-encoder(임베딩)는 쿼리·문서를 따로 벡터화(빠름, 후보 회수), cross-encoder는 (쿼리,문서) **쌍을 함께** 보고 정밀 채점 → 2단계 분업
- **디바이스 선택** (`_select_device`, 19): macOS는 MPS 메모리 위험 → **CPU**, 그 외 CUDA 가능하면 GPU
- 운영 메모: HF Xet 연결 리셋 회피 위해 `HF_HUB_DISABLE_XET=1`(다운로드)·`HF_HUB_OFFLINE=1`(이후)

### (3) 벡터 인덱스 없음 — brute-force 코사인 — `retriever.py`
- MySQL엔 **ANN(근사최근접) 인덱스 없음** → 매 쿼리마다 컬렉션 전체를 메모리로 올려 **numpy 전수 코사인** (`_load_collection` 182 → `_dense_scores` 139)
- 현재 규모(~100청크) **~1ms 수준**으로 충분
- 설계 근거: "Spring 백엔드와 동일 DB 사용" 원칙(별도 벡터 DB 제거, 배포 단순화) > 검색 최적화 (WORKLOG 2026-06-19)
- ⚠️ **확장 시 병목**: 코퍼스가 수천~수만으로 커지면 이 전수 스캔이 한계 → ANN/캐시/pgvector류 도입 검토 필요

### (4) 출력은 정규식 파싱 의존 — `main.py`
- 생성 응답에서 **마커 기반 정규식**으로 `improved_prompt`/`techniques`/`changes` 추출 (별도 LLM·JSON 강제 없음)
- 종료점은 **구조 마커** 기준이라 원문 속 `---`에는 안 잘림(2026-06-27 수정). 빈 응답은 503 가드.
- ⚠️ **남은 취약점**: LLM이 마커(`**개선된 프롬프트:**`)를 아예 안 지키면 `improved_prompt`가 비어 **Execute 버튼이 안 뜸**
- 백로그: 설계 문서의 구조화 응답 `{ improved, score, changes[] }`(정규식 의존 제거) — 미착수

---

## 3. 기본 설정값 / 튜닝 포인트

| 항목 | 기본값 | 위치 | 비고 |
|---|---|---|---|
| `top_k` | 5 | `main.py` QueryRequest | 최종 반환 청크 수 |
| `fetch_k` | 50 | `main.py:24` Retriever | 1단계 후보 폭(리랭크 입력) |
| `use_reranker` | True | `main.py:24` | 측정상 단독이 최고 |
| `use_hybrid` | False | `main.py:24` | 한국어 코퍼스에서 악화 → off |
| 생성 모델 | gemini-2.0-flash→llama-3.3-70b | `generator.py:156` | Groq 매핑 |
| 생성 temp/tokens | 0.7 / 4096 | `generator.py` | tokens는 긴 원문 verbatim 대비 4096 |
| collection | prompt_techniques | QueryRequest | 기법 카드 컬렉션 |

---

## 4. 알려진 한계 · 백로그

- ✅ **생성기 원문 페이로드 누락** (uplift_eval 발견): SYSTEM_PROMPT에 "원문 verbatim 포함" 규칙 추가로 해결(2026-06-26). 후속 버그(추출 `---` 잘림·노이즈 과삭제)도 수정(2026-06-27).
- 🟡 **긴 원문 truncation**: 원문 verbatim 포함 + 출력 한도. `max_tokens` 4096으로 완화했으나 매우 긴 문서는 여전히 잘릴 수 있음 → 장문은 청크 분할/요약 선처리 검토
- 🟡 **벡터 인덱스 부재**: 코퍼스 확장 시 brute-force 병목 (§2-(3))
- 🟡 **정규식 파싱 취약** (§2-(4)): LLM이 마커 자체를 안 지키는 경우 — 구조화 응답으로 전환 검토
- 🟡 **생성 출력 라틴 깨짐**: Groq 70b 응답에 `_highlight` 류 토큰 혼입(한자 노이즈는 `_strip_cjk_noise`로 제거). 모델 교체/후처리 검토
- 🟡 **Groq 무료 티어 TPD 100k**: 평가/운영 시 토큰 한도 고려

---

## 5. 품질 측정 도구 (`rag-server/`에서 `python3 -m ...`)

| 명령 | 측정 대상 | 핵심 지표 |
|---|---|---|
| `python3 -m eval.run_eval --qa qa_set_realistic.json` | **검색(R)** | Hit@1 / Recall@1·3·5 / NDCG@5 / MRR@10 |
| `python3 -m eval.gen_eval` | **생성(G) — 개선프롬프트 지시문 품질** | mode_fit / grounding / mode_accuracy |
| `python3 -m eval.uplift_eval` | **결과 상향 — raw vs 개선 결과물 A/B** | 개선 승률 / 평균 점수 Δ |

> 검색·생성·실효용을 분리 측정. "개선 프롬프트가 좋다"(G)와 "결과물이 실제로 좋아진다"(uplift)는 다른 축.

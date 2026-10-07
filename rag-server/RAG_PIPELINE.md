# RAG 파이프라인 구조 (팀 공유용)

> `POST /query` 한 건이 들어와 응답이 나가기까지의 전체 흐름과 핵심 설계 포인트 정리.
> 코드 위치는 `파일 함수명`으로 표기(줄 번호는 코드가 바뀔 때마다 어긋나 쓰지 않는다 — 2026-09-20 전수조사). 기준: `rag-server/` (FastAPI, bge-m3 + MySQL + reranker + LLM).
> 기본 설정: `use_reranker=True`, `use_hybrid=False`, `use_hyde=False`, `use_query_transform=False`, `min_score=0.40`.
> 생성은 **2단계**(분석기 temp 0.2 → 생성기 temp 0.7) — 규약 v3, §1-[C0]/[C].

> **⚠️ 2026-08-21 모델 교체 (중요)**: Groq가 **llama-3.x 계열을 폐기**해(`404 model_not_found`)
> 아래 본문에 등장하는 `llama-3.3-70b-versatile` / `llama-3.1-8b-instant` 는 **더 이상 호출되지 않는다**.
> 현재 **기본** 사용 모델은 **생성 `openai/gpt-oss-120b`, 판단·변환 `openai/gpt-oss-20b`** (TPM 실측 각 8000).
> **⚠️ 2026-09-27 백엔드 환경변수화**: 생성 백엔드는 `GEN_PRIMARY`(groq|gemini, 기본 groq), Gemini 모델은 `GEMINI_MODEL`(예 `gemini-3.6-flash`), 분석기는 `ANALYZER_BACKEND`(groq|gemini)·`ANALYZER_MODEL`(기본 `gemini-3.5-flash-lite`)로 고른다. 미설정이면 위 기본(Groq)과 동일. 제미나이 메인은 결제 Tier 1 필요. **모델을 바꾸면 gen_eval 재측정 필요**(프롬프트는 gpt-oss 기준). (WORKLOG 2026-09-27)
> 본문의 70b/8b 서술은 **교체 시점까지의 측정 근거로서 보존**한 것이며, 그 수치는 폐기 전 모델 기준이다.
> 특히 `analyzer`·`query_transform` 은 폐기 이후 404 를 삼킨 채 동작해 왔으므로(분석 없이 진행),
> 그 기간에 나온 평가 수치는 **분석기가 빠진 상태**의 값일 수 있어 재측정이 필요하다. (WORKLOG 2026-08-21)

---

## 0. 한눈에 보기

```
POST /query
  │  QueryRequest { query, collection="prompt_techniques", top_k=5, min_score=0.40,
  │                 model="gemini-2.0-flash", history, use_reranker=T, use_hybrid=F,
  │                 use_examples=T, n_examples=2, example_min_score=0.40, ... }
  ▼
[A] 검색 쿼리 결정      main.py retrieve_contexts()   (기본: 원본 그대로 / 옵션: HyDE·키워드 변환 — 둘 다 off)
  ▼
[B] 기법 검색 (2단계+컷) retriever.search()   (컬렉션 prompt_techniques)
   ├ B1 컬렉션 전체 로드 (MySQL rag_chunk)        _load_collection()
   ├ B2 1단계 후보 50개  (bge-m3 dense 코사인 —    _candidates()
   │                     본문 벡터 ∪ 검색뷰 벡터의 max)
   ├ B3 2단계 리랭크 → top 5 (cross-encoder 또는 호스티드 API)  _rerank()
   └ B4 유효 유사도 컷   (dense < min_score 제외)   search()
  ▼
   검색결과 0 & history 없음 → 404                  main.py query()
  │                                                (⚠️ 실사용 6%에서 발동 — §4 참조)
  ▼
[B+] 예시 검색 (타입별)  main.py query()   (컬렉션 prompt_examples: 원본요청 매칭 dense top-N,
  │                                         리랭커 생략, example_min_score 컷 → 관련無면 0건)
  ▼
[C0] 요청 분석 (1단계)   analyzer.py        (temp 0.2 · 별도 LLM 호출 — 이 요청에 필요한
  │                                        필드를 동적 도출: {name, role, status, value})
  │                                        role: required | fact | framing
  ▼
[C] 생성 (2단계, JSON)  generator.py       (temp 0.7 · [요청 분석] + 참고기법 + 참고예시 + 원본
  │                                        → JSON {mode, improved_prompt, questions, ...})
  │                                        filled=재료 / empty·fact=[빈칸]+질문 / empty·framing=가정
  ▼
[D] 파싱·복원 → 응답    main.py run_generation() → postprocess.assemble_fields()
  ▼                       (JSON 파싱 → 필드 조립 + answer 마크다운 복원, 실패 시 정규식 폴백)
QueryResponse { mode, answer, improved_prompt, sources, techniques_applied,
                changes, score, summary, questions[{field,question,reason,importance}], fields }
```

- **응답의 mode 가 프론트 분기의 단일 기준** — `"improve"`(개선안) / `"ask"`(추가 질문). 프론트는 `improved_prompt==""` 같은 추측 대신 `mode` 로 분기한다. **`questions[]` 는 두 모드 모두에서 렌더**한다 — `ask`면 핵심 질문, `improve`면 개선안과 함께 보여주는 **선택 질문**(하이브리드). 상세 계약은 별도 공유하는 백엔드/프론트 계약 문서(`CONTRACT_MAKE_PIPELINE.md`) 참조.

- **컴포넌트 3종**: 임베딩(bge-m3) · 리랭커(bge-reranker-v2-m3 torch, 또는 호스티드 API=Cohere/Jina/Voyage · `RAG_RERANK_BACKEND`) · 생성 LLM(Groq/Gemini)
- **저장소**: MySQL `rag_chunk` (Spring 백엔드와 **동일 DB** `ttalkak` 공유)
- **컬렉션 2종**: `prompt_techniques`(기법 정의 카드 **170**, 그중 검색 대상은 층 필터 통과분 `user_instruction` 123 · 제외 `system` 28·`degenerate` 10·`meta` 9 — 2026-09-20 실측) + `prompt_examples`(유사 요청 개선 사례 **131**, 타입별 주입 — 2026-07-23 A안 검증 후 도입). 둘을 **따로 검색**해 한 풀에서 경쟁시키지 않음(타입별 멀티 컬렉션).
- **호출 경로**: Chrome 확장 → Spring(:8080) `/api/prompts/improve` → rag-server(:8000) `/query`
- **쓰기 보호**: `POST /index`는 `RAG_INDEX_API_KEY` 설정 시 `X-API-Key` 헤더 필수(403), **미설정이면 엔드포인트 자체가 503(fail-closed)** — 종전 '경고 후 허용'은 실제로 무인증 노출이 돼 2026-09-13 에 막았다(`_verify_index_key`). 저장소에 `/index` 를 호출하는 코드는 없다(적재는 `ingestion/*` 가 DB 직접 기록)

---

## 1. 단계별 상세

### [A] 검색 쿼리 결정 — `main.py retrieve_contexts()`
- **기본값: 둘 다 off → `search_query = req.query`** (원본 그대로).
- `use_hyde` ON → `query_transform.hyde()` (거친 요청 → 기법 카드형 가상문서, `원본+가상문서`로 검색). 실패 시 원본 폴백.
- `use_query_transform` ON → `query_transform.transform()` (키워드 줄 생성 — 카드 장르 미스매치로 hyde보다 열등)
- **HyDE 이력 — 켰다가 되돌렸다**: 2026-07-29에 기본 ON으로 켰다(코퍼스 '기법 설명 카드' vs 입력 '거친 작업지시'의 **문체 장르 미스매치**로 dense가 0.34~0.48 좁은 띠에 눌려 `min_score=0.40`이 그 한복판을 자르던 문제 — "제주도 여행 블로그 글 써줘"에 "아이랑 3박4일"을 붙이면 0.36으로 떨어져 **404**). HyDE는 점수를 0.69~0.84로 끌어올렸으나, **2026-07-30 재평가에서 정확도를 크게 해치는 것이 확인돼 되돌렸다** — 170코퍼스 실측 raw R@5 **0.763** vs +HyDE **0.441**, Hit@1 0.627 vs 0.271. 카드 장르로 재작성하는 성질이 **제네릭 카드 오회수**를 유발한다.
- ⚠️ 되돌림과 함께 **404 문제도 되살아났다**(2026-08-09 실측 17% → 멀티표현 적용 후 6%). 근본 원인과 후속 설계는 §4 참조.
- **검색용 쿼리와 생성용 쿼리를 분리** → 자세히는 §2-(1)

### [B] 검색 — `retriever.py search()`
- **B1. 컬렉션 로드** (`_load_collection`)
  - MySQL `rag_chunk`에서 `collection_name` 일치 행을 `id` 순으로 `SELECT document, metadata, embedding, embedding_views`
  - 임베딩(JSON) → numpy 배열. **매 쿼리마다 전체 로드** → 자세히는 §2-(3)
- **B2. 1단계 후보 추리기** (`_candidates`)
  - 리랭크 ON이므로 후보 폭 `stage1_k = max(fetch_k=50, top_k=5) = 50`
  - **fetch_k=50 (2026-09-13 변경)** — 종전 20 의 근거(2026-07-05 스윕)는 108~134청크 시절 값이라 소멸했다. 커버리지 97% 평가셋으로 재측정: 10=0.777/0.386 · 20=0.763/0.421 · 50=0.763/**0.474** (기존셋 R@5 / 신규셋 R@5). **기존셋에서 20과 50이 동일**하므로 쉬운 구간 손실 0, 어려운 구간 +5.3pp, 비용은 지연 2.0s→4.5s 뿐
  - `_dense_scores`: bge-m3로 쿼리 인코딩 → 전체 행렬과 **numpy 코사인**
  - **멀티표현 max 풀링(2026-08-09)**: 행이 `embedding_views`(검색용 축약뷰 벡터)를 가지면 **본문 벡터와 뷰 벡터 중 최고 점수**를 그 행 점수로 쓴다. 뷰가 없는 행(`NULL`)은 종전과 완전히 동일 → 자세히는 §2-(5)
  - `use_hybrid=False` → BM25 건너뜀, `argsort(-dense)[:50]`
  - (하이브리드 ON 시: BM25(kiwipiepy 형태소) 점수와 **RRF 융합**, `_rrf_order` 165 — 기본 off)
- **B3. 2단계 리랭크** (`_rerank`)
  - `bge-reranker-v2-m3`에 `(query, doc)` 50쌍 → logit → **sigmoid(0~1)** → 정렬 → **top_k=5**
  - 표시 `score`는 평탄한 sigmoid 대신 **dense 코사인으로 환산**해 노출(순위만 리랭커 기준), `rerank_score`(sigmoid) 병기
  - 리랭커 예외 → 후보 상위 5개로 **폴백** (검색 안 끊김)
- **B4. 유효 유사도 컷** (`search()` 3단계, 기본 `min_score=0.40`)
  - `score`(dense 코사인) < min_score 인 결과를 top_k에서 **제외**
  - 신호·임계치는 측정으로 결정: 리랭커 확률은 정답/오답 분리 전무(p50 0.503 vs 0.500)라 **dense 채택**, τ=0.40은 recall 무손실(0.839)·빈결과 0% 지점 (`eval/score_analysis.py`, 코퍼스 변경 시 재측정)
  - 🔴 **그 τ는 지금 운영 분포에서 유효하지 않다 (2026-08-09 실측)**: 근거가 된 측정은 `qa_set`(기법을 찾는 **질문형**) 분포였는데, 운영에 들어오는 것은 **거친 작업지시**다. 실사용 입력 18개 중 **404 3건(17%)**, 동시에 무관 입력 8개 중 **5건이 통과**(`https://example.com` 0.538 · `1+1은?` 0.462 · `안녕하세요` 0.419). **정상 min 0.336 < 무관 max 0.538 — 분포가 겹쳐 어떤 임계치로도 분리 불가.**
  - 근본 원인은 임계치가 아니라 **코퍼스 구성**이다: 기법 카드에 대한 관련성 판별력은 **AUC 0.575(≒무작위)**, 같은 쿼리로 `prompt_examples`는 **AUC 1.000(완전분리)**. → §4 및 WORKLOG 2026-08-09.
  - 현재 무의미 입력의 실질적 최종 게이트는 404가 아니라 **생성 단계의 `mode=ask`**(무엇을 개선할지 되물음)다.
- **결과**: 관련 기법 청크 ≤5개 `{text, metadata{technique, category, source, chunk_id}, score, rerank_score}`

### [C0] 요청 분석 (1단계) — `analyzer.py` (규약 v3, 2026-07-31)
- **별도 LLM 호출 · `temp 0.2` · `openai/gpt-oss-20b`(`reasoning_effort=low`, 2026-08-21 교체 — 종전 `llama-3.1-8b-instant`)** — 요청에 필요한 필드를 **동적으로 도출**(고정 표 아님).
  출력 `{taskType, fields:[{name, role, status, value}]}`
- **역할 3종**: `required`(비면 무엇을 만들지 안 정해짐) / `fact`(지어내면 거짓 — 날짜·가격·수치·스펙·고유명사) / `framing`(가정 가능 — 톤·대상·분량·형식)
- **왜 2단계로 분리**: 분석은 결정적이어야(저temp), 생성은 자연스러워야(고temp) — 최적 온도가 반대. 한 호출로 합치면 필드·mode 판정이 흔들림(실측: 한 호출 일관성 0.23~0.75 → 분리 0.86~1.00)
- **프롬프트 설계 주의**(전수조사로 확인): ①구체 시나리오 예시를 길게 쓰면 소형 모델(당시 8b)이 무관한 요청에 복사(오염) → 짧은 목록만 제시 ②"포함 핵심내용" 류 만능 필드를 만들면 항상 required+empty로 잡혀 강제 ask → 프롬프트 금지 + `_sanitize()`로 코드 차단 ③fact 분류 예시를 필드명으로 복사하는 오염도 발생 → "분류 기준일 뿐 필드명 아님" 명시
- **status 판정이 mode 정확도를 지배**: 단서가 있으면 filled(관대), 단 결과물 '종류'를 가리키는 말(대본·제품·글)은 주제가 아님. 전수조사 mode 정확도 0.78→0.72→**0.83**(gen_set 18)
- **실패 시 `None`** → 분석 없이 기존 단일 단계로 진행(무회귀). `None` 은 **분석 실패만** 뜻한다(키 없음·호출 실패·JSON 파싱 실패·산출물 전무). 필드가 비어도 `techniqueAxes` 가 있으면 dict 를 돌려준다 — 축은 필드와 독립 산출물이고 축 라우팅의 입력이다(2026-09-08). 필드만 빈 경우 생성 경로는 `analysis=None` 과 완전히 동일(`build_analysis_block` 이 `""` 반환)
- **정제 규칙 관측**: `_sanitize()` 의 방어 발동이 `sanitize_stats()` 에 규칙별로 집계된다(`junk`·`task_word`·`framing_coerced`·`role_unknown`·`required_over_cap`·`not_dict`). ⚠️ 이 규칙들의 근거는 **폐기된 `llama-3.1-8b-instant` 실측**이고 현 `openai/gpt-oss-20b` 에서 재측정된 적이 없다 — 카운터가 그 판정 수단이다(2026-09-08)
- **규칙 5 코드 강제**(`_exempt_template_source`, 2026-09-19): "~하는 프롬프트 만들어줘"(템플릿 요청, `is_template_request` — 프롬프트를 꾸미는 현재형 관형절 `는/위한/용 프롬프트`, 뒤에 개선 동사가 오면 제외)에서 **비어 있는 원문 계열 required**(`원문`·`원본`·`본문`·`텍스트`)를 `fact` 로 강등한다. 프롬프트의 [작업유형별 required] 목록(`번역: 원문`·`요약: 요약할 원문`)이 규칙 5 와 충돌해 모델이 **24회 중 13회** 위반했다(eval/analyzer_rule5_eval.py). 발동은 `sanitize_stats()['template_source_demoted']`. 분석 결과에 `templateRequest` 를 실어 생성기로 넘긴다(응답 `fields` 에는 안 나감)
- **규칙 5 의 대칭 + 리뷰 교정**(2026-09-20): ①`_require_referenced_source` — "이 이메일 번역해줘"처럼 **특정 원문을 가리키지만 붙여넣지 않은** 요청(`references_missing_source` — 독립 낱말 지시어 + 재료 명사, 200자 이하)은 빈 원문을 `fact`→`required` 로 올려 되묻게 한다. 실측 대조군 ask 유지 4/7 → **14/14**(가드 발동 6회). ②`_drop_implement_field_for_review` — 리뷰·리팩터 요청(`is_review_request`)에서는 `코드: 구현할 기능` 목록이 잘못 적용되므로 빈 `구현할 기능` required 를 `fact` 로 내린다(실측 리뷰 15회 중 11회 도출). 필드명은 영문도 매칭한다(`implementation feature` — 실측). 새로 짜는 요청은 그대로 required. **가드 우선순위: 가리킴 > 리뷰** — "이 함수 버그 찾아줘"처럼 가리킨 코드가 없는 리뷰는 되물어야 하므로 ②가 발동하지 않는다(실측 2026-09-22: 이 순서가 없으면 improve 3/3 으로 새어나갔다). 코드 묶음 mode 정확도 라이브 14/14
- ⚠️ **비용**: 요청당 LLM 호출 +1(≈1~4초). gpt-oss-20b 도 무료 TPM 8,000 이라 동시 트래픽에서 429 가능(생성과 같은 Groq 쿼터를 나눠 쓴다) — 그때는 `None` 폴백이라 기능은 유지되나 분석 이점이 사라진다(모델/티어 상향은 백로그)
- **멀티턴**: `history`를 함께 넣어 매 턴 필드 상태를 재구성 → 이전 턴에 답한 항목은 `filled`가 되어 **같은 질문 반복을 구조적으로 차단**

### [C] 생성 (2단계) — `generator.py`
- **`[요청 분석]` 블록 소비**(`build_analysis_block`): filled=재료 / empty·fact=**`[항목명 입력]` 빈칸 + 질문** / empty·framing=가정 후 `changes` 명시 / **템플릿 요청의 빈 원문=`[template]` — 되묻지 말고 `[원문 붙여넣기]` 빈칸 + 개선 모드**(2026-09-19. 종전 렌더로는 분석기를 고쳐도 생성기가 "원문이 제공되지 않아" ask)
- **환각 방지 핵심 규칙**: 사용자가 **주지 않은** 구체 사실은 창작 금지·빈칸. 사용자가 **준** 원문(회의록·코드)은 verbatim·빈칸 금지 (두 규칙이 충돌하지 않도록 SYSTEM_PROMPT에서 명시 구분)
- **백엔드 자동선택 + 요청 단위 라우팅** (`Generator`)
  - `GROQ_API_KEY` 있으면 **Groq 우선**, 없으면 Gemini (현재 `.env`엔 Groq만 → Groq)
  - **장문 라우팅** (`_needs_long_context`): Groq TPM 예산으로 verbatim 원문 출력이 불가능한 긴 입력은 **Gemini로 라우팅** — 두 키가 모두 설정된 경우에만 작동(2026-07-23)
  - **런타임 폴백**: Groq 실패(429 재시도 소진 등) 시 Gemini 가용하면 1회 폴백
  - `model="gemini-2.0-flash"` → Groq `GROQ_MODEL_MAP`으로 **`openai/gpt-oss-120b`** 매핑(`gemini-1.5-flash`→`gpt-oss-20b`) (`generator.py:219`)
- **메시지 구성** (`build_messages` · Gemini 는 `contents` — **user 본문은 두 백엔드가 `_compose_user_message` 한 곳을 공유**, 2026-09-20)
  - `system` = `SYSTEM_PROMPT` (프롬프트 엔지니어 페르소나 + 질문/개선 모드 규칙)
  - `history`(대화 맥락) 정제 + **최근 6,000자 예산 컷** — 오래된 턴부터 폐기, 턴 내용은 안 자름(verbatim 보호), 최신 턴은 초과여도 유지 (`_sanitize_history`). 상한 없으면 긴 스레드에서 출력 예약이 하한까지 죽는 것 방지(2026-07-23)
  - `user` = `"[참고 기법]\n{기법 청크}\n\n[참고 예시]\n{예시 청크}\n\n[원본 프롬프트]\n{query}"` — 기법/예시를 `metadata.kind`로 **분리 렌더**(`_build_context_blocks`/`_build_example_context`). **예시 컨텍스트가 0개면 `[참고 기법]…`만 출력 → 종전과 바이트 동일**(무회귀, 2026-07-23 C안)
  - 파라미터: `temperature=0.7`(`GEN_TEMPERATURE` 환경변수로 오버라이드 — 평가 비교용), `max_tokens`는 **TPM 예산 내 동적 산정**(`_fit_max_tokens` — 입력은 **출처별로** 추정(`GroqGenerator.estimate_input` — 고정 입력 SYSTEM_PROMPT·기법 카드 블록은 `_est_known_tokens` 한글 0.75, 사용자 입력 질의·이력·분석값은 `_est_tokens` 한글 1.0, **예시 카드 블록**(거친 요청을 말투째 인용)은 `_est_example_tokens` 한글 0.85 — 계수는 코퍼스 전량 실측의 '필요 한글계수' 최댓값(기법 0.678·예시 0.774) 위 10% · 공통 영숫자 0.25·기타 0.8, gpt-oss usage.prompt_tokens 실측 보정 2026-09-20. 종전 llama 계수는 운영 요청을 17~18% 과대추정해 예약 ~1,000 을 헛되이 깎았고 일본어는 과소추정했다 — `eval/token_calib.py`. 배정 예산·실사용은 `[Generator] 예산 …` 로그로 남는다, gpt-oss 두 모델 모두 무료 8k 예산, 상한 4096·하한 512). Groq는 입력+출력예약 합산이라 긴 원문에서 413 나던 것 방지(2026-07-07). **TPM 예산은 `GroqGenerator._tpm` — `GROQ_TPM_LIMIT` 환경변수(유료 티어, 예: 250000), 미설정이면 무료 표(gpt-oss 8k)**. 장문 라우팅도 같은 값을 쓴다(2026-09-20 — 상수 고정이라 결제해도 예산이 안 늘던 것)
  - **출력 예산 부족 복구**(2026-09-20): gpt-oss 는 JSON 앞에 추론 토큰을 쓰므로 예산이 모자라면 ①`400 json_validate_failed`(JSON 시작 전 소진) ②`finish_reason="length"`(중간 잘림 → 정규식 폴백으로 **조용히** 깨진 개선안)로 갈린다. 둘 다 `_BudgetShort` 로 잡아 **그 요청만** `reasoning_effort="low"` 로 1회 재시도한다(기본 경로의 추론량은 미검증이라 그대로). 실측 #6: 종전 2/2 잘림 → 재시도 도입 후 2/2 정상(1회는 직접 `stop`, 1회는 재시도로 완료 660 `stop`). low 로도 잘리면 경고만 남기고 부분 결과를 돌려준다
  - Groq `response_format=json_object` / Gemini `response_mime_type=application/json` — **JSON 출력 강제**. Gemini는 `system_instruction` + `contents` 배열(정식 멀티턴) 사용 — 과거의 한 문자열 평탄화 제거(2026-07-23)
  - **Groq 에러 매핑**: 429는 대기시간 짧으면(≤20s) 1회 재시도, 그 외/재시도 소진은 `RuntimeError`로 변환 → `/query`가 **503**으로 응답(기존엔 그대로 500) (2026-07-23)
- **두 모드 중 하나로 응답** (SYSTEM_PROMPT [출력 형식 — JSON]이 스키마 정의, 2026-07-05)
  - **개선 모드**(기본): `{mode:"improve", improved_prompt, techniques[{name,reason}], changes[], score(1~10), summary, questions[]}`
  - **원문 보존 원칙**: 사용자가 가공·변환할 원문(회의록·이메일·코드 등)을 주면 improved_prompt에 **원문 그대로(verbatim) 포함** (SYSTEM_PROMPT 규칙, 2026-06-26)
  - **질문 모드**(예외): 핵심 주제 특정 불가 시 `{mode:"ask", questions[], summary}`. summary=파악한 작업+무엇이 비었는지
  - ⭐ **하이브리드(규약 v3, XOR 폐기)**: `improve`에도 `questions`가 붙을 수 있다 — 개선안은 이미 실행 가능하고, 질문은 개선안의 `[…입력]` 빈칸을 채우기 위한 **선택 사항**. 빈칸 ↔ 질문은 `field`로 1:1 대응. (종전 "improve면 questions=[]" 규칙 폐기 — 세부가 조금 비었다고 통째로 질문 모드로 빠져 Execute가 안 나오던 문제 해소)
  - **questions 스키마**: `[{field, question, reason, importance}]` 객체 배열(종전 문자열 배열). `postprocess.normalize_questions()`가 구형 문자열도 객체로 승격(하위호환), 프론트도 양쪽 수용
- 후처리: `_strip_cjk_noise`로 **한글에 직접 붙은** 한자 오염 토큰만 제거 (`_strip_cjk_noise`, Groq·Gemini 공통). ⚠️ 공백·따옴표로 분리된 외국어(번역 원문 등)는 보존(2026-06-27 수정)

### [D] 파싱·복원·응답 — `main.py run_generation()` → `postprocess.assemble_fields()` (§2-(4) 상세)
- `run_generation()`: LLM 호출 + 빈/None 응답 **503** 가드. 필드 조립은 `assemble_fields()` 에 위임
- `assemble_fields(raw)`: **순수 함수(모델/DB/LLM 무관)** — JSON이면 구조화 필드로, 실패 시 정규식 폴백. `/query` 응답 계약을 LLM 없이 단위 테스트하는 지점(`tests/test_postprocess.py`)
- `parse_generation()`: JSON 관대 파싱(코드펜스·잡담 허용). mode 필드 유효성 검사
- `build_answer()`: JSON → **표시용 마크다운 복원** (`**개선된 프롬프트:**`… / `**확인이 필요해요 🤔**`) — 익스텐션 UI·history 왕복 형식 무변경
- **파싱 실패 시 폴백**: 원문 그대로 answer + 정규식 추출(2026-06-27 `---` 보존 유지). `mode`는 개선블록 유무로 추정, `questions`는 `[]`(마크다운에서 구조화 복원 불가 → answer 원문으로 우아하게 저하)
- **응답 필드**(2026-07-23 추가): `mode`(improve|ask) · `summary`(한 줄 요약, 두 모드 공통) · `questions[]`(질문 모드 전용). 종전엔 mode/questions/summary 가 `answer` 마크다운 안에만 있어 프론트가 되파싱해야 했음 → 상단 필드로 노출
- `sources` = 검색된 청크 ≤5개 (`text[:300]`, metadata, score). `score` = LLM 자체평가(1~10, 개선 모드만)
- **프론트 규약**: `mode=="ask"` → `questions[]` 렌더 + Execute 숨김 / `mode=="improve"` → `improved_prompt` 표시 + Execute 활성. 전체 계약·왕복 흐름은 별도 공유하는 백엔드/프론트 계약 문서 참조

---

## 2. 핵심 설계 포인트 4가지

### (1) 검색 쿼리 ≠ 생성 쿼리
- **검색([B])은 `search_query`, 생성([C])은 항상 원본 `req.query`** (`main.py retrieve_contexts()` → `query()`)
- 이유: 검색이 매칭할 대상은 **기법 카드 코퍼스**, 생성이 다룰 대상은 **사용자 실제 의도·내용** → 최적 입력이 다름
- 변환 함수 (`query_transform.py`)
  - `transform()`: Groq `openai/gpt-oss-20b`(`reasoning_effort=low`), 출력=**키워드 한 줄** (예: `역할 부여, 출력 형식, 톤`)
  - `hyde()`: Groq `openai/gpt-oss-20b`(`reasoning_effort=low`), 출력=**기법 카드형 가상문서**, 반환은 `원본+가상문서`
  - 모든 실패 경로에서 **원본 쿼리 반환** → 변환이 검색을 절대 끊지 않음
- **변환문은 생성기에 도달하지 않음** → 켜져도 원문은 100% 보존, 순수 "검색 렌즈"
- **기본값: 둘 다 off (원본 그대로 검색)**: 초기에도 off였고(동질 코퍼스에서 키워드 변환 악화, WORKLOG 2026-06-21), 2026-07-29에 장르 미스매치 대응으로 HyDE를 기본 on 했다가 **2026-07-30 재평가에서 되돌렸다**(R@5 0.763→0.441). 키워드 `transform`도 장르가 안 맞아(임영웅 0.42→0.37 악화) opt-in 유지.
- ⭐ **교훈**: 장르 미스매치를 **쿼리 쪽에서** 메우려는 시도(HyDE)는 쿼리마다 LLM 재작성이라 노이즈가 크고 제네릭 카드로 끌린다. 간극을 메운다면 **문서 쪽**이 맞다 — 오프라인·캐시 가능·검수 가능·쿼리당 비용 0. → §4 백로그(문서측 요청 예문 생성)

### (2) 임베딩 모델 1개 공유 + 별도 리랭커 — `embeddings.py`
- **bge-m3 임베딩 모델은 프로세스당 1회 로드** 후 Indexer·Retriever **공유** (`get_model`, 캐시 `_model_cache`)
  - 과거엔 둘이 각각 로드해 메모리 2배였음 → 단일화
  - dense 임베딩 **1024차원**, 인덱싱·검색 **동일 모델**이라 벡터 공간 일치 보장
- **리랭커 bge-reranker-v2-m3는 cross-encoder, 별도·지연 로드** (`get_reranker`, ~568M 파라미터)
  - bi-encoder(임베딩)는 쿼리·문서를 따로 벡터화(빠름, 후보 회수), cross-encoder는 (쿼리,문서) **쌍을 함께** 보고 정밀 채점 → 2단계 분업
- **디바이스 선택** (`_select_device`): macOS는 MPS 메모리 위험 → **CPU**, 그 외 CUDA 가능하면 GPU
- 운영 메모: HF Xet 연결 리셋 회피 위해 `HF_HUB_DISABLE_XET=1`(다운로드)·`HF_HUB_OFFLINE=1`(이후)

### (3) 벡터 인덱스 없음 — brute-force 코사인 — `retriever.py`
- MySQL엔 **ANN(근사최근접) 인덱스 없음** → 매 쿼리마다 컬렉션 전체를 메모리로 올려 **numpy 전수 코사인** (`_load_collection` 193 → `_dense_scores` 148)
- 현재 규모(기법 170 + 예시 131청크)에서 코사인 계산 자체는 **~1ms 수준**이나, **매 쿼리 전체 로드(DB+JSON 파싱)가 요청당 ~236ms**(기법 170ms + 예시 66ms — WORKLOG 2026-09-13)로 리랭커 다음 병목 후보
- 설계 근거: "Spring 백엔드와 동일 DB 사용" 원칙(별도 벡터 DB 제거, 배포 단순화) > 검색 최적화 (WORKLOG 2026-06-19)
- ⚠️ **확장 시 병목**: 코퍼스가 수천~수만으로 커지면 이 전수 스캔이 한계 → ANN/캐시/pgvector류 도입 검토 필요

### (4) 출력은 구조화 JSON 우선, 정규식은 폴백 — `main.py run_generation()`
- LLM이 **JSON**(`{mode, improved_prompt, techniques[], changes[], score, summary, questions[]}`)을 출력
  (Groq `response_format=json_object` / Gemini `response_mime_type` 강제, 스키마는 SYSTEM_PROMPT [출력 형식])
- `parse_generation()`이 관대 파싱 → `build_answer()`가 **기존 표시용 마크다운 복원**(익스텐션 UI·history 왕복 무변경)
- **파싱 실패 시 레거시 정규식 폴백**(extract_improved_prompt 등) → 모델이 JSON을 안 지켜도 서비스 안 끊김
- `/query`·gen_eval·uplift_eval 모두 `run_generation()` **공용 경로** 사용 (측정 = 운영)
- 검증: gen_eval 12문항 mode_accuracy **1.00**, 폴백 발동 0회 (2026-07-05)

### (5) 멀티표현 인덱싱 — 청크당 벡터 여러 개 — `views.py` (2026-08-09)
- 기법 카드를 **전문 그대로** 임베딩하면 영문 필드명(`Technique:`/`Use When:` …)과 프롬프트 템플릿·예시가 신호를 희석한다. 정작 사용자 요청과 맞아야 할 `Definition`/`Use When`은 카드 327자 중 100자가 안 된다.
- **해법**: 카드도 `document`도 고치지 않고, **같은 청크를 '이름+정의+언제쓰나'로 줄인 뷰로 한 번 더 임베딩**해 `rag_chunk.embedding_views`(JSON 배열)에 저장. 검색은 본문 벡터와 뷰 벡터 중 **최고 점수**(max 풀링)를 쓴다.
- `NULL`이면 종전과 완전히 동일 → 기존 행·타 컬렉션 **무회귀**. 뷰가 리스트라 **청크당 N개**로 확장 가능.
- 어떤 뷰를 만들지는 `views.build_search_views(document, collection)`가 컬렉션별로 결정. 미등록 컬렉션은 `[]`.
- 적재: `python -m ingestion.backfill_views [--dry-run|--clear]` — `document`·본문 `embedding`은 읽기만 한다(재인덱싱 아님).

| 인덱싱 뷰 (dense 단독, 59문항, 170코퍼스) | Hit@1 | R@5 | NDCG@5 |
|---|---|---|---|
| 전체 카드(종전) | 0.576 | 0.709 | 0.634 |
| **전체 ∪ 축약뷰 (채택)** | **0.644** | **0.723** | **0.666** |

- ⚠️ **리랭커 경로에서는 이득이 상쇄된다**(Hit@1 0.627→0.610, R@5 0.763 동일) — 리랭커가 top-20을 어차피 재정렬하므로 후보 *순서* 개선이 흡수된다. **채택 이유는 (a) 404율 17%→6% (b) 리랭커를 뺄 선택지 확보** — H+dense 단독이 종전 리랭커 경로와 동급이면서 **24배 빠르다**(355ms vs 8,535ms).
- ⚠️ max 풀링이라 표시 `score`가 전반적으로 소폭 상승 → `min_score` 재교정 대상.

---

## 3. 기본 설정값 / 튜닝 포인트

| 항목 | 기본값 | 위치 | 비고 |
|---|---|---|---|
| `top_k` | 5 | `main.py` QueryRequest | 최종 반환 청크 수(상한 — min_score 컷으로 줄 수 있음) |
| `min_score` | 0.40 | `main.py` QueryRequest | dense 코사인 유효 컷(기법 검색용). 무관입력 분리엔 무효(AUC 0.694) → 404 판정은 아래 `gate_min_score` 로 이관(2026-10-01) |
| `gate_min_score` | 0.53 (`RAG_GATE_MIN_SCORE`) | `main.py` `no_evidence_gate` | **무의미 입력 404 게이트 — 예시 코퍼스 dense 기준**(AUC 1.000, eval/gate_eval.py). 0 이면 종전 '기법 0건' 규칙. 임계치는 소표본(24건) 기준 — 확장 재교정 권장 |
| `fetch_k` | **50** | `main.py` Retriever | 2026-09-13 재측정. 어려운 구간 +5.3pp·쉬운 구간 손실 0. 종전 20 은 108~134청크 시절 근거 |
| `use_reranker` | True | `main.py` `Retriever(...)` | 측정상 단독이 최고 |
| `use_hybrid` | False | `main.py` `Retriever(...)` | 한국어 코퍼스에서 악화 → off |
| 생성 모델 | gemini-2.0-flash→gpt-oss-120b | `generator.py` GROQ_MODEL_MAP · `default_model()` | 요청 `model` 은 별칭일 뿐 실제 호출 모델은 이 표가 정한다(클라이언트는 `model` 을 안 보낸다). llama 8b 시절의 mode_accuracy 0.75 열세는 폐기 모델 기준 |
| 생성 temp/tokens | 0.7(`GEN_TEMPERATURE`) / TPM 예산 내 동적(≤4096) | `generator.py` `_fit_max_tokens` | 입력은 출처별 추정(`estimate_input` — 고정 입력 보정·사용자 입력 보수, gpt-oss 실측 2026-09-20) 후 예약 축소 — 긴 원문 413 방지. 예산 = `GROQ_TPM_LIMIT`(미설정 시 무료 8k — 이때 운영 입력 5.5k 에서 예약 ~800~1,500 < 자연 출력 1~2k+ → 400 위험) |
| collection | prompt_techniques (**170청크**, 검색 대상 123) | QueryRequest | 기법 카드 컬렉션 (134 + 공신력 웹소스 56 − near-dup 정리 20). ⚠️ 134시절보다 R@5 −5.9pp |
| `embedding_views` | 뷰 1개/청크 | `views.py` `_BUILDERS` | 멀티표현 인덱싱(§2-(5)). `prompt_techniques`만 등록, 나머지는 NULL(종전 동작) |
| `use_examples` | True | `main.py` QueryRequest | 타입별 개선 예시 주입 on/off (C안, 2026-07-23). off면 기법만 — 종전과 동일 |
| `n_examples` | 2 | `main.py` QueryRequest | 주입 예시 수(상한 — example_min_score 컷으로 줄 수 있음) |
| `example_min_score` | 0.40 | `main.py` QueryRequest | 예시 유효 유사도 컷(dense). ⚠️ 임시값 — score_analysis로 예시 코퍼스 기준 재측정 필요 |
| example collection | prompt_examples (**131 예시**) | QueryRequest | 합성 개선 사례(`ingestion/gen_examples.py`, 20태스크 유형·순수 한국어). ⭐ 관련성 판별력 **AUC 1.000** |

---

## 4. 알려진 한계 · 백로그

> 아래 🔴 두 항목의 **방법론·실행 순서는 `CORPUS_STRATEGY.md`** 에 별도 정리돼 있다
> (무의미 쿼리 게이팅 3층 방어 · 코퍼스 품질 5축 · 진단 지표 · 우선순위 표).

- 🔴 **[최우선] 코퍼스 구성이 관련성을 분리하지 못한다** (2026-08-09 실측): 같은 쿼리·같은 임베딩 모델인데 `prompt_techniques`는 **AUC 0.575(≒무작위)**, `prompt_examples`는 **AUC 1.000(완전분리)**. 차이는 오직 **코퍼스가 쓰인 문체** — 기법 카드는 영문 스캐폴딩+정의체, 예시는 한국어 사용자 말투. 증거: `https://example.com`(0.543)이 `제주도 여행 블로그 글 써줘. 아이랑 3박4일`(0.361)보다 기법 카드와 더 유사하다(의미가 아니라 표면이 맞은 것).
  · 이 하나로 **404·게이트 무력화·HyDE 실패가 모두 설명된다** — 쿼리와 코퍼스가 다른 언어 공간에 있다.
  · ❌ **문서측 요청 예문 생성(doc2query/HyPE) — 2026-09-19 A/B 로 기각**: 예문이 기법이 아니라 **소재**(회의록·가격·영화)로 맞아 소재가 겹치는 아무 카드가 이긴다. 사람 라벨셋 dense Hit@1 0.610→**0.220**, rerank R@5 0.749→0.723 악화, 무관 입력 τ=0.40 통과 6/7→7/7. 운영 미적용(재현 산출물만 `ingestion/gen_request_views.py`·`eval/doc2query_eval.py` 에 보존 — WORKLOG 2026-09-19, `CORPUS_STRATEGY.md`).
  · ⏳ **관련성 게이트를 `prompt_examples`로 이관 검토** — 지금은 AUC 0.575인 컬렉션이 404를 판정하고, AUC 1.000인 컬렉션은 보조 재료로만 쓰인다. **판정 주체가 뒤바뀌어 있다.**
  · ⏳ **하드 404 폐지** — 게이트가 제 기능을 못 하는 동안 정상 요청만 막는다. `mode=ask`가 이미 최종 게이트로 작동함은 측정됨.
- 🔴 **리랭커가 검색 지연의 95%** (2026-08-09 실측): 7,714ms / 8,094ms. 사는 것은 R@5 +5.4pp·Hit@1 +5.1pp. 라이브 `/query` end-to-end **19.2초**. §2-(5) 이후 H+dense 단독이 동급이라 **제거 선택지가 열렸다** → ONNX/배치(품질손실 0) → 조건부 리랭크 → 제거 순으로 검토.
- ~~✅ **무관 입력에 쓰레기 top5 유입**: `min_score=0.40` 컷으로 해결(2026-07-05)~~ → **철회**: 위 AUC 측정으로 반증됨. 당시 결론은 `qa_set`(질문형) 분포에서 나온 것이고, 운영 분포(거친 작업지시)에서는 성립하지 않는다.
- ✅ **fetch_k 근거 부재**: 20/15/10/50 스윕으로 20 확정(2026-07-05) → 🔄 **코퍼스 확장 후 근거 소멸, 2026-09-13 재측정으로 50 으로 변경**. 교훈: 코퍼스가 바뀌면 이 값도 다시 재야 한다.
- 🔄 **리랭커 제거 검토 철회(2026-09-13)**: 2026-08-15 의 '이득 0.025 노이즈'는 미검증 gold 10항목 기반이었다. 커버리지 97% 셋에서 **R@5 +12.3pp**, 기존셋에서도 +4.0pp — 어려운 구간일수록 이득이 크다(쉬운 문항만 있던 평가셋이라 안 보였던 것).
- ✅ **생성기 원문 페이로드 누락** (uplift_eval 발견): SYSTEM_PROMPT에 "원문 verbatim 포함" 규칙 추가로 해결(2026-06-26). 후속 버그(추출 `---` 잘림·노이즈 과삭제)도 수정(2026-06-27).
- 🟡 **긴 원문 truncation**: `_fit_max_tokens`로 413 즉사는 방지(2026-07-07). 장문은 Gemini 라우팅으로 해소(2026-07-23) — 단 **GEMINI_API_KEY 설정 시에만** 작동, Groq 단독 구성에선 여전히 출력이 잘릴 수 있음
- ✅ **코퍼스 확장**: 170청크로 완료(134 + 공신력 웹소스 56 − 근접중복 20) — '2차 대기'(DAIR 나머지·Cookbook)는 이 확장에 흡수돼 해소. 이후 하이브리드·min_score 재측정은 2026-09-13 에 수행
- 🟡 **벡터 인덱스 부재**: 코퍼스 확장 시 brute-force 병목 (§2-(3))
- 🟢 **타입별 개선 예시 주입(C안, 2026-07-23)**: `prompt_examples` 컬렉션을 기법과 **따로 검색**해 생성기에 함께 전달([B+]/[C]). 근거 = A안 헤드투헤드(예시 승률 66.7%·Δ+0.83, gemini-flash-lite n=6, WORKLOG 2026-07-23) — **방향 신호(양)**. ⏳ 남은 일: ① 쿼터 회복 후 **정밀 재측정**(swap·8문항·강한 judge, exec max_tokens↑로 트렁케이션 제거)으로 default-on 확정, ② `example_min_score` 재측정(무관 예시 주입 방지), ③ 예시 커버리지 일반화(현재 uplift 태스크 유형 정렬), ④ 예시 언어 혼입 노이즈(`宣傳` 등) 후처리 정제. 운영 활성화는 rag-server 컨테이너 재기동 필요(코드 반영본).
- ✅ **정규식 파싱 취약** → 구조화 JSON 응답 + 정규식 폴백으로 해소(2026-07-05, §2-(4)). QueryResponse에 `score` 추가.
- 🟡 **생성 출력 라틴 깨짐**: llama 70b 시절 응답에 `_highlight` 류 토큰 혼입(한자 노이즈는 `_strip_cjk_noise`로 제거). 현 gpt-oss 에서는 재관측·재측정 안 됨
- 🟡 **Groq 무료 티어 TPD 100k**: 평가/운영 시 토큰 한도 고려
- 🟡 **`techniqueAxes` 는 산출만 하고 소비처가 없다** (2026-09-20 전수조사): 분석기가 매 요청 축을 뽑지만(분석 프롬프트의 20% 가 축 카탈로그) `app/` 어디서도 읽지 않는다. 축 라우팅(`DESIGN_TECHNIQUE_ROUTING.md`)은 '설계 초안·미구현'이고 실제로는 층 필터(§1-[B1])가 그 자리를 대신했다. **배선하거나 프롬프트에서 빼거나 결정 필요** — 지금은 토큰·지연만 쓴다.
- 🟡 **장문 라우팅 판정이 `_fit_max_tokens` 와 다른 추정기를 쓴다** (2026-09-20 전수조사): 09-20 재보정으로 예산 산정은 출처별 `estimate_input` 을 쓰는데 `_needs_long_context` 는 여전히 전량 보수 추정(`_est_tokens`)이라 같은 입력을 ~20% 크게 본다(카드 5장·무료 8k: 5,645 vs 4,611 tok → Gemini 라우팅 경계 800자 vs 1,300자). 맞추면 Gemini(무료 RPD 20) 사용은 줄지만 Groq 잘림 위험이 늘 수 있어 **의도적으로 미변경** — 결정 필요.

---

## 5. 품질 측정 도구 (`rag-server/`에서 `python3 -m ...`)

| 명령 | 측정 대상 | 핵심 지표 |
|---|---|---|
| `python3 -m eval.run_eval --qa qa_set_realistic.json` | **검색(R)** (`--fetch-k` 스윕·지연 포함) | Hit@1 / Recall@1·3·5 / NDCG@5 / MRR@10 / ms·쿼리 |
| `python3 -m eval.score_analysis` | **min_score 임계치 설계** — 정답/오답 점수 분포·τ 스윕 | 유지Recall / Precision / 빈결과율 |
| `python3 -m eval.gen_eval` | **생성(G) — 개선프롬프트 지시문 품질** | mode_fit / grounding / mode_accuracy |
| `python3 -m eval.uplift_eval` | **결과 상향 — raw vs 개선 결과물 A/B** | 개선 승률 / 평균 점수 Δ |
| `python3 -m eval.uplift_score` | **결과 상향 채점기** — 결과물에서 결함·요구사항 충족을 코드+judge 로 채점 | 결함률 / 요구사항 충족 |
| `python3 -m eval.run_multi_turn_eval` | **다중 턴** — RAG 가 도움이 된 경우와 방해가 된 경우를 분리(rag_off/rag_on/oracle) | 이력 유지·최신 조건 우선·주제 분리·창작 여부 |
| `python3 -m eval.analyzer_rule5_eval` | **분석기 가드 측정** — 템플릿 요청 원문 강등(`--only template`)·가리킨 원문 승격(`--only referenced`) | 규칙 위반 횟수 / 회 |
| `python3 -m eval.token_calib [--corpus]` | **토큰 추정기 보정** — `usage.prompt_tokens` 대비 과소·과대 추정 | 유형별 실측 비율 / 과소추정 묶음 |
| `python3 -m eval.layer_eval` | **카드 층 분류 회귀** (`layer_set.json`) | 층별 정확도 |
| `python3 -m eval.halluc_eval` | **적대적 환각** — 지어내고 싶게 유도하는 입력 | 창작 발생률 |

> 검색·생성·실효용을 분리 측정. "개선 프롬프트가 좋다"(G)와 "결과물이 실제로 좋아진다"(uplift)는 다른 축.

**쿼터 운용(Groq 무료 티어)**: 생성·judge는 대형(`default_model('groq')` = gpt-oss-120b) 유지(소형 judge는 일치도 측정 결과 신뢰 불가 — 2026-07-05, 당시 8b 기준).
TPD 부족 시 `--cache-file`로 생성 캐시 후 judge만 재실행, judge 실패해도 mode_accuracy는 집계됨.
요청=입력+출력예약 합산(TPM 8k)임에 주의 — 예산은 `_fit_max_tokens`, 유료 티어는 `GROQ_TPM_LIMIT`.
**평가 캐시 키에는 생성 입력을 바꾸는 것을 전부 넣는다**(모델·온도·SYSTEM_PROMPT·컨텍스트·**분석기 지문** — 2026-09-20: 멀티턴 러너가 폐기 모델 라벨을 키에 박아 분석기가 바뀌어도 낡은 결과를 재사용하던 것 수정, `analyzer_fingerprint`).

# 다중 턴 평가기 — Judge 연결 + RAG 도움/방해 분리 측정

## 한 줄 요약

jiwon님 `eval/multi_turn_eval.py`에 **실제 LLM Judge 호출 흐름을 연결**하고,
"RAG가 개선에 기여했는가 / 오히려 방해했는가"를 나누는 지표와 CLI 러너를 붙였습니다.

---

## 먼저 봐주셨으면 하는 것 — 버그 1건

`build_judge_prompt`가 `improvedPrompt`(camelCase)를 읽는데,
운영 `run_generation`은 `improved_prompt`(snake_case)를 반환합니다.

**그대로 Judge를 붙였으면 improve 모드 전 항목이 빈 문자열로 채점될 뻔했습니다.**
(수정 전 코드에 운영 형식을 넣어 `evaluationTarget: ""` 실측 확인)

기존 테스트가 못 잡은 이유 — fake 데이터에 camelCase를 **직접** 넣어줘서
운영 경로 형식이 한 번도 통과하지 않았습니다. 운영 형식 회귀 테스트를 추가했습니다.

라이브 측정 중에 2건 더 나왔습니다.

| 문제 | 증상 |
|---|---|
| 생성 호출에 재시도 없음 | Judge만 감싸여 있어 Gemini 503 한 번에 측정 전체가 죽음 |
| google-genai 예외를 재시도 판정이 놓침 | HTTP 상태가 `.status_code`가 아닌 **`.code`**에 있어 503/429가 "재시도 불가"로 분류됨 |

---

## 무엇을 추가했나

**1. Judge 실행** — 호출 / 재시도(429·5xx 지수 백오프) / 전용 캐시 / generation 결과와 결합

**2. 3조건 비교 구조** — 차이는 '어떤 근거를 넣었나' 하나뿐

```
rag_off  : 컨텍스트 없음               → 기준선
rag_on   : 운영과 동일한 검색            → 실제 검색
oracle   : 정답 기법 카드 직접 주입       → 이상적 근거(상한)
```

**3. 지표**

- `retrieval_help_rate` / `harm_rate` / `neutral_rate` — RAG 켠 뒤 품질이 오른/내린/그대로인 비율
- `utility_recovery(UR)` — 이상적 근거 대비 실제 검색이 회수한 이득의 비율
- `distract` / `rescue` — 검색이 mode 판정을 깨뜨린/살린 비율

**4. CLI 러너** `eval/run_multi_turn_eval.py`

**5. 데이터셋 오라클 라벨** — 10항목에 `gold_techniques` 추가(22종, 코퍼스 실재 확인)

---

## 설계에서 신경 쓴 것 3가지

**평가 로직은 운영 코드를 import하지 않습니다.**
`multi_turn_eval.py`는 순수 함수만 두고, `app.main`·LLM SDK·DB는 러너에만 뒀습니다.
→ **API 키 없이 테스트 46개가 0.02초에 돕니다.**

**검색 결과를 얼려서 재사용합니다(frozen cache).**
안 그러면 RAG on/off 점수 차이에 '그날 검색이 흔들린 정도'가 섞여,
도움인지 방해인지 판정 자체가 무의미해집니다. 생성 캐시와 **별도 파일**입니다.

**판정 임계값(tau)을 눈대중으로 안 정합니다.**
judge 점수는 4항목 정수 평균이라 최소 눈금이 0.25입니다.
같은 조건을 3회 반복해 점수 흔들림(표준편차)을 재고, 그 2배를 임계값으로 씁니다.

---

## 하위 호환

- 새 인자는 **전부 맨 뒤에 기본값**으로 추가했습니다.
- `judge_call`을 안 넘기면 반환 구조에 judge 필드가 **붙지 않습니다.**
- **기존 테스트 24개는 한 줄도 안 고치고 통과**합니다.

---

## 테스트

```
python3 -m pytest tests/test_multi_turn_eval.py -q   →  46 passed
```

기존 비pytest 3종도 전부 통과 (postprocess 43 / token_budget 13 / generator_guards 16).

---

## 라이브 측정 — 3/10 항목만 완주

파이프라인은 end-to-end로 돌아가는 걸 확인했지만, **무료 티어 예산이 부족해
10항목 전량은 완주하지 못했습니다.** 측정된 3항목은 이렇습니다.

| 항목 | rag_off | rag_on | oracle | Δ | 판정 |
|---|---|---|---|---|---|
| context_retention_01 | 5.00 | 5.00 | 5.00 | 0.00 | 천장 |
| context_retention_02 | 5.00 | 5.00 | 5.00 | 0.00 | 천장 |
| **latest_override_01** | 4.50 | **3.25** | 4.75 | **−1.25** | **harm** |

**`latest_override_01`이 이 평가기를 만든 이유 그 자체입니다.**
실제 검색은 점수를 1.25 깎았는데(방해) 이상적 근거는 0.25 올렸습니다(도움).
→ 검색이라는 행위가 무용한 게 아니라 **가져온 카드가 틀렸다**는 뜻입니다.
지금까지 딸깍의 어떤 지표도 이 구분을 낼 수 없었습니다.

### 🔴 그런데 문제가 하나 보입니다 — judge 포화

context_retention 2항목은 **근거를 아예 빼도(rag_off) 만점 5.00**입니다.
세 조건이 전부 만점이면 그 항목은 검색 효과를 측정할 수 없습니다.
n=3에서 벌써 2건이 천장이라, **전량 측정 전에 채점 기준부터 손봐야 합니다.**

### 쿼터 구조

| 제약 | 실측 |
|---|---|
| Gemini `gemini-flash-latest` | **하루 20요청** (`gemini-3.7-flash` 무료 티어) |
| Gemini `gemini-2.0-flash` | **모델 퇴역(404)** — `uplift_eval`에 아직 남아 있어 그쪽도 실행 실패합니다 |
| Groq 70b | TPD 100k — 생성 9 + 채점 9에 소진 |
| 생성기 라우팅 | 컨텍스트 붙으면 Groq 예산 부족 판정 → Gemini 강제 (`generator.py:597`) |

10항목 × 3조건이면 생성 30 + 채점 30 ≈ **일일 예산의 3배**입니다.
캐시가 남아 있어서 **하루 3~4항목씩 며칠 누적하면 완주**됩니다.

---

## 실행법

```bash
python3 -m eval.run_multi_turn_eval --runs 3 --show
```

```bash
python3 -m eval.run_multi_turn_eval --conditions rag_off,rag_on --limit 3
```

Groq 소진 시 `GROQ_API_KEY=` 를 앞에 붙이면 Gemini로 강제됩니다.

---

## 참고

지표 설계는 아래 논문의 방식을 축약 적용했습니다.
전체 평균만 내면 도움/방해가 상쇄돼 둘 다 안 보인다는 게 핵심이라,
**category별 집계를 기본**으로 뒀습니다.

> Deka & Singh, *When Retrieval Helps and Distracts* (arXiv 2608.01409, 2026)
> 전체 UR −0.110이지만 소스별로는 PubMedQA +0.676 / PUBHEALTH −0.378

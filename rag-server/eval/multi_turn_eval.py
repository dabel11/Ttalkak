"""
다중 턴 프롬프트 개선 평가기.

대화 이력 유지, 최신 조건 우선, 주제 분리, 사용자 답변 반영,
제공되지 않은 구체 사실의 창작 여부를 평가한다.
"""

import copy
import hashlib
import json
import time
from pathlib import Path
from typing import Any


REQUIRED_CATEGORIES = {
    "context_retention",
    "latest_override",
    "topic_isolation",
    "answer_integration",
    "faithfulness",
}


def serialize_history(history: list[dict[str, str]]) -> str:
    """대화 이력을 캐시 키에 사용할 결정론적 JSON 문자열로 직렬화한다."""
    return json.dumps(
        history,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def build_cache_key(
    query: str,
    history: list[dict[str, str]],
    technique_names: list[str],
    model: str = "",
    temperature: str = "",
    system_prompt: str = "",
    context_identifiers: list[str] | None = None,
    use_analyzer: bool = True,
    analyzer_model: str = "",
    analyzer_temperature: str = "",
) -> str:
    """검색 컨텍스트와 생성·분석 설정 전체를 반영한 캐시 키를 만든다."""
    payload = {
        "model": str(model),
        "temperature": str(temperature),
        "system_prompt": system_prompt,
        "query": query,
        "history": serialize_history(history),
        "technique_names": sorted(technique_names),
        "context_identifiers": sorted(context_identifiers or []),
        "use_analyzer": bool(use_analyzer),
        "analyzer_model": str(analyzer_model),
        "analyzer_temperature": str(analyzer_temperature),
    }
    serialized = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:20]

def load_cache(path: str | None) -> dict[str, Any]:
    if not path:
        return {}

    cache_path = Path(path)
    if not cache_path.exists():
        return {}

    try:
        loaded = json.loads(cache_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

    return loaded if isinstance(loaded, dict) else {}


def save_cache(cache: dict[str, Any], path: str | None) -> None:
    if not path:
        return

    Path(path).write_text(
        json.dumps(cache, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def normalize_mode(mode: Any) -> str:
    """응답의 mode 값을 정확도 계산에 사용할 형태로 정규화한다."""
    normalized = str(mode or "").strip().lower()
    return normalized if normalized in {"improve", "ask"} else "unknown"


def select_metric_text(
    mode: Any,
    improved_prompt: Any,
    answer: Any,
) -> str:
    """문자열 보조 지표 검사 대상을 선택한다."""
    if normalize_mode(mode) == "ask":
        return str(answer or "")
    return str(improved_prompt or "")


def calculate_must_include_rate(
    text: str,
    must_include: list[str],
) -> float | None:
    """필수 문자열 중 실제 포함된 문자열의 비율을 계산한다."""
    if not must_include:
        return None

    matched = sum(1 for value in must_include if value in text)
    return matched / len(must_include)


def find_must_not_include_violations(
    text: str,
    must_not_include: list[str],
) -> list[str]:
    """금지 문자열 중 실제 응답에 등장한 값을 반환한다."""
    return [value for value in must_not_include if value in text]


def calculate_must_not_include_violation_rate(
    text: str,
    must_not_include: list[str],
) -> float | None:
    """금지 문자열 중 실제로 위반한 문자열의 비율을 계산한다."""
    if not must_not_include:
        return None

    violations = find_must_not_include_violations(text, must_not_include)
    return len(violations) / len(must_not_include)


def calculate_mode_accuracy(results: list[dict[str, Any]]) -> float | None:
    """expected_mode와 실제 mode의 일치율을 계산한다."""
    comparable = [
        result
        for result in results
        if normalize_mode(result.get("expected_mode")) in {"improve", "ask"}
    ]
    if not comparable:
        return None

    matched = sum(
        normalize_mode(result.get("expected_mode"))
        == normalize_mode(result.get("mode"))
        for result in comparable
    )
    return matched / len(comparable)


def calculate_structured_success_rate(
    results: list[dict[str, Any]],
) -> float | None:
    if not results:
        return None

    succeeded = sum(bool(result.get("structured_success")) for result in results)
    return succeeded / len(results)


def average_non_null(values: list[Any]) -> float | None:
    """None과 숫자가 아닌 값을 제외하고 평균을 계산한다."""
    numeric_values = [
        float(value)
        for value in values
        if value is not None
        and isinstance(value, (int, float))
        and not isinstance(value, bool)
    ]
    if not numeric_values:
        return None

    return sum(numeric_values) / len(numeric_values)


def load_dataset(path: str) -> dict[str, Any]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        raise ValueError("데이터셋은 items 배열을 포함한 JSON 객체여야 합니다.")
    return data

def extract_technique_names(retrieved: list[dict[str, Any]]) -> list[str]:
    """검색 결과에서 캐시 및 출력에 사용할 기법명을 추출한다."""
    technique_names: list[str] = []

    for result in retrieved:
        metadata = result.get("metadata")
        if not isinstance(metadata, dict):
            continue

        name = metadata.get("technique") or metadata.get("source")
        if name:
            technique_names.append(str(name))

    return technique_names

def extract_context_identifiers(
    contexts: list[dict[str, Any]],
) -> list[str]:
    """기법과 예시를 구분할 수 있는 안정적인 캐시 식별값을 만든다."""
    identifiers: list[str] = []

    for context in contexts:
        metadata = context.get("metadata")
        metadata = metadata if isinstance(metadata, dict) else {}

        identity = {
            "id": context.get("id"),
            "document": context.get("document")
            or context.get("content")
            or context.get("text"),
            "metadata": metadata,
        }
        serialized = json.dumps(
            identity,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )
        identifiers.append(
            hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:20]
        )

    return identifiers

def normalize_generation_result(
    generated: Any,
    extract_improved_prompt,
) -> dict[str, Any]:
    """run_generation의 반환 형식이 문자열 또는 객체여도 공통 형식으로 변환한다."""
    if isinstance(generated, dict):
        normalized = dict(generated)

        answer = str(normalized.get("answer") or "")
        improved_prompt = str(normalized.get("improved_prompt") or "")

        if not improved_prompt and answer:
            improved_prompt = str(extract_improved_prompt(answer) or "")

        normalized["answer"] = answer
        normalized["improved_prompt"] = improved_prompt
        normalized["mode"] = (
            normalize_mode(normalized.get("mode"))
            if normalize_mode(normalized.get("mode")) != "unknown"
            else ("improve" if improved_prompt else "ask")
        )
        return normalized

    answer = str(generated or "")
    improved_prompt = str(extract_improved_prompt(answer) or "")

    return {
        "answer": answer,
        "improved_prompt": improved_prompt,
        "mode": "improve" if improved_prompt else "ask",
    }


def run_item_generation(
    item: dict[str, Any],
    retrieved: list[dict[str, Any]],
    model: str,
    run_generation,
    extract_improved_prompt,
) -> dict[str, Any]:
    """운영 run_generation 경로에 현재 질의와 전체 history를 전달한다."""
    original_history = item.get("history", [])

    generated = run_generation(
        item["query"],
        retrieved,
        model,
        copy.deepcopy(original_history),
    )

    return normalize_generation_result(
        generated,
        extract_improved_prompt,
    )

def retrieve_evaluation_contexts(
    query: str,
    history: list[dict[str, str]],
    retriever,
    query_transform_module,
    collection_name: str = "prompt_techniques",
    top_k: int = 5,
    min_score: float = 0.40,
    use_reranker: bool = True,
    use_hybrid: bool = False,
    use_query_transform: bool = False,
    use_hyde: bool = False,
    use_examples: bool = True,
    example_collection: str = "prompt_examples",
    n_examples: int = 2,
    example_min_score: float = 0.40,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
    """운영 /query와 같은 조건으로 기법과 예시를 검색한다."""
    if use_hyde:
        search_query = query_transform_module.hyde(query, history)
    elif use_query_transform:
        search_query = query_transform_module.transform(query, history)
    else:
        search_query = query

    retrieved = retriever.search(
        query=search_query,
        collection_name=collection_name,
        top_k=top_k,
        use_reranker=use_reranker,
        use_hybrid=use_hybrid,
        min_score=min_score,
    )

    examples: list[dict[str, Any]] = []
    if use_examples and n_examples > 0:
        try:
            examples = retriever.search(
                query=query,
                collection_name=example_collection,
                top_k=n_examples,
                use_reranker=False,
                use_hybrid=False,
                min_score=example_min_score,
            )
        except Exception:
            # 운영 코드와 동일하게 예시 검색 실패는 전체 생성을 막지 않는다.
            examples = []

    return retrieved, examples, search_query

def run_evaluation_item(
    item: dict[str, Any],
    retriever,
    query_transform_module,
    run_generation,
    extract_improved_prompt,
    cache: dict[str, Any],
    cache_path: str | None,
    model: str,
    temperature: str,
    system_prompt: str,
    use_analyzer: bool = True,
    analyzer_model: str = "llama-3.1-8b-instant",
    analyzer_temperature: str = "0.2",
    use_query_transform: bool = False,
    use_hyde: bool = False,
    use_examples: bool = True,
) -> dict[str, Any]:
    """한 평가 항목의 검색·캐시·생성을 실행한다."""
    query = str(item["query"])
    history = item.get("history", [])

    if not isinstance(history, list):
        raise ValueError("item.history는 리스트여야 합니다.")

    retrieved, examples, search_query = retrieve_evaluation_contexts(
        query=query,
        history=history,
        retriever=retriever,
        query_transform_module=query_transform_module,
        use_query_transform=use_query_transform,
        use_hyde=use_hyde,
        use_examples=use_examples,
    )

    contexts = retrieved + examples
    technique_names = extract_technique_names(retrieved)
    context_identifiers = extract_context_identifiers(contexts)

    cache_key = build_cache_key(
        query=query,
        history=history,
        technique_names=technique_names,
        model=model,
        temperature=temperature,
        system_prompt=system_prompt,
        context_identifiers=context_identifiers,
        use_analyzer=use_analyzer,
        analyzer_model=analyzer_model,
        analyzer_temperature=analyzer_temperature,
    )

    cached = cache.get(cache_key)

    if isinstance(cached, dict):
        generation = copy.deepcopy(cached)
        cache_hit = True
    else:
        generation = run_item_generation(
            item=item,
            retrieved=contexts,
            model=model,
            run_generation=run_generation,
            extract_improved_prompt=extract_improved_prompt,
        )

        cache[cache_key] = copy.deepcopy(generation)
        save_cache(cache, cache_path)
        cache_hit = False

    return {
        "generation": generation,
        "retrieved": retrieved,
        "examples": examples,
        "techniqueNames": technique_names,
        "searchQuery": search_query,
        "cacheKey": cache_key,
        "cacheHit": cache_hit,
    }

def get_error_status_code(error: Exception) -> int | None:
    """예외 자체 또는 response 객체에서 HTTP 상태 코드를 추출한다."""
    status_code = getattr(error, "status_code", None)

    if status_code is None:
        response = getattr(error, "response", None)
        status_code = getattr(response, "status_code", None)

    try:
        return int(status_code) if status_code is not None else None
    except (TypeError, ValueError):
        return None


def is_retryable_generation_error(error: Exception) -> bool:
    """호출 제한 또는 일시적인 서버 오류인지 판정한다."""
    status_code = get_error_status_code(error)

    if status_code in {429, 500, 502, 503, 504}:
        return True

    message = str(error).lower()
    retryable_phrases = (
        "rate limit",
        "too many requests",
        "temporarily unavailable",
    )
    return any(phrase in message for phrase in retryable_phrases)


def run_with_retry(
    operation,
    max_attempts: int = 3,
    base_delay_seconds: float = 2.0,
    sleep_fn=time.sleep,
):
    """재시도 가능한 생성 오류에 지수 백오프를 적용한다."""
    if max_attempts < 1:
        raise ValueError("max_attempts는 1 이상이어야 합니다.")

    for attempt in range(1, max_attempts + 1):
        try:
            return operation()
        except Exception as error:
            should_retry = (
                attempt < max_attempts
                and is_retryable_generation_error(error)
            )
            if not should_retry:
                raise

            delay = base_delay_seconds * (2 ** (attempt - 1))
            sleep_fn(delay)

    raise RuntimeError("도달할 수 없는 재시도 상태입니다.")

JUDGE_SCORE_KEYS = (
    "contextRetention",
    "instructionFollowing",
    "clarity",
    "hallucinationAvoidance",
)


def build_judge_prompt(
    item: dict[str, Any],
    generation: dict[str, Any],
) -> str:
    """다중 턴 프롬프트 개선 결과를 평가할 Judge 입력을 만든다."""
    mode = normalize_mode(generation.get("mode"))

    evaluation_target = (
        generation.get("improvedPrompt", "")
        if mode == "improve"
        else generation.get("answer", "")
    )

    judge_input = {
        "history": item.get("history", []),
        "currentQuery": item.get("query", ""),
        "expectedMode": normalize_mode(item.get("expected_mode")),
        "actualMode": mode,
        "evaluationTarget": str(evaluation_target or ""),
        "mustInclude": item.get("must_include", []),
        "mustNotInclude": item.get("must_not_include", []),
    }

    return f"""
당신은 다중 턴 프롬프트 개선 시스템의 평가자입니다.
아래 입력만 근거로 결과를 평가하세요.

평가 기준:
1. contextRetention
   - 이전 대화에서 확정된 주제, 대상, 조건, 형식을 보존했는가
   - 최신 요청이 이전 조건을 변경했다면 최신 조건을 우선했는가

2. instructionFollowing
   - 현재 요청과 명시적인 필수 조건을 정확히 반영했는가
   - 사용자가 금지하거나 변경한 조건을 다시 포함하지 않았는가

3. clarity
   - 결과가 구체적이고 실행 가능하며 모호하지 않은가
   - 불필요한 반복이나 서로 충돌하는 지시가 없는가

4. hallucinationAvoidance
   - 대화에 없던 중요한 사실이나 조건을 임의로 만들지 않았는가
   - 정보가 부족한 경우 추측하지 않고 적절하게 질문했는가

각 항목을 1점부터 5점까지의 정수로 평가하세요.
5점은 기준을 매우 충실히 만족함을 의미합니다.

반드시 다음 JSON 형식으로만 응답하세요:
{{
  "contextRetention": 1,
  "instructionFollowing": 1,
  "clarity": 1,
  "hallucinationAvoidance": 1,
  "reason": "판정 근거를 간결하게 작성"
}}

평가 입력:
{json.dumps(judge_input, ensure_ascii=False, indent=2)}
""".strip()


def parse_judge_json(raw_result: Any) -> dict[str, Any] | None:
    """Judge의 객체 또는 JSON 문자열 응답을 파싱한다."""
    if isinstance(raw_result, dict):
        return dict(raw_result)

    if not isinstance(raw_result, str):
        return None

    text = raw_result.strip()

    if text.startswith("```"):
        lines = text.splitlines()

        if lines and lines[0].strip().lower() in {"```", "```json"}:
            lines = lines[1:]

        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]

        text = "\n".join(lines).strip()

    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None

    return parsed if isinstance(parsed, dict) else None


def normalize_judge_score(value: Any) -> int | None:
    """Judge 점수를 1~5 범위의 정수로 검증한다."""
    if isinstance(value, bool):
        return None

    if isinstance(value, int):
        score = value
    elif isinstance(value, float) and value.is_integer():
        score = int(value)
    elif isinstance(value, str):
        stripped = value.strip()

        if not stripped.isdigit():
            return None

        score = int(stripped)
    else:
        return None

    return score if 1 <= score <= 5 else None


def normalize_judge_result(raw_result: Any) -> dict[str, Any]:
    """Judge 응답을 평가 결과에 저장할 공통 구조로 변환한다."""
    parsed = parse_judge_json(raw_result)

    if parsed is None:
        return {
            "valid": False,
            "scores": {
                key: None
                for key in JUDGE_SCORE_KEYS
            },
            "averageScore": None,
            "reason": "",
            "error": "invalid_json",
        }

    scores = {
        key: normalize_judge_score(parsed.get(key))
        for key in JUDGE_SCORE_KEYS
    }

    invalid_keys = [
        key
        for key, score in scores.items()
        if score is None
    ]

    if invalid_keys:
        return {
            "valid": False,
            "scores": scores,
            "averageScore": None,
            "reason": str(parsed.get("reason") or "").strip(),
            "error": "invalid_scores",
            "invalidScoreKeys": invalid_keys,
        }

    average_score = sum(scores.values()) / len(scores)

    return {
        "valid": True,
        "scores": scores,
        "averageScore": average_score,
        "reason": str(parsed.get("reason") or "").strip(),
        "error": None,
    }

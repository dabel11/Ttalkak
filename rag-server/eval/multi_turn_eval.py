"""
다중 턴 프롬프트 개선 평가기.

대화 이력 유지, 최신 조건 우선, 주제 분리, 사용자 답변 반영,
제공되지 않은 구체 사실의 창작 여부를 평가한다.
"""

import copy
import hashlib
import json
import statistics
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


def select_generation_target(generation: dict[str, Any]) -> str:
    """생성 결과에서 평가 대상 텍스트를 고른다.

    run_generation과 normalize_generation_result는 improved_prompt를 쓰지만
    일부 호출부는 improvedPrompt를 넘긴다. 두 표기를 모두 읽어야
    improve 모드에서 평가 대상이 빈 문자열이 되지 않는다.
    """
    improved_prompt = (
        generation.get("improved_prompt")
        or generation.get("improvedPrompt")
        or ""
    )
    return select_metric_text(
        generation.get("mode"),
        improved_prompt,
        generation.get("answer"),
    )


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


RETRIEVAL_CACHE_NAMESPACE = "multi_turn_retrieval"


def build_retrieval_cache_key(
    query: str,
    history: list[dict[str, str]],
    retrieval_settings: dict[str, Any],
) -> str:
    """검색 결과를 얼려두기 위한 캐시 키를 만든다."""
    payload = {
        "namespace": RETRIEVAL_CACHE_NAMESPACE,
        "query": query,
        "history": serialize_history(history),
        "retrieval_settings": retrieval_settings,
    }
    serialized = json.dumps(
        payload,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:20]


def retrieve_with_cache(
    query: str,
    history: list[dict[str, str]],
    retriever,
    query_transform_module,
    retrieval_cache: dict[str, Any] | None = None,
    retrieval_cache_path: str | None = None,
    **retrieval_settings,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str, bool]:
    """검색 결과를 캐시에 고정해 재사용한다.

    같은 항목을 RAG on/off로 반복 실행할 때 두 조건의 차이가 '검색 유무'만
    남아야 한다. 검색을 매번 다시 돌리면 그날 검색이 흔들린 정도가 점수 차이에
    섞여 들어가, 검색 측 실패인지 생성 측 실패인지도 구분할 수 없게 된다.
    """
    if retrieval_cache is None:
        retrieved, examples, search_query = retrieve_evaluation_contexts(
            query=query,
            history=history,
            retriever=retriever,
            query_transform_module=query_transform_module,
            **retrieval_settings,
        )
        return retrieved, examples, search_query, False

    cache_key = build_retrieval_cache_key(query, history, retrieval_settings)
    cached = retrieval_cache.get(cache_key)

    if isinstance(cached, dict):
        return (
            copy.deepcopy(cached.get("retrieved") or []),
            copy.deepcopy(cached.get("examples") or []),
            str(cached.get("searchQuery") or query),
            True,
        )

    retrieved, examples, search_query = retrieve_evaluation_contexts(
        query=query,
        history=history,
        retriever=retriever,
        query_transform_module=query_transform_module,
        **retrieval_settings,
    )

    retrieval_cache[cache_key] = copy.deepcopy({
        "retrieved": retrieved,
        "examples": examples,
        "searchQuery": search_query,
    })
    save_cache(retrieval_cache, retrieval_cache_path)

    return retrieved, examples, search_query, False


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
    judge_call=None,
    judge_cache: dict[str, Any] | None = None,
    judge_cache_path: str | None = None,
    judge_model: str = "",
    judge_prompt_version: str = "v1",
    judge_max_attempts: int = 3,
    judge_base_delay_seconds: float = 2.0,
    judge_sleep_fn=time.sleep,
    use_retrieval: bool = True,
    retrieval_cache: dict[str, Any] | None = None,
    retrieval_cache_path: str | None = None,
    override_contexts: list[dict[str, Any]] | None = None,
    generation_max_attempts: int = 3,
    generation_base_delay_seconds: float = 2.0,
    generation_sleep_fn=time.sleep,
) -> dict[str, Any]:
    """한 평가 항목의 검색·캐시·생성·Judge 평가를 실행한다."""
    query = str(item["query"])
    history = item.get("history", [])

    if not isinstance(history, list):
        raise ValueError("item.history는 리스트여야 합니다.")

    if override_contexts is not None and not use_retrieval:
        raise ValueError(
            "override_contexts와 use_retrieval=False는 함께 쓸 수 없습니다."
        )

    if override_contexts is not None:
        # 오라클 조건. 검색 대신 정답 근거를 그대로 주입해
        # '이상적 근거였다면 얼마나 올랐을까'의 상한을 만든다.
        retrieved = copy.deepcopy(override_contexts)
        examples = []
        search_query = query
        retrieval_cache_hit = False
    elif use_retrieval:
        retrieved, examples, search_query, retrieval_cache_hit = retrieve_with_cache(
            query=query,
            history=history,
            retriever=retriever,
            query_transform_module=query_transform_module,
            retrieval_cache=retrieval_cache,
            retrieval_cache_path=retrieval_cache_path,
            use_query_transform=use_query_transform,
            use_hyde=use_hyde,
            use_examples=use_examples,
        )
    else:
        # RAG off 기준선. 검색 컨텍스트 없이 같은 생성 경로를 태워
        # '검색 유무' 하나만 다른 짝을 만든다.
        retrieved, examples, search_query, retrieval_cache_hit = [], [], query, False

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
        generation = run_with_retry(
            lambda: run_item_generation(
                item=item,
                retrieved=contexts,
                model=model,
                run_generation=run_generation,
                extract_improved_prompt=extract_improved_prompt,
            ),
            max_attempts=generation_max_attempts,
            base_delay_seconds=generation_base_delay_seconds,
            sleep_fn=generation_sleep_fn,
        )

        cache[cache_key] = copy.deepcopy(generation)
        save_cache(cache, cache_path)
        cache_hit = False

    result = {
        "generation": generation,
        "retrieved": retrieved,
        "examples": examples,
        "techniqueNames": technique_names,
        "searchQuery": search_query,
        "cacheKey": cache_key,
        "cacheHit": cache_hit,
        "useRetrieval": use_retrieval,
        "retrievalCacheHit": retrieval_cache_hit,
    }

    if judge_call is not None:
        judge_execution = run_judge_evaluation(
            item=item,
            generation=generation,
            judge_call=judge_call,
            judge_cache=judge_cache if judge_cache is not None else {},
            judge_cache_path=judge_cache_path,
            judge_model=judge_model,
            judge_prompt_version=judge_prompt_version,
            max_attempts=judge_max_attempts,
            base_delay_seconds=judge_base_delay_seconds,
            sleep_fn=judge_sleep_fn,
        )

        result["judge"] = judge_execution["result"]
        result["judgeCacheKey"] = judge_execution["cacheKey"]
        result["judgeCacheHit"] = judge_execution["cacheHit"]

    return result

def get_error_status_code(error: Exception) -> int | None:
    """예외 자체 또는 response 객체에서 HTTP 상태 코드를 추출한다."""
    status_code = getattr(error, "status_code", None)

    if status_code is None:
        response = getattr(error, "response", None)
        status_code = getattr(response, "status_code", None)

    if status_code is None:
        # google-genai 예외는 status_code가 아니라 code에 HTTP 상태를 담는다.
        status_code = getattr(error, "code", None)

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

    evaluation_target = select_generation_target(generation)

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


JUDGE_CACHE_NAMESPACE = "multi_turn_judge"


def build_judge_cache_key(
    history: list[dict[str, str]],
    current_request: str,
    generation_result: Any,
    judge_model: str,
    judge_prompt_version: str = "v1",
) -> str:
    """Judge 호출 결과를 재사용하기 위한 캐시 키를 만든다.

    namespace를 넣어 generation 캐시 키와 충돌하지 않게 하고, 정렬 직렬화로
    generation_result의 키 순서가 달라도 같은 키가 나오게 한다.
    """
    payload = {
        "namespace": JUDGE_CACHE_NAMESPACE,
        "history": history,
        "current_request": current_request,
        "generation_result": generation_result,
        "judge_model": str(judge_model),
        "judge_prompt_version": str(judge_prompt_version),
    }
    serialized = json.dumps(
        payload,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:20]


def run_judge_evaluation(
    item: dict[str, Any],
    generation: dict[str, Any],
    judge_call,
    judge_cache: dict[str, Any],
    judge_cache_path: str | None,
    judge_model: str,
    judge_prompt_version: str = "v1",
    max_attempts: int = 3,
    base_delay_seconds: float = 2.0,
    sleep_fn=time.sleep,
) -> dict[str, Any]:
    """Judge를 호출해 정규화된 평가 결과를 돌려준다.

    Judge SDK는 직접 import하지 않고 judge_call로 주입받는다.
    호출 형식은 judge_call(prompt=..., model=...)로 고정한다.
    """
    judge_prompt = build_judge_prompt(item, generation)

    judge_cache_key = build_judge_cache_key(
        history=item.get("history", []),
        current_request=str(item.get("query", "")),
        generation_result=generation,
        judge_model=judge_model,
        judge_prompt_version=judge_prompt_version,
    )

    cached = judge_cache.get(judge_cache_key)

    if isinstance(cached, dict):
        return {
            "result": copy.deepcopy(cached),
            "cacheKey": judge_cache_key,
            "cacheHit": True,
        }

    raw_result = run_with_retry(
        lambda: judge_call(prompt=judge_prompt, model=judge_model),
        max_attempts=max_attempts,
        base_delay_seconds=base_delay_seconds,
        sleep_fn=sleep_fn,
    )

    # 호출 자체가 성공했다면 valid=False여도 캐시한다.
    # 같은 잘못된 응답을 받으려고 API를 다시 호출할 이유가 없다.
    normalized = normalize_judge_result(raw_result)

    judge_cache[judge_cache_key] = copy.deepcopy(normalized)
    save_cache(judge_cache, judge_cache_path)

    return {
        "result": normalized,
        "cacheKey": judge_cache_key,
        "cacheHit": False,
    }


RETRIEVAL_EFFECT_HELP = "help"
RETRIEVAL_EFFECT_HARM = "harm"
RETRIEVAL_EFFECT_NEUTRAL = "neutral"
RETRIEVAL_EFFECT_INVALID = "invalid"

# judge 점수는 4항목 정수의 평균이라 최소 눈금이 0.25다.
# 그보다 작은 차이는 판정에 쓸 수 없다.
DEFAULT_MINIMUM_TAU = 0.25


def get_judge_average_score(evaluation: Any) -> float | None:
    """평가 결과에서 유효한 judge 평균 점수만 꺼낸다."""
    if not isinstance(evaluation, dict):
        return None

    judge = evaluation.get("judge")

    if not isinstance(judge, dict) or not judge.get("valid"):
        return None

    score = judge.get("averageScore")

    if isinstance(score, bool) or not isinstance(score, (int, float)):
        return None

    return float(score)


def calculate_judge_delta(baseline: Any, retrieval: Any) -> float | None:
    """RAG off 대비 RAG on의 judge 점수 변화량을 계산한다."""
    baseline_score = get_judge_average_score(baseline)
    retrieval_score = get_judge_average_score(retrieval)

    if baseline_score is None or retrieval_score is None:
        return None

    return retrieval_score - baseline_score


def classify_retrieval_effect(delta: float | None, tau: float) -> str:
    """점수 변화량을 도움·방해·중립으로 판정한다."""
    if delta is None:
        return RETRIEVAL_EFFECT_INVALID

    if delta >= tau:
        return RETRIEVAL_EFFECT_HELP

    if delta <= -tau:
        return RETRIEVAL_EFFECT_HARM

    return RETRIEVAL_EFFECT_NEUTRAL


def estimate_tau(
    repeated_scores: list[list[Any]],
    minimum_tau: float = DEFAULT_MINIMUM_TAU,
    sigma_multiplier: float = 2.0,
) -> float:
    """같은 조건 반복 실행의 점수 흔들림에서 판정 임계값을 유도한다.

    tau를 눈대중으로 정하면 help·harm 비율이 임계값 선택에 좌우된다.
    항목별 표준편차의 평균에 sigma_multiplier를 곱하고, judge 점수의
    최소 눈금을 하한으로 둔다.
    """
    deviations: list[float] = []

    for scores in repeated_scores:
        numeric_scores = [
            float(score)
            for score in scores
            if isinstance(score, (int, float)) and not isinstance(score, bool)
        ]

        if len(numeric_scores) >= 2:
            deviations.append(statistics.stdev(numeric_scores))

    if not deviations:
        return minimum_tau

    mean_deviation = sum(deviations) / len(deviations)
    return max(minimum_tau, sigma_multiplier * mean_deviation)


def calculate_retrieval_effect_rates(
    records: list[dict[str, Any]],
    tau: float = DEFAULT_MINIMUM_TAU,
) -> dict[str, Any]:
    """RAG on/off 짝에서 도움·방해·중립 비율을 계산한다.

    각 record는 item·baseline(RAG off)·retrieval(RAG on)을 담는다.
    judge가 무효인 항목은 분모에서 빼지 않고 invalid로 따로 센다.
    실패를 지우면 성숙도가 과대평가되기 때문이다.
    """
    counts = {
        RETRIEVAL_EFFECT_HELP: 0,
        RETRIEVAL_EFFECT_HARM: 0,
        RETRIEVAL_EFFECT_NEUTRAL: 0,
        RETRIEVAL_EFFECT_INVALID: 0,
    }
    deltas: list[float | None] = []

    for record in records:
        delta = calculate_judge_delta(
            record.get("baseline"),
            record.get("retrieval"),
        )
        deltas.append(delta)
        counts[classify_retrieval_effect(delta, tau)] += 1

    total = len(records)

    if not total:
        return {
            "total": 0,
            "tau": tau,
            "counts": counts,
            "retrievalHelpRate": None,
            "retrievalHarmRate": None,
            "retrievalNeutralRate": None,
            "invalidRate": None,
            "meanDelta": None,
        }

    return {
        "total": total,
        "tau": tau,
        "counts": counts,
        "retrievalHelpRate": counts[RETRIEVAL_EFFECT_HELP] / total,
        "retrievalHarmRate": counts[RETRIEVAL_EFFECT_HARM] / total,
        "retrievalNeutralRate": counts[RETRIEVAL_EFFECT_NEUTRAL] / total,
        "invalidRate": counts[RETRIEVAL_EFFECT_INVALID] / total,
        "meanDelta": average_non_null(deltas),
    }


def calculate_retrieval_effect_rates_by_category(
    records: list[dict[str, Any]],
    tau: float = DEFAULT_MINIMUM_TAU,
) -> dict[str, dict[str, Any]]:
    """category별로 나눠 집계한다.

    전체 평균만 내면 검색이 도움이 되는 category와 방해가 되는 category가
    상쇄되어, 둘 다 보이지 않게 된다.
    """
    grouped: dict[str, list[dict[str, Any]]] = {}

    for record in records:
        item = record.get("item")
        item = item if isinstance(item, dict) else {}
        category = str(item.get("category") or "unknown")
        grouped.setdefault(category, []).append(record)

    return {
        category: calculate_retrieval_effect_rates(category_records, tau)
        for category, category_records in sorted(grouped.items())
    }


def calculate_utility_recovery(
    records: list[dict[str, Any]],
    epsilon: float = 1e-9,
) -> dict[str, Any]:
    """오라클 대비 검색의 결정 이득 회수율(UR)을 계산한다.

    U*  = oracle − baseline  (이상적 근거가 줄 수 있었던 이득)
    U^R = retrieval − baseline  (실제 검색이 준 이득)

    U* > 0 인 근거 민감 항목만 집계한다. 이상적 근거를 줘도 나아지지 않는
    항목은 검색 탓을 물을 수 없다. help 비율만으로는 그 수치가 좋은 값인지
    알 수 없으므로, 회수율이 해석의 기준선이 된다.
    """
    ratios: list[float] = []
    evidence_sensitive = 0

    for record in records:
        baseline_score = get_judge_average_score(record.get("baseline"))
        retrieval_score = get_judge_average_score(record.get("retrieval"))
        oracle_score = get_judge_average_score(record.get("oracle"))

        if None in (baseline_score, retrieval_score, oracle_score):
            continue

        oracle_utility = oracle_score - baseline_score

        if oracle_utility <= 0:
            continue

        evidence_sensitive += 1
        ratio = (retrieval_score - baseline_score) / (oracle_utility + epsilon)
        ratios.append(max(-1.0, min(1.0, ratio)))

    return {
        "total": len(records),
        "evidenceSensitiveCount": evidence_sensitive,
        "utilityRecovery": (sum(ratios) / len(ratios)) if ratios else None,
    }


def is_mode_correct(item: dict[str, Any], evaluation: Any) -> bool | None:
    """expected_mode와 실제 mode가 일치하는지 판정한다."""
    expected_mode = normalize_mode(item.get("expected_mode"))

    if expected_mode not in {"improve", "ask"}:
        return None

    if not isinstance(evaluation, dict):
        return None

    generation = evaluation.get("generation")

    if not isinstance(generation, dict):
        return None

    return normalize_mode(generation.get("mode")) == expected_mode


def calculate_distract_rescue_rates(
    records: list[dict[str, Any]],
) -> dict[str, Any]:
    """검색이 맞던 판정을 깨뜨린 비율과 틀린 판정을 살린 비율을 계산한다.

    점수가 아니라 mode 판정 전환을 세는 보조 지표다.
    distract가 rescue보다 크면 검색이 구조를 깨는 쪽으로 더 많이 작용한다.
    """
    distract = 0
    rescue = 0
    comparable = 0

    for record in records:
        item = record.get("item")
        item = item if isinstance(item, dict) else {}

        baseline_correct = is_mode_correct(item, record.get("baseline"))
        retrieval_correct = is_mode_correct(item, record.get("retrieval"))

        if baseline_correct is None or retrieval_correct is None:
            continue

        comparable += 1

        if baseline_correct and not retrieval_correct:
            distract += 1
        elif not baseline_correct and retrieval_correct:
            rescue += 1

    if not comparable:
        return {
            "comparable": 0,
            "distractRate": None,
            "rescueRate": None,
            "netRescueIndex": None,
        }

    distract_rate = distract / comparable
    rescue_rate = rescue / comparable

    return {
        "comparable": comparable,
        "distractRate": distract_rate,
        "rescueRate": rescue_rate,
        "netRescueIndex": rescue_rate - distract_rate,
    }

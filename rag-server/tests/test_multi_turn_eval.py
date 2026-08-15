"""multi_turn_eval의 비LLM 단위 테스트."""

import json
import tempfile
from pathlib import Path

from eval.multi_turn_eval import (
    build_judge_prompt,
    normalize_judge_result,
    parse_judge_json,
    REQUIRED_CATEGORIES,
    average_non_null,
    build_cache_key,
    calculate_mode_accuracy,
    calculate_must_include_rate,
    calculate_must_not_include_violation_rate,
    find_must_not_include_violations,
    load_dataset,
    normalize_mode,
    extract_technique_names,
    normalize_generation_result,
    run_item_generation,
    retrieve_evaluation_contexts,
    extract_context_identifiers,
    run_evaluation_item,
    get_error_status_code,
    is_retryable_generation_error,
    run_with_retry,
    build_judge_cache_key,
    run_judge_evaluation,
    select_generation_target,
    build_retrieval_cache_key,
    calculate_judge_delta,
    classify_retrieval_effect,
    estimate_tau,
    calculate_retrieval_effect_rates,
    calculate_retrieval_effect_rates_by_category,
    calculate_utility_recovery,
    calculate_distract_rescue_rates,
)


VALID_JUDGE_RESPONSE = {
    "contextRetention": 5,
    "instructionFollowing": 4,
    "clarity": 4,
    "hallucinationAvoidance": 5,
    "reason": "이전 조건과 현재 요청을 모두 반영했습니다.",
}


class FakeJudgeRateLimitError(Exception):
    status_code = 429


def make_judge_call(responses=None):
    """호출 인자를 기록하는 fake judge_call을 만든다."""
    calls = []

    def judge_call(prompt, model):
        calls.append({"prompt": prompt, "model": model})

        if responses is None:
            return dict(VALID_JUDGE_RESPONSE)

        return responses[len(calls) - 1]

    return judge_call, calls


def make_evaluation(average_score, mode="improve", valid=True):
    """집계 함수 검증용 평가 결과를 만든다."""
    return {
        "generation": {"mode": mode},
        "judge": {
            "valid": valid,
            "scores": {},
            "averageScore": average_score if valid else None,
            "reason": "",
            "error": None if valid else "invalid_json",
        },
    }


def make_evaluation_item_kwargs(generation_result, generation_calls=None):
    """run_evaluation_item 호출에 필요한 공통 fake 의존성을 만든다."""

    class FakeRetriever:
        def search(self, **kwargs):
            if kwargs["collection_name"] == "prompt_techniques":
                return [
                    {
                        "document": "역할을 명확히 지정한다.",
                        "metadata": {"technique": "역할 부여"},
                    }
                ]

            return []

    class FakeQueryTransform:
        pass

    def fake_run_generation(query, contexts, model, history):
        if generation_calls is not None:
            generation_calls.append({"contexts": contexts})

        return dict(generation_result)

    return {
        "retriever": FakeRetriever(),
        "query_transform_module": FakeQueryTransform,
        "run_generation": fake_run_generation,
        "extract_improved_prompt": lambda answer: "",
        "cache": {},
        "cache_path": None,
        "model": "gemini-2.0-flash",
        "temperature": "0.7",
        "system_prompt": "system",
    }


def test_cache_key_changes_with_history() -> None:
    history_a = [{"role": "user", "content": "처음 요청"}]
    history_b = [{"role": "user", "content": "수정된 요청"}]

    key_a = build_cache_key(
        query="현재 질문",
        history=history_a,
        technique_names=["기법 B", "기법 A"],
        model="test-model",
        temperature="0",
        system_prompt="test-system",
    )
    key_b = build_cache_key(
        query="현재 질문",
        history=history_b,
        technique_names=["기법 B", "기법 A"],
        model="test-model",
        temperature="0",
        system_prompt="test-system",
    )

    assert key_a != key_b


def test_same_input_produces_same_cache_key() -> None:
    arguments = {
        "query": "현재 질문",
        "history": [
            {"role": "user", "content": "이전 질문"},
            {"role": "assistant", "content": "이전 답변"},
        ],
        "model": "test-model",
        "temperature": "0",
        "system_prompt": "test-system",
    }

    key_a = build_cache_key(
        technique_names=["기법 B", "기법 A"],
        **arguments,
    )
    key_b = build_cache_key(
        technique_names=["기법 A", "기법 B"],
        **arguments,
    )

    assert key_a == key_b


def test_must_include_rate() -> None:
    text = "대학생을 위한 친근한 시간 관리 카드뉴스 5장을 작성하라."
    rate = calculate_must_include_rate(
        text,
        ["대학생", "친근", "시간 관리", "온라인"],
    )

    assert rate == 0.75
    assert calculate_must_include_rate(text, []) is None


def test_must_not_include_detection() -> None:
    text = "중학생 대상의 5분 발표 자료를 작성하라."
    prohibited = ["중학생", "10분", "오프라인"]

    assert find_must_not_include_violations(text, prohibited) == ["중학생"]
    assert calculate_must_not_include_violation_rate(text, prohibited) == 1 / 3
    assert calculate_must_not_include_violation_rate(text, []) is None


def test_average_excludes_null_and_non_numeric_values() -> None:
    assert average_non_null([5, None, 3.0, "4", True]) == 4.0
    assert average_non_null([None, "4", True]) is None


def test_expected_mode_accuracy() -> None:
    results = [
        {"expected_mode": "improve", "mode": "improve"},
        {"expected_mode": "ask", "mode": "ask"},
        {"expected_mode": "improve", "mode": "ask"},
        {"expected_mode": "", "mode": "improve"},
    ]

    assert calculate_mode_accuracy(results) == 2 / 3
    assert normalize_mode(" IMPROVE ") == "improve"
    assert normalize_mode("invalid") == "unknown"


def test_dataset_roles_content_ids_and_categories() -> None:
    dataset_path = (
        Path(__file__).resolve().parents[1]
        / "eval"
        / "multi_turn_set.json"
    )
    data = load_dataset(str(dataset_path))
    items = data["items"]

    ids = [item["id"] for item in items]
    assert len(ids) == len(set(ids))

    category_counts = {
        category: sum(item.get("category") == category for item in items)
        for category in REQUIRED_CATEGORIES
    }
    assert all(count >= 2 for count in category_counts.values())

    for item in items:
        assert item.get("query", "").strip()

        history = item.get("history")
        assert isinstance(history, list)
        assert history

        for message in history:
            assert message.get("role") in {"user", "assistant"}
            assert isinstance(message.get("content"), str)
            assert message["content"].strip()


def test_dataset_json_round_trip() -> None:
    dataset_path = (
        Path(__file__).resolve().parents[1]
        / "eval"
        / "multi_turn_set.json"
    )
    data = load_dataset(str(dataset_path))

    with tempfile.TemporaryDirectory() as temporary_directory:
        copied_path = Path(temporary_directory) / "copied.json"
        copied_path.write_text(
            json.dumps(data, ensure_ascii=False),
            encoding="utf-8",
        )
        copied = load_dataset(str(copied_path))

    assert copied == data

def test_generation_uses_history_without_mutating_dataset() -> None:
    item = {
        "query": "현재 요청",
        "history": [
            {"role": "user", "content": "이전 요청"},
            {"role": "assistant", "content": "이전 답변"},
        ],
    }
    original_history = json.loads(json.dumps(item["history"], ensure_ascii=False))
    received_history = None

    def fake_run_generation(query, retrieved, model, history):
        nonlocal received_history

        assert query == "현재 요청"
        assert retrieved == [{"metadata": {"technique": "역할 부여"}}]
        assert model == "test-model"

        received_history = history
        history.append({"role": "user", "content": "생성 중 추가된 값"})

        return {
            "answer": "생성 결과",
            "improved_prompt": "AI에게 개선된 작업을 수행하게 하라.",
        }

    result = run_item_generation(
        item=item,
        retrieved=[{"metadata": {"technique": "역할 부여"}}],
        model="test-model",
        run_generation=fake_run_generation,
        extract_improved_prompt=lambda answer: "",
    )

    assert received_history is not item["history"]
    assert item["history"] == original_history
    assert result["mode"] == "improve"
    assert result["improved_prompt"] == "AI에게 개선된 작업을 수행하게 하라."


def test_generation_result_normalization_and_technique_names() -> None:
    string_result = normalize_generation_result(
        "[개선안]\n요약문을 작성하라.",
        lambda answer: "요약문을 작성하라.",
    )
    ask_result = normalize_generation_result(
        {
            "answer": "글의 주제를 알려주세요.",
            "improved_prompt": "",
            "mode": "ask",
        },
        lambda answer: "",
    )

    retrieved = [
        {"metadata": {"technique": "역할 부여"}},
        {"metadata": {"source": "출력 형식 지정"}},
        {"metadata": {}},
    ]

    assert string_result["mode"] == "improve"
    assert string_result["improved_prompt"] == "요약문을 작성하라."
    assert ask_result["mode"] == "ask"
    assert extract_technique_names(retrieved) == [
        "역할 부여",
        "출력 형식 지정",
    ]

def test_retrieval_matches_operating_defaults() -> None:
    calls = []

    class FakeRetriever:
        def search(self, **kwargs):
            calls.append(kwargs)

            if kwargs["collection_name"] == "prompt_techniques":
                return [{"metadata": {"technique": "역할 부여"}}]

            return [{"metadata": {"source": "유사 개선 사례"}}]

    class FakeQueryTransform:
        @staticmethod
        def transform(query, history):
            raise AssertionError("기본 설정에서는 transform을 호출하면 안 됩니다.")

        @staticmethod
        def hyde(query, history):
            raise AssertionError("기본 설정에서는 HyDE를 호출하면 안 됩니다.")

    retrieved, examples, search_query = retrieve_evaluation_contexts(
        query="현재 요청",
        history=[{"role": "user", "content": "이전 요청"}],
        retriever=FakeRetriever(),
        query_transform_module=FakeQueryTransform,
    )

    assert search_query == "현재 요청"
    assert retrieved == [{"metadata": {"technique": "역할 부여"}}]
    assert examples == [{"metadata": {"source": "유사 개선 사례"}}]

    assert calls == [
        {
            "query": "현재 요청",
            "collection_name": "prompt_techniques",
            "top_k": 5,
            "use_reranker": True,
            "use_hybrid": False,
            "min_score": 0.40,
        },
        {
            "query": "현재 요청",
            "collection_name": "prompt_examples",
            "top_k": 2,
            "use_reranker": False,
            "use_hybrid": False,
            "min_score": 0.40,
        },
    ]


def test_retrieval_uses_hyde_only_when_enabled() -> None:
    calls = []

    class FakeRetriever:
        def search(self, **kwargs):
            calls.append(kwargs)
            return []

    class FakeQueryTransform:
        @staticmethod
        def transform(query, history):
            return "변환 쿼리"

        @staticmethod
        def hyde(query, history):
            assert history == [{"role": "user", "content": "이전 요청"}]
            return "원본과 가상 문서를 결합한 쿼리"

    _, examples, search_query = retrieve_evaluation_contexts(
        query="현재 요청",
        history=[{"role": "user", "content": "이전 요청"}],
        retriever=FakeRetriever(),
        query_transform_module=FakeQueryTransform,
        use_hyde=True,
        use_examples=False,
    )

    assert search_query == "원본과 가상 문서를 결합한 쿼리"
    assert examples == []
    assert len(calls) == 1
    assert calls[0]["query"] == "원본과 가상 문서를 결합한 쿼리"


def test_example_search_failure_does_not_stop_retrieval() -> None:
    class FakeRetriever:
        def search(self, **kwargs):
            if kwargs["collection_name"] == "prompt_examples":
                raise RuntimeError("예시 컬렉션 오류")

            return [{"metadata": {"technique": "출력 형식 지정"}}]

    class FakeQueryTransform:
        pass

    retrieved, examples, _ = retrieve_evaluation_contexts(
        query="현재 요청",
        history=[],
        retriever=FakeRetriever(),
        query_transform_module=FakeQueryTransform,
    )

    assert retrieved == [{"metadata": {"technique": "출력 형식 지정"}}]
    assert examples == []

def test_cache_key_changes_with_examples_and_analyzer_settings() -> None:
    common = {
        "query": "현재 요청",
        "history": [{"role": "user", "content": "이전 요청"}],
        "technique_names": ["역할 부여"],
        "model": "gemini-2.0-flash",
        "temperature": "0.7",
        "system_prompt": "system",
        "analyzer_model": "llama-3.1-8b-instant",
        "analyzer_temperature": "0.2",
    }

    example_a = [{"document": "예시 A", "metadata": {"source": "example-a"}}]
    example_b = [{"document": "예시 B", "metadata": {"source": "example-b"}}]

    key_a = build_cache_key(
        context_identifiers=extract_context_identifiers(example_a),
        use_analyzer=True,
        **common,
    )
    key_b = build_cache_key(
        context_identifiers=extract_context_identifiers(example_b),
        use_analyzer=True,
        **common,
    )
    key_without_analyzer = build_cache_key(
        context_identifiers=extract_context_identifiers(example_a),
        use_analyzer=False,
        **common,
    )

    assert key_a != key_b
    assert key_a != key_without_analyzer


def test_context_identifier_is_stable() -> None:
    contexts = [
        {
            "document": "개선 사례",
            "metadata": {"source": "example", "category": "format"},
        }
    ]

    assert extract_context_identifiers(contexts) == extract_context_identifiers(
        contexts
    )

def test_run_evaluation_item_reuses_cached_generation() -> None:
    generation_count = 0

    class FakeRetriever:
        def search(self, **kwargs):
            if kwargs["collection_name"] == "prompt_techniques":
                return [
                    {
                        "document": "출력 형식을 지정한다.",
                        "metadata": {"technique": "출력 형식 지정"},
                    }
                ]

            return []

    class FakeQueryTransform:
        pass

    def fake_run_generation(query, contexts, model, history):
        nonlocal generation_count
        generation_count += 1

        return {
            "mode": "improve",
            "answer": "완료",
            "improvedPrompt": "캐시될 결과",
            "questions": [],
        }

    def fake_extract_improved_prompt(answer):
        assert answer == "완료"
        return "캐시될 결과"

    cache = {}
    item = {
        "query": "표로 정리해줘",
        "history": [],
    }

    common = {
        "item": item,
        "retriever": FakeRetriever(),
        "query_transform_module": FakeQueryTransform,
        "run_generation": fake_run_generation,
        "extract_improved_prompt": fake_extract_improved_prompt,
        "cache": cache,
        "cache_path": None,
        "model": "gemini-2.0-flash",
        "temperature": "0.7",
        "system_prompt": "system",
    }

    first = run_evaluation_item(**common)
    second = run_evaluation_item(**common)

    assert first["cacheHit"] is False
    assert second["cacheHit"] is True
    assert first["cacheKey"] == second["cacheKey"]
    assert first["generation"] == second["generation"]
    assert generation_count == 1

def test_cached_generation_is_returned_as_copy() -> None:
    class FakeRetriever:
        def search(self, **kwargs):
            return []

    class FakeQueryTransform:
        pass

    def fake_run_generation(query, contexts, model, history):
        return {
            "mode": "ask",
            "answer": "대상을 알려주세요.",
            "improvedPrompt": "",
            "questions": ["대상은 누구인가요?"],
        }

    def fake_extract_improved_prompt(answer):
        assert answer == "대상을 알려주세요."
        return ""

    cache = {}
    common = {
        "item": {"query": "글 써줘", "history": []},
        "retriever": FakeRetriever(),
        "query_transform_module": FakeQueryTransform,
        "run_generation": fake_run_generation,
        "extract_improved_prompt": fake_extract_improved_prompt,
        "cache": cache,
        "cache_path": None,
        "model": "gemini-2.0-flash",
        "temperature": "0.7",
        "system_prompt": "system",
    }

    first = run_evaluation_item(**common)
    second = run_evaluation_item(**common)

    second["generation"]["answer"] = "수정된 값"

    assert first["generation"]["answer"] == "대상을 알려주세요."
    assert cache[first["cacheKey"]]["answer"] == "대상을 알려주세요."

def test_run_evaluation_item_generates_and_saves_cache() -> None:
    search_calls = []
    generation_calls = []

    class FakeRetriever:
        def search(self, **kwargs):
            search_calls.append(kwargs)

            if kwargs["collection_name"] == "prompt_techniques":
                return [
                    {
                        "document": "역할을 명확히 지정한다.",
                        "metadata": {"technique": "역할 부여"},
                    }
                ]

            return [
                {
                    "document": "유사 개선 사례",
                    "metadata": {"source": "example-1"},
                }
            ]

    class FakeQueryTransform:
        pass

    def fake_run_generation(query, contexts, model, history):
        generation_calls.append(
            {
                "query": query,
                "contexts": contexts,
                "model": model,
                "history": history,
            }
        )
        return {
            "mode": "improve",
            "answer": "개선했습니다.",
            "improvedPrompt": "개선된 프롬프트",
            "questions": [],
        }

    def fake_extract_improved_prompt(answer):
        assert answer == "개선했습니다."
        return "개선된 프롬프트"

    cache = {}

    with tempfile.TemporaryDirectory() as temp_dir:
        cache_path = str(Path(temp_dir) / "evaluation-cache.json")

        result = run_evaluation_item(
            item={
                "query": "보고서를 작성해줘",
                "history": [
                    {"role": "user", "content": "대학생 대상이야"}
                ],
            },
            retriever=FakeRetriever(),
            query_transform_module=FakeQueryTransform,
            run_generation=fake_run_generation,
            extract_improved_prompt=fake_extract_improved_prompt,
            cache=cache,
            cache_path=cache_path,
            model="gemini-2.0-flash",
            temperature="0.7",
            system_prompt="system",
        )

        assert result["cacheHit"] is False
        assert result["generation"]["improvedPrompt"] == "개선된 프롬프트"
        assert result["techniqueNames"] == ["역할 부여"]
        assert result["searchQuery"] == "보고서를 작성해줘"

        assert len(search_calls) == 2
        assert len(generation_calls) == 1
        assert len(generation_calls[0]["contexts"]) == 2

        assert result["cacheKey"] in cache

        saved = json.loads(Path(cache_path).read_text(encoding="utf-8"))
        assert result["cacheKey"] in saved

def test_retry_succeeds_after_rate_limit() -> None:
    attempts = 0
    delays = []

    class RateLimitError(Exception):
        status_code = 429

    def operation():
        nonlocal attempts
        attempts += 1

        if attempts < 3:
            raise RateLimitError("Too many requests")

        return "성공"

    result = run_with_retry(
        operation=operation,
        max_attempts=3,
        base_delay_seconds=1.5,
        sleep_fn=delays.append,
    )

    assert result == "성공"
    assert attempts == 3
    assert delays == [1.5, 3.0]


def test_non_retryable_error_is_raised_immediately() -> None:
    attempts = 0
    delays = []

    def operation():
        nonlocal attempts
        attempts += 1
        raise ValueError("잘못된 입력")

    try:
        run_with_retry(
            operation=operation,
            max_attempts=3,
            sleep_fn=delays.append,
        )
    except ValueError as error:
        assert str(error) == "잘못된 입력"
    else:
        raise AssertionError("ValueError가 다시 발생해야 합니다.")

    assert attempts == 1
    assert delays == []
    assert get_error_status_code(ValueError("오류")) is None
    assert not is_retryable_generation_error(ValueError("오류"))

def test_judge_prompt_contains_history_and_generation() -> None:
    item = {
        "history": [
            {
                "role": "user",
                "content": "대학생 대상 시간 관리 글을 작성해줘.",
            }
        ],
        "query": "친근한 말투와 5문단으로 바꿔줘.",
        "expected_mode": "improve",
        "must_include": ["대학생", "시간 관리", "5문단"],
        "must_not_include": ["중학생"],
    }

    generation = {
        "mode": "improve",
        "answer": "개선했습니다.",
        "improvedPrompt": (
            "대학생을 대상으로 시간 관리 글을 "
            "친근한 말투의 5문단으로 작성하라."
        ),
    }

    prompt = build_judge_prompt(item, generation)

    assert "대학생 대상 시간 관리 글" in prompt
    assert "친근한 말투와 5문단" in prompt
    assert generation["improvedPrompt"] in prompt
    assert "contextRetention" in prompt
    assert "hallucinationAvoidance" in prompt


def test_parse_judge_json_accepts_markdown_fence() -> None:
    raw_result = """```json
{
  "contextRetention": 5,
  "instructionFollowing": 4,
  "clarity": 5,
  "hallucinationAvoidance": 4,
  "reason": "이전 조건과 현재 요청을 모두 반영했습니다."
}
```"""

    parsed = parse_judge_json(raw_result)

    assert parsed is not None
    assert parsed["contextRetention"] == 5
    assert parsed["reason"] == (
        "이전 조건과 현재 요청을 모두 반영했습니다."
    )


def test_normalize_judge_result_calculates_average() -> None:
    result = normalize_judge_result({
        "contextRetention": 5,
        "instructionFollowing": "4",
        "clarity": 3.0,
        "hallucinationAvoidance": 4,
        "reason": "전반적으로 조건을 충실히 반영했습니다.",
    })

    assert result["valid"] is True
    assert result["scores"] == {
        "contextRetention": 5,
        "instructionFollowing": 4,
        "clarity": 3,
        "hallucinationAvoidance": 4,
    }
    assert result["averageScore"] == 4.0
    assert result["error"] is None


def test_normalize_judge_result_rejects_invalid_response() -> None:
    invalid_json = normalize_judge_result("JSON이 아닌 응답")

    assert invalid_json["valid"] is False
    assert invalid_json["averageScore"] is None
    assert invalid_json["error"] == "invalid_json"

    invalid_scores = normalize_judge_result({
        "contextRetention": 6,
        "instructionFollowing": 4,
        "clarity": 0,
        "hallucinationAvoidance": 5,
        "reason": "점수 범위가 잘못되었습니다.",
    })

    assert invalid_scores["valid"] is False
    assert invalid_scores["averageScore"] is None
    assert invalid_scores["error"] == "invalid_scores"
    assert invalid_scores["invalidScoreKeys"] == [
        "contextRetention",
        "clarity",
    ]

def test_judge_prompt_uses_production_generation_shape() -> None:
    """운영 run_generation은 improved_prompt를 쓴다.

    Judge가 camelCase만 읽으면 improve 모드에서 평가 대상이 빈 문자열이 된다.
    """
    item = {
        "history": [{"role": "user", "content": "대학생 대상이야."}],
        "query": "친근한 말투로 바꿔줘.",
        "expected_mode": "improve",
    }

    production_generation = {
        "mode": "improve",
        "answer": "개선했습니다.",
        "improved_prompt": "대학생을 대상으로 친근한 말투로 작성하라.",
    }

    assert select_generation_target(production_generation) == (
        "대학생을 대상으로 친근한 말투로 작성하라."
    )

    prompt = build_judge_prompt(item, production_generation)
    assert production_generation["improved_prompt"] in prompt

    # ask 모드는 되물음 문장을 평가한다.
    ask_generation = {
        "mode": "ask",
        "answer": "어떤 분량을 원하시나요?",
        "improved_prompt": "",
    }
    assert select_generation_target(ask_generation) == "어떤 분량을 원하시나요?"


def test_judge_cache_key_is_deterministic() -> None:
    history = [{"role": "user", "content": "대학생 대상이야."}]
    generation = {"mode": "improve", "improved_prompt": "개선안", "answer": "완료"}
    reordered = {"answer": "완료", "improved_prompt": "개선안", "mode": "improve"}

    first = build_judge_cache_key(
        history=history,
        current_request="5문단으로",
        generation_result=generation,
        judge_model="gemini-2.0-flash",
    )
    second = build_judge_cache_key(
        history=history,
        current_request="5문단으로",
        generation_result=generation,
        judge_model="gemini-2.0-flash",
    )
    key_order_changed = build_judge_cache_key(
        history=history,
        current_request="5문단으로",
        generation_result=reordered,
        judge_model="gemini-2.0-flash",
    )

    assert first == second
    assert first == key_order_changed


def test_judge_cache_key_changes_with_inputs() -> None:
    base = {
        "history": [{"role": "user", "content": "대학생 대상이야."}],
        "current_request": "5문단으로",
        "generation_result": {"mode": "improve", "improved_prompt": "개선안"},
        "judge_model": "gemini-2.0-flash",
    }
    base_key = build_judge_cache_key(**base)

    changed_history = dict(base)
    changed_history["history"] = [{"role": "user", "content": "중학생 대상이야."}]

    changed_request = dict(base)
    changed_request["current_request"] = "3문단으로"

    changed_generation = dict(base)
    changed_generation["generation_result"] = {
        "mode": "improve",
        "improved_prompt": "다른 개선안",
    }

    changed_model = dict(base)
    changed_model["judge_model"] = "llama-3.3-70b-versatile"

    changed_version = dict(base)
    changed_version["judge_prompt_version"] = "v2"

    for changed in (
        changed_history,
        changed_request,
        changed_generation,
        changed_model,
        changed_version,
    ):
        assert build_judge_cache_key(**changed) != base_key

    # generation 캐시 키와 namespace가 달라 충돌하지 않는다.
    generation_cache_key = build_cache_key(
        query=base["current_request"],
        history=base["history"],
        technique_names=[],
    )
    assert base_key != generation_cache_key


def test_judge_evaluation_calls_judge_on_cache_miss() -> None:
    judge_call, calls = make_judge_call()
    judge_cache = {}

    item = {"history": [], "query": "표로 정리해줘", "expected_mode": "improve"}
    generation = {"mode": "improve", "improved_prompt": "개선안", "answer": "완료"}

    execution = run_judge_evaluation(
        item=item,
        generation=generation,
        judge_call=judge_call,
        judge_cache=judge_cache,
        judge_cache_path=None,
        judge_model="gemini-2.0-flash",
    )

    assert len(calls) == 1
    assert calls[0]["model"] == "gemini-2.0-flash"
    assert "contextRetention" in calls[0]["prompt"]

    assert execution["cacheHit"] is False
    assert execution["result"]["valid"] is True
    assert execution["result"]["averageScore"] == 4.5

    # 캐시에는 raw 응답이 아니라 정규화된 결과가 저장된다.
    cached = judge_cache[execution["cacheKey"]]
    assert cached["valid"] is True
    assert cached["scores"]["contextRetention"] == 5


def test_judge_evaluation_reuses_cache_on_second_run() -> None:
    judge_call, calls = make_judge_call()
    judge_cache = {}

    common = {
        "item": {"history": [], "query": "표로 정리해줘"},
        "generation": {"mode": "improve", "improved_prompt": "개선안"},
        "judge_call": judge_call,
        "judge_cache": judge_cache,
        "judge_cache_path": None,
        "judge_model": "gemini-2.0-flash",
    }

    first = run_judge_evaluation(**common)
    second = run_judge_evaluation(**common)

    assert len(calls) == 1
    assert first["cacheHit"] is False
    assert second["cacheHit"] is True
    assert first["cacheKey"] == second["cacheKey"]
    assert second["result"]["averageScore"] == first["result"]["averageScore"]


def test_judge_evaluation_caches_invalid_response() -> None:
    """호출은 성공했으나 응답이 무효인 경우에도 재호출하지 않는다."""
    judge_call, calls = make_judge_call(responses=["JSON이 아닌 응답"])
    judge_cache = {}

    common = {
        "item": {"history": [], "query": "표로 정리해줘"},
        "generation": {"mode": "improve", "improved_prompt": "개선안"},
        "judge_call": judge_call,
        "judge_cache": judge_cache,
        "judge_cache_path": None,
        "judge_model": "gemini-2.0-flash",
    }

    first = run_judge_evaluation(**common)
    second = run_judge_evaluation(**common)

    assert first["result"]["valid"] is False
    assert first["result"]["error"] == "invalid_json"
    assert len(calls) == 1
    assert second["cacheHit"] is True


def test_judge_evaluation_saves_cache_file() -> None:
    judge_call, _calls = make_judge_call()
    judge_cache = {}

    with tempfile.TemporaryDirectory() as temp_dir:
        judge_cache_path = str(Path(temp_dir) / "judge-cache.json")

        execution = run_judge_evaluation(
            item={"history": [], "query": "표로 정리해줘"},
            generation={"mode": "improve", "improved_prompt": "개선안"},
            judge_call=judge_call,
            judge_cache=judge_cache,
            judge_cache_path=judge_cache_path,
            judge_model="gemini-2.0-flash",
        )

        saved = json.loads(Path(judge_cache_path).read_text(encoding="utf-8"))
        assert execution["cacheKey"] in saved


def test_judge_retry_waits_and_succeeds() -> None:
    attempts = 0
    delays = []

    def judge_call(prompt, model):
        nonlocal attempts
        attempts += 1

        if attempts < 3:
            raise FakeJudgeRateLimitError("Too many requests")

        return dict(VALID_JUDGE_RESPONSE)

    execution = run_judge_evaluation(
        item={"history": [], "query": "표로 정리해줘"},
        generation={"mode": "improve", "improved_prompt": "개선안"},
        judge_call=judge_call,
        judge_cache={},
        judge_cache_path=None,
        judge_model="gemini-2.0-flash",
        max_attempts=3,
        base_delay_seconds=2.0,
        sleep_fn=delays.append,
    )

    assert attempts == 3
    assert delays == [2.0, 4.0]
    assert execution["result"]["valid"] is True


def test_judge_non_retryable_error_is_raised_immediately() -> None:
    attempts = 0
    delays = []
    judge_cache = {}

    def judge_call(prompt, model):
        nonlocal attempts
        attempts += 1
        raise ValueError("잘못된 Judge 입력")

    try:
        run_judge_evaluation(
            item={"history": [], "query": "표로 정리해줘"},
            generation={"mode": "improve", "improved_prompt": "개선안"},
            judge_call=judge_call,
            judge_cache=judge_cache,
            judge_cache_path=None,
            judge_model="gemini-2.0-flash",
            sleep_fn=delays.append,
        )
    except ValueError as error:
        assert str(error) == "잘못된 Judge 입력"
    else:
        raise AssertionError("ValueError가 호출자에게 전달되어야 합니다.")

    assert attempts == 1
    assert delays == []
    assert judge_cache == {}


def test_run_evaluation_item_attaches_judge_result() -> None:
    judge_call, calls = make_judge_call()
    item = {"query": "보고서를 작성해줘", "history": [], "expected_mode": "improve"}

    result = run_evaluation_item(
        item=item,
        judge_call=judge_call,
        judge_cache={},
        judge_model="gemini-2.0-flash",
        **make_evaluation_item_kwargs({
            "mode": "improve",
            "answer": "개선했습니다.",
            "improved_prompt": "개선된 프롬프트",
        }),
    )

    assert len(calls) == 1
    assert "judge" in result
    assert "judgeCacheKey" in result
    assert "judgeCacheHit" in result
    assert result["judge"]["valid"] is True
    assert result["judgeCacheHit"] is False

    # 운영 형식(snake_case)이 Judge 프롬프트에 실제로 들어간다.
    assert "개선된 프롬프트" in calls[0]["prompt"]


def test_run_evaluation_item_without_judge_keeps_original_shape() -> None:
    result = run_evaluation_item(
        item={"query": "보고서를 작성해줘", "history": []},
        **make_evaluation_item_kwargs({
            "mode": "improve",
            "answer": "개선했습니다.",
            "improved_prompt": "개선된 프롬프트",
        }),
    )

    assert "judge" not in result
    assert "judgeCacheKey" not in result
    assert "judgeCacheHit" not in result
    assert result["generation"]["improved_prompt"] == "개선된 프롬프트"


def test_generation_cache_and_judge_cache_are_independent() -> None:
    judge_call, judge_calls = make_judge_call()
    generation_calls = []

    kwargs = make_evaluation_item_kwargs(
        {
            "mode": "improve",
            "answer": "개선했습니다.",
            "improved_prompt": "개선된 프롬프트",
        },
        generation_calls=generation_calls,
    )
    shared_generation_cache = {}
    kwargs["cache"] = shared_generation_cache

    item = {"query": "보고서를 작성해줘", "history": []}

    # generation 캐시만 적중해도 Judge 캐시가 비어 있으면 Judge는 호출된다.
    first = run_evaluation_item(
        item=item, judge_call=judge_call, judge_cache={},
        judge_model="gemini-2.0-flash", **kwargs
    )
    second = run_evaluation_item(
        item=item, judge_call=judge_call, judge_cache={},
        judge_model="gemini-2.0-flash", **kwargs
    )

    assert first["cacheHit"] is False
    assert second["cacheHit"] is True
    assert len(generation_calls) == 1
    assert len(judge_calls) == 2

    # 두 캐시가 모두 적중하면 어느 쪽도 다시 호출되지 않는다.
    shared_judge_cache = {}
    third = run_evaluation_item(
        item=item, judge_call=judge_call, judge_cache=shared_judge_cache,
        judge_model="gemini-2.0-flash", **kwargs
    )
    fourth = run_evaluation_item(
        item=item, judge_call=judge_call, judge_cache=shared_judge_cache,
        judge_model="gemini-2.0-flash", **kwargs
    )

    assert third["judgeCacheHit"] is False
    assert fourth["judgeCacheHit"] is True
    assert fourth["cacheHit"] is True
    assert len(generation_calls) == 1
    assert len(judge_calls) == 3


def test_retrieval_can_be_disabled_for_baseline() -> None:
    generation_calls = []
    kwargs = make_evaluation_item_kwargs(
        {"mode": "improve", "answer": "완료", "improved_prompt": "개선안"},
        generation_calls=generation_calls,
    )

    result = run_evaluation_item(
        item={"query": "보고서를 작성해줘", "history": []},
        use_retrieval=False,
        **kwargs,
    )

    assert result["useRetrieval"] is False
    assert result["retrieved"] == []
    assert result["examples"] == []
    assert result["techniqueNames"] == []
    assert result["searchQuery"] == "보고서를 작성해줘"
    assert generation_calls[0]["contexts"] == []


def test_retrieval_cache_freezes_search_results() -> None:
    search_calls = []

    class CountingRetriever:
        def search(self, **kwargs):
            search_calls.append(kwargs["collection_name"])

            if kwargs["collection_name"] == "prompt_techniques":
                return [
                    {
                        "document": "역할을 명확히 지정한다.",
                        "metadata": {"technique": "역할 부여"},
                    }
                ]

            return []

    kwargs = make_evaluation_item_kwargs(
        {"mode": "improve", "answer": "완료", "improved_prompt": "개선안"}
    )
    kwargs["retriever"] = CountingRetriever()

    retrieval_cache = {}
    item = {"query": "보고서를 작성해줘", "history": []}

    first = run_evaluation_item(
        item=item, retrieval_cache=retrieval_cache, **kwargs
    )
    # 생성 캐시를 비워도 검색은 다시 돌지 않아야 한다.
    kwargs["cache"] = {}
    second = run_evaluation_item(
        item=item, retrieval_cache=retrieval_cache, **kwargs
    )

    assert first["retrievalCacheHit"] is False
    assert second["retrievalCacheHit"] is True
    assert second["techniqueNames"] == ["역할 부여"]
    assert len(search_calls) == 2

    key = build_retrieval_cache_key(
        "보고서를 작성해줘",
        [],
        {"use_query_transform": False, "use_hyde": False, "use_examples": True},
    )
    assert key in retrieval_cache


def test_retrieval_effect_rates_classify_help_harm_neutral() -> None:
    records = [
        {"item": {}, "baseline": make_evaluation(3.0), "retrieval": make_evaluation(4.0)},
        {"item": {}, "baseline": make_evaluation(4.0), "retrieval": make_evaluation(3.0)},
        {"item": {}, "baseline": make_evaluation(4.0), "retrieval": make_evaluation(4.0)},
        {
            "item": {},
            "baseline": make_evaluation(None, valid=False),
            "retrieval": make_evaluation(4.0),
        },
    ]

    assert calculate_judge_delta(records[0]["baseline"], records[0]["retrieval"]) == 1.0
    assert classify_retrieval_effect(None, 0.5) == "invalid"

    rates = calculate_retrieval_effect_rates(records, tau=0.5)

    assert rates["total"] == 4
    assert rates["retrievalHelpRate"] == 0.25
    assert rates["retrievalHarmRate"] == 0.25
    assert rates["retrievalNeutralRate"] == 0.25
    assert rates["invalidRate"] == 0.25
    assert rates["meanDelta"] == 0.0

    empty = calculate_retrieval_effect_rates([], tau=0.5)
    assert empty["total"] == 0
    assert empty["retrievalHelpRate"] is None


def test_retrieval_effect_rates_split_by_category() -> None:
    """전체 평균은 상쇄되지만 category별로는 반대 방향이 드러난다."""
    records = [
        {
            "item": {"category": "context_retention"},
            "baseline": make_evaluation(3.0),
            "retrieval": make_evaluation(4.0),
        },
        {
            "item": {"category": "faithfulness"},
            "baseline": make_evaluation(4.0),
            "retrieval": make_evaluation(3.0),
        },
    ]

    overall = calculate_retrieval_effect_rates(records, tau=0.5)
    by_category = calculate_retrieval_effect_rates_by_category(records, tau=0.5)

    assert overall["meanDelta"] == 0.0
    assert by_category["context_retention"]["retrievalHelpRate"] == 1.0
    assert by_category["context_retention"]["retrievalHarmRate"] == 0.0
    assert by_category["faithfulness"]["retrievalHarmRate"] == 1.0
    assert by_category["faithfulness"]["retrievalHelpRate"] == 0.0


def test_estimate_tau_from_repeated_scores() -> None:
    # 흔들림이 없으면 judge 점수의 최소 눈금이 하한이 된다.
    assert estimate_tau([[4.0, 4.0, 4.0]]) == 0.25

    # 흔들림이 크면 임계값이 그만큼 올라간다.
    noisy = estimate_tau([[3.0, 4.0, 5.0]], sigma_multiplier=2.0)
    assert noisy == 2.0

    # 반복이 1회뿐이면 표준편차를 낼 수 없어 하한을 쓴다.
    assert estimate_tau([[4.0]]) == 0.25
    assert estimate_tau([]) == 0.25


def test_utility_recovery_uses_evidence_sensitive_items() -> None:
    records = [
        {
            # 오라클 +2.0 중 +1.0 회수 → 0.5
            "baseline": make_evaluation(2.0),
            "retrieval": make_evaluation(3.0),
            "oracle": make_evaluation(4.0),
        },
        {
            # 오라클이 이득을 주지 못하므로 집계에서 제외된다.
            "baseline": make_evaluation(4.0),
            "retrieval": make_evaluation(2.0),
            "oracle": make_evaluation(4.0),
        },
    ]

    recovery = calculate_utility_recovery(records)

    assert recovery["total"] == 2
    assert recovery["evidenceSensitiveCount"] == 1
    assert abs(recovery["utilityRecovery"] - 0.5) < 1e-6

    # 검색이 오히려 점수를 깎으면 회수율은 음수이고 −1로 잘린다.
    harmful = calculate_utility_recovery([
        {
            "baseline": make_evaluation(3.0),
            "retrieval": make_evaluation(0.0),
            "oracle": make_evaluation(4.0),
        }
    ])
    assert harmful["utilityRecovery"] == -1.0

    assert calculate_utility_recovery([])["utilityRecovery"] is None


def test_distract_rescue_rates() -> None:
    records = [
        {
            # 검색이 맞던 mode 판정을 깨뜨림
            "item": {"expected_mode": "improve"},
            "baseline": make_evaluation(4.0, mode="improve"),
            "retrieval": make_evaluation(4.0, mode="ask"),
        },
        {
            # 검색이 틀린 판정을 살림
            "item": {"expected_mode": "ask"},
            "baseline": make_evaluation(4.0, mode="improve"),
            "retrieval": make_evaluation(4.0, mode="ask"),
        },
        {
            "item": {"expected_mode": "improve"},
            "baseline": make_evaluation(4.0, mode="improve"),
            "retrieval": make_evaluation(4.0, mode="improve"),
        },
        {
            # expected_mode가 없으면 비교 대상에서 빠진다.
            "item": {},
            "baseline": make_evaluation(4.0, mode="improve"),
            "retrieval": make_evaluation(4.0, mode="ask"),
        },
    ]

    rates = calculate_distract_rescue_rates(records)

    assert rates["comparable"] == 3
    assert abs(rates["distractRate"] - 1 / 3) < 1e-6
    assert abs(rates["rescueRate"] - 1 / 3) < 1e-6
    assert abs(rates["netRescueIndex"]) < 1e-6

    assert calculate_distract_rescue_rates([])["distractRate"] is None


def test_override_contexts_injects_oracle_evidence() -> None:
    """오라클 조건은 검색 대신 정답 근거를 그대로 주입한다."""
    search_calls = []
    generation_calls = []

    class CountingRetriever:
        def search(self, **kwargs):
            search_calls.append(kwargs["collection_name"])
            return []

    kwargs = make_evaluation_item_kwargs(
        {"mode": "improve", "answer": "완료", "improved_prompt": "개선안"},
        generation_calls=generation_calls,
    )
    kwargs["retriever"] = CountingRetriever()

    gold = [
        {
            "document": "대상 독자를 명시한다.",
            "metadata": {"technique": "Audience Prompting"},
        }
    ]

    result = run_evaluation_item(
        item={"query": "보고서를 작성해줘", "history": []},
        override_contexts=gold,
        **kwargs,
    )

    assert search_calls == []
    assert result["techniqueNames"] == ["Audience Prompting"]
    assert generation_calls[0]["contexts"] == gold

    # 주입한 리스트를 나중에 바꿔도 결과가 흔들리지 않는다.
    gold[0]["document"] = "변경됨"
    assert result["retrieved"][0]["document"] == "대상 독자를 명시한다."

    try:
        run_evaluation_item(
            item={"query": "보고서를 작성해줘", "history": []},
            override_contexts=gold,
            use_retrieval=False,
            **make_evaluation_item_kwargs({"mode": "improve", "answer": "완료"}),
        )
    except ValueError as error:
        assert "override_contexts" in str(error)
    else:
        raise AssertionError("모순된 조건은 거부되어야 합니다.")


def test_dataset_has_gold_techniques_for_oracle_condition() -> None:
    dataset = load_dataset("eval/multi_turn_set.json")

    for item in dataset["items"]:
        gold = item.get("gold_techniques")
        assert isinstance(gold, list) and gold, item["id"]
        assert all(isinstance(name, str) and name for name in gold), item["id"]
        assert len(set(gold)) == len(gold), item["id"]


def test_generation_is_retried_on_transient_error() -> None:
    """생성 호출도 일시적 오류에 재시도한다(Gemini 503 등)."""
    attempts = 0
    delays = []

    class GeminiServerError(Exception):
        # google-genai 예외는 status_code가 아니라 code를 쓴다.
        code = 503

    kwargs = make_evaluation_item_kwargs({"mode": "improve", "answer": "완료"})

    def flaky_run_generation(query, contexts, model, history):
        nonlocal attempts
        attempts += 1

        if attempts < 3:
            raise GeminiServerError("high demand")

        return {"mode": "improve", "answer": "완료", "improved_prompt": "개선안"}

    kwargs["run_generation"] = flaky_run_generation

    result = run_evaluation_item(
        item={"query": "보고서를 작성해줘", "history": []},
        generation_sleep_fn=delays.append,
        **kwargs,
    )

    assert attempts == 3
    assert delays == [2.0, 4.0]
    assert result["generation"]["improved_prompt"] == "개선안"

    assert get_error_status_code(GeminiServerError("high demand")) == 503
    assert is_retryable_generation_error(GeminiServerError("high demand"))


def run_tests() -> None:
    tests = [
        test_cache_key_changes_with_history,
        test_same_input_produces_same_cache_key,
        test_must_include_rate,
        test_must_not_include_detection,
        test_average_excludes_null_and_non_numeric_values,
        test_expected_mode_accuracy,
        test_dataset_roles_content_ids_and_categories,
        test_dataset_json_round_trip,
        test_generation_uses_history_without_mutating_dataset,
        test_generation_result_normalization_and_technique_names,
        test_retrieval_matches_operating_defaults,
        test_retrieval_uses_hyde_only_when_enabled,
        test_example_search_failure_does_not_stop_retrieval,
        test_cache_key_changes_with_examples_and_analyzer_settings,
        test_context_identifier_is_stable,
        test_run_evaluation_item_generates_and_saves_cache,
        test_run_evaluation_item_reuses_cached_generation,
        test_cached_generation_is_returned_as_copy,
        test_retry_succeeds_after_rate_limit,
        test_non_retryable_error_is_raised_immediately,
        test_judge_prompt_contains_history_and_generation,
        test_parse_judge_json_accepts_markdown_fence,
        test_normalize_judge_result_calculates_average,
        test_normalize_judge_result_rejects_invalid_response,
        test_judge_prompt_uses_production_generation_shape,
        test_judge_cache_key_is_deterministic,
        test_judge_cache_key_changes_with_inputs,
        test_judge_evaluation_calls_judge_on_cache_miss,
        test_judge_evaluation_reuses_cache_on_second_run,
        test_judge_evaluation_caches_invalid_response,
        test_judge_evaluation_saves_cache_file,
        test_judge_retry_waits_and_succeeds,
        test_judge_non_retryable_error_is_raised_immediately,
        test_run_evaluation_item_attaches_judge_result,
        test_run_evaluation_item_without_judge_keeps_original_shape,
        test_generation_cache_and_judge_cache_are_independent,
        test_retrieval_can_be_disabled_for_baseline,
        test_retrieval_cache_freezes_search_results,
        test_retrieval_effect_rates_classify_help_harm_neutral,
        test_retrieval_effect_rates_split_by_category,
        test_estimate_tau_from_repeated_scores,
        test_utility_recovery_uses_evidence_sensitive_items,
        test_distract_rescue_rates,
        test_override_contexts_injects_oracle_evidence,
        test_dataset_has_gold_techniques_for_oracle_condition,
        test_generation_is_retried_on_transient_error,
    ]

    for test in tests:
        test()
        print(f"PASS: {test.__name__}")

    print(f"\n전체 {len(tests)}개 테스트 통과")


if __name__ == "__main__":
    run_tests()
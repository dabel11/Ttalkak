"""multi_turn_eval의 비LLM 단위 테스트."""

import json
import tempfile
from pathlib import Path

from eval.multi_turn_eval import (
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
)


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
    ]

    for test in tests:
        test()
        print(f"PASS: {test.__name__}")

    print(f"\n전체 {len(tests)}개 테스트 통과")


if __name__ == "__main__":
    run_tests()
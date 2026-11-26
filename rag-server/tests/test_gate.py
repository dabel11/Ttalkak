from app.core.gate import select_examples


def test_first_turn_uses_only_confident_examples():
    weak, strong = {"score": 0.50}, {"score": 0.53}
    assert select_examples([weak, strong], [], 0.53) == [strong]
    assert select_examples([weak], [], 0.53) == []
    assert select_examples([weak], [{"role": "user"}], 0.53) == [weak]
    assert select_examples([weak], [], 0) == [weak]


def test_rag_status_counts_examples_as_evidence():
    """기법 0건이어도 예시가 있으면 ok — 예전엔 백엔드가 sources(기법)만 보고 no_evidence 로 표시했다."""
    from app.core.gate import rag_status
    assert rag_status([], [{"score": 0.6}]) == "ok"
    assert rag_status([{"score": 0.5}], []) == "ok"
    assert rag_status([], []) == "no_evidence"


def test_unfamiliar_requests_do_not_require_retrieval_matches():
    from app.core.gate import is_noise_only
    for query in ["빙하 코어 층별 기포 관찰 기록지", "점자 악보 전사", "Design a lunar regolith sampler"]:
        assert not is_noise_only(query)
    for query in ["", "ㅋㅋㅋㅋ", "!!", "123456", "https://example.com", "asdfasdf", "안녕하세요!"]:
        assert is_noise_only(query)

"""ingestion/gen_request_views 의 파싱·정제 규칙 (LLM 호출 없음)."""

from ingestion.gen_request_views import clean_requests, parse_batch

CARD = {
    "id": "pdf_001",
    "technique": "Role Prompting",
    "document": "Technique: Role Prompting\nDefinition: 모델에게 특정 전문가 역할을 부여한다.",
}


def test_parse_batch_keeps_only_cards_with_requests():
    raw = '{"cards": [{"id": "pdf_001", "requests": ["a", " ", "b"]}, {"id": "pdf_002", "requests": []}]}'
    assert parse_batch(raw) == {"pdf_001": ["a", "b"]}


def test_parse_batch_tolerates_broken_output():
    assert parse_batch("not json") == {}
    assert parse_batch('["cards"]') == {}
    assert parse_batch('{"cards": ["x", {"requests": ["q"]}]}') == {}


def test_clean_requests_drops_technique_name():
    kept = clean_requests(["role 을 정해서 리뷰해줘", "자기소개서 써줘"], CARD)
    assert [k["q"] for k in kept] == ["자기소개서 써줘"]


def test_clean_requests_drops_high_leak():
    # 질의 토큰 전부가 카드에 있는 문장 — 표면 일치로만 맞는다
    kept = clean_requests(["특정 전문가 역할을 부여한다", "택배비 합계 계산해줘"], CARD)
    assert [k["q"] for k in kept] == ["택배비 합계 계산해줘"]
    assert kept[0]["leak"] == 0.0

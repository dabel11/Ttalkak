"""
tests/test_analyzer.py
────────────────────────────────────────────────────────────
1단계 요청 분석기의 계약 테스트. LLM·DB 없이 돈다 — Groq 호출은 가짜 클라이언트로
바꿔치기하고, `_sanitize` 는 순수 함수라 그대로 부른다.

여기서 지키는 계약 두 가지:
  A. `analyze()` 의 None 은 '분석 실패' 하나만 뜻한다. 필드가 비어도 축이 있으면
     dict 를 돌려준다(축 라우팅의 입력이 사라지면 안 된다).
  D. 방어 규칙(`_sanitize`)이 모델 출력을 고치면 조용히 버리지 않고 카운터에 남긴다.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.rag import analyzer  # noqa: E402


# ── 테스트용 가짜 Groq 클라이언트 ───────────────────────────
class _FakeMessage:
    def __init__(self, content): self.content = content


class _FakeChoice:
    def __init__(self, content): self.message = _FakeMessage(content)


class _FakeResponse:
    def __init__(self, content): self.choices = [_FakeChoice(content)]


class _FakeClient:
    """`client.chat.completions.create(...)` 만 흉내낸다."""
    def __init__(self, payload): self._payload = payload

    @property
    def chat(self): return self

    @property
    def completions(self): return self

    def create(self, **_kwargs):
        return _FakeResponse(json.dumps(self._payload, ensure_ascii=False))


def _analyze_with(payload: dict, query: str = "블로그 글 써줘") -> dict | None:
    """가짜 응답을 물린 채 analyze() 를 돌린다."""
    original = analyzer._get_client
    analyzer._get_client = lambda: _FakeClient(payload)
    try:
        return analyzer.analyze(query)
    finally:
        analyzer._get_client = original


# ── A. None 의 의미 ─────────────────────────────────────────
def test_axes_survive_when_fields_are_empty() -> None:
    """필드가 전부 정제로 날아가도 축이 있으면 분석 결과를 잃지 않는다.

    종전에는 `if not fields: return None` 이라 축까지 함께 폐기됐다 — 축 라우팅이
    배선되면 조회 경로가 통째로 죽는 자리다."""
    result = _analyze_with({
        "taskType": "글쓰기",
        # 전부 만능 필드(_JUNK) → _sanitize 가 모두 제거한다
        "fields": [{"name": "포함 핵심내용", "role": "required", "status": "empty",
                    "value": None}],
        "techniqueAxes": ["tone_style", "length_control"],
    })

    assert result is not None, "축이 있는데 None 을 돌려주면 축 라우팅 입력이 사라진다"
    assert result["fields"] == []
    assert result["techniqueAxes"] == ["tone_style", "length_control"]


def test_none_only_when_nothing_survives() -> None:
    """필드도 축도 없으면 그때만 '분석 실패'다."""
    assert _analyze_with({"taskType": "글쓰기", "fields": [], "techniqueAxes": []}) is None
    # 어휘 밖 축은 normalize_axes 가 버리므로 결과적으로 산출물 전무 → None
    assert _analyze_with({"taskType": "글쓰기", "fields": [],
                          "techniqueAxes": ["made_up_axis"]}) is None


def test_fields_only_still_works() -> None:
    """축이 비어도 필드가 있으면 종전과 동일하게 동작한다(무회귀)."""
    result = _analyze_with({
        "taskType": "글쓰기",
        "fields": [{"name": "주제", "role": "required", "status": "filled",
                    "value": "제주도 여행"}],
        "techniqueAxes": [],
    })
    assert result is not None
    assert result["techniqueAxes"] == []
    assert result["fields"][0]["value"] == "제주도 여행"


def test_analysis_failure_still_returns_none() -> None:
    """클라이언트가 없으면(키 미설정) 종전대로 None."""
    original = analyzer._get_client
    analyzer._get_client = lambda: None
    try:
        assert analyzer.analyze("블로그 글 써줘") is None
    finally:
        analyzer._get_client = original


def test_empty_fields_render_same_as_no_analysis() -> None:
    """빈 fields 분석 결과는 생성기에서 analysis=None 과 똑같이 취급된다.

    A 수정이 생성 경로에 회귀를 내지 않는다는 근거. 이 등가성이 깨지면
    '축만 있는 분석'이 생성 프롬프트를 바꿔버린다."""
    from app.rag.generator import build_analysis_block
    axes_only = {"taskType": "글쓰기", "fields": [], "techniqueAxes": ["tone_style"]}
    assert build_analysis_block(axes_only) == build_analysis_block(None) == ""


# ── D. 방어 규칙의 관측 가능성 ──────────────────────────────
def test_sanitize_records_every_correction() -> None:
    """규칙이 발동하면 규칙명별로 카운트된다 — 현 모델에서 각 방어가 실제로
    쓰이는지 판정할 유일한 창이다."""
    analyzer.reset_sanitize_stats()
    analyzer._sanitize([
        {"name": "포함 내용", "role": "required", "status": "empty"},      # junk
        {"name": "이메일", "role": "required", "status": "empty"},          # task_word
        {"name": "톤", "role": "required", "status": "empty"},              # framing_coerced
        {"name": "분위기", "role": "잘못된값", "status": "empty"},           # role_unknown
        "문자열",                                                            # not_dict
    ])
    stats = analyzer.sanitize_stats()
    assert stats["junk"] == 1
    assert stats["task_word"] == 1
    assert stats["framing_coerced"] == 1
    assert stats["role_unknown"] == 1
    assert stats["not_dict"] == 1


def test_sanitize_does_not_record_when_nothing_corrected() -> None:
    """깨끗한 출력에는 카운터가 안 올라간다 — 0 이면 '그 규칙은 제거 후보'라는
    신호로 읽을 수 있어야 하므로, 오탐이 있으면 안 된다."""
    analyzer.reset_sanitize_stats()
    out = analyzer._sanitize([
        {"name": "주제", "role": "required", "status": "filled", "value": "제주도"},
        {"name": "톤", "role": "framing", "status": "empty"},   # 이미 framing → 교정 아님
    ])
    assert analyzer.sanitize_stats() == {}
    assert len(out) == 2


def test_required_cap_is_recorded() -> None:
    """required 상한 강등도 관측 대상이다(mode 판정에 직접 영향)."""
    analyzer.reset_sanitize_stats()
    out = analyzer._sanitize([
        {"name": "주제", "role": "required", "status": "filled", "value": "a"},
        {"name": "용건", "role": "required", "status": "filled", "value": "b"},
        {"name": "지원 직무", "role": "required", "status": "empty"},
    ])
    assert analyzer.sanitize_stats()["required_over_cap"] == 1
    assert [f["role"] for f in out] == ["required", "required", "fact"]


def test_sanitize_behavior_unchanged() -> None:
    """관측을 붙였을 뿐 정제 동작 자체는 종전과 같다(무회귀)."""
    out = analyzer._sanitize([
        {"name": "포함 핵심내용", "role": "required", "status": "empty"},
        {"name": "블로그", "role": "required", "status": "empty"},
        {"name": "대상 독자", "role": "required", "status": "empty"},
        {"name": "주제", "role": "required", "status": "filled", "value": "제주도"},
        {"name": "", "role": "fact", "status": "empty"},
    ])
    assert [f["name"] for f in out] == ["대상 독자", "주제"]
    assert out[0]["role"] == "framing"      # 독자 → 항상 framing
    assert out[1]["status"] == "filled"


def run_tests() -> None:
    tests = [
        test_axes_survive_when_fields_are_empty,
        test_none_only_when_nothing_survives,
        test_fields_only_still_works,
        test_analysis_failure_still_returns_none,
        test_empty_fields_render_same_as_no_analysis,
        test_sanitize_records_every_correction,
        test_sanitize_does_not_record_when_nothing_corrected,
        test_required_cap_is_recorded,
        test_sanitize_behavior_unchanged,
    ]
    for test in tests:
        test()
        print(f"PASS: {test.__name__}")
    print(f"\n전체 {len(tests)}개 테스트 통과")


if __name__ == "__main__":
    run_tests()

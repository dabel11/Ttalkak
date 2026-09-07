"""
views.py
────────────────────────────────────────────────────────────
검색용 문서 뷰 (멀티표현 인덱싱).

기법 카드를 **전문 그대로** 임베딩하면 영문 필드명(`Technique:`/`Use When:` …)과
프롬프트 템플릿·예시가 신호를 희석한다. 정작 사용자 요청과 맞아야 하는 부분은
`Definition`/`Use When` 인데, 카드 327자 중 그 둘은 100자가 안 된다.

그래서 같은 카드를 **'이름 + 정의 + 언제 쓰나'로 줄인 뷰**로도 한 번 더 임베딩해
두고, 검색 때 두 벡터 중 높은 쪽을 쓴다(max 풀링). 카드를 고치지도, 생성기에
주는 텍스트(document)를 바꾸지도 않는다 — **검색용 벡터만 추가**된다.

실측 (qa_set_realistic 59문항 · prompt_techniques 170 · dense 단독, 2026-08-09):
    | 인덱싱 뷰            | Hit@1 | R@5   | NDCG@5 |
    | 전체 카드(종전)       | 0.576 | 0.709 | 0.634  |
    | 축약뷰 단독           | 0.644 | 0.706 | 0.650  |
    | **전체 ∪ 축약(채택)** | 0.644 | 0.723 | 0.666  |

축약뷰 '단독'이 아니라 '합집합'인 이유: 축약뷰는 Hit@1(정확한 1위)에 강하지만
템플릿·예시에만 있는 단서를 잃어 R@5가 소폭 내려간다. 둘을 함께 두면 각자의
강점만 취한다. `Use When` 만 남기는 뷰는 30자로 너무 짧아 급락(R@5 0.299) — 이름과
정의가 앵커 역할을 한다.

뷰를 못 만들면(형식이 다른 카드) 빈 리스트를 돌려준다 → 그 카드는 종전과 동일하게
본문 벡터 하나만 갖는다(무회귀).
"""

import re

# `Use When: ...` 을 다음 필드명(`Avoid When:` 등) 직전까지 캡처
_FIELD_RE_CACHE: dict[str, re.Pattern] = {}
_TECHNIQUE_RE = re.compile(r"^Technique:\s*(.+)$", re.MULTILINE)


def _field(document: str, name: str) -> str:
    """`이름: 값` 형태의 카드 필드를 뽑는다. 없으면 빈 문자열."""
    pattern = _FIELD_RE_CACHE.get(name)
    if pattern is None:
        pattern = re.compile(
            rf"^{re.escape(name)}:\s*(.+?)(?=\n[A-Z][a-zA-Z ]*:|\Z)",
            re.MULTILINE | re.DOTALL,
        )
        _FIELD_RE_CACHE[name] = pattern
    m = pattern.search(document)
    return m.group(1).strip() if m else ""


def _technique_name(document: str) -> str:
    """카드의 기법명. `Technique:` 이 없으면 첫 줄(`[Chunk 001] Role Prompting`)."""
    m = _TECHNIQUE_RE.search(document)
    return m.group(1).strip() if m else document.split("\n", 1)[0].strip()


def technique_views(document: str) -> list[str]:
    """기법 카드의 축약 검색뷰: 이름 + 정의 + 언제 쓰나."""
    definition = _field(document, "Definition")
    use_when   = _field(document, "Use When")
    if not (definition or use_when):
        return []                      # 형식이 다른 문서 — 본문 벡터만 쓴다
    name = _technique_name(document)
    return ["\n".join(p for p in (name, definition, use_when) if p)]


# 컬렉션별 뷰 빌더. 등록되지 않은 컬렉션은 뷰 없음(종전 동작).
_BUILDERS = {
    "prompt_techniques": technique_views,
}


def build_search_views(document: str, collection_name: str) -> list[str]:
    """컬렉션에 맞는 검색용 추가 뷰 텍스트 목록. 없으면 []."""
    builder = _BUILDERS.get(collection_name)
    if builder is None:
        return []
    try:
        return [v for v in builder(document) if v and v.strip()]
    except Exception as e:                       # 뷰 생성 실패가 인덱싱을 막지 않게
        print(f"[Views] 뷰 생성 실패 → 본문 벡터만 사용: {e}")
        return []

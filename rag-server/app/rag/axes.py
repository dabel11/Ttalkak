"""
axes.py
────────────────────────────────────────────────────────────
기법 축(technique axes) — 유사도 검색을 대체할 통제 어휘.

배경(WORKLOG 2026-08-15 「검색 구조 정밀 진단」):
  사용자 요청으로 기법 카드를 유사도 검색하면 원리적으로 맞지 않는다.
  질의↔카드 최대 유사도(0.586)가 카드↔카드 평균(0.677)보다 낮고, 리랭커는
  실제 요청에 로짓 0.0000(무관 질의와 동점)을 낸다. 유사도가 답하는 질문은
  "이 둘이 같은 것에 대한 텍스트인가"인데, 필요한 건 "이 요청의 결핍을
  이 기법이 메우는가" — 증상↔처방 관계라 닮을 이유가 없다.

해법: 판단(analyzer)이 축을 고르고, 축으로 카드를 **조회**한다.
  요청 ──판단──> 축 ──태그 매칭──> 카드 후보 ──임베딩 순위──> top-k
  임베딩은 버리지 않는다. 같은 축 안의 카드끼리는 같은 종류의 텍스트라
  유사도가 의미를 갖는다(질의↔카드의 공간 분리 문제가 없다).

★ 축을 정하는 기준 — 카드의 `Prompt Template`
  카드에 축 이름이 적혀 있지는 않다. 대신 모든 카드에는 그 기법이 개선
  프롬프트에 **실제로 추가하는 지시문**(`Prompt Template`)이 있다.
  축은 그 지시문의 '종류'다.
    "다음 조건을 반드시 지켜라: [조건 목록]"      → constraints
    "답변은 {글자수} 내외로 작성하세요"            → length_control
    "근거가 부족하면 '자료 부족'이라고 말하라"      → uncertainty
  Definition 은 추상적이고 Use When 은 상황이지만, Prompt Template 은
  결과물이라 판정이 흔들리지 않는다.

  analyzer 쪽도 같은 언어를 쓴다 — "이 요청은 어떤 종류의 지시문이 필요한가".
  양쪽이 '지시문 종류'로 만나는 것이 이 설계의 연결점이다.

★ 경계 결정 — '빈칸'은 구조(output_format)와 유보(uncertainty)로 **분리한다**
  (2026-08-17 결정). 파일럿에서 이 둘이 갈렸다.
    output_format : 재사용 템플릿의 변수 슬롯을 '두는' 기법
                    (Variable Slot Prompting, Template Filling Prompting)
    uncertainty   : 근거가 없을 때 '지어내지 않는' 기법
                    (Abstention, Missing Information Detection, Give the Model an Out)
  트리거가 다르다 — 앞은 템플릿 요청, 뒤는 정보 부족이다. 딸깍의 `[항목명 입력]`
  요청은 둘 다 필요할 수 있고, analyzer 가 축을 최대 3개 고를 수 있으므로
  분리해도 함께 회수된다.

⚠️ 어휘를 바꾸면 카드 170장을 다시 태깅해야 한다. 가장 비싼 결정이므로
   변경 시 `AXES_VERSION` 을 올리고 재태깅 여부를 명시할 것.
"""

from typing import Any


AXES_VERSION = "v1"

# 축당 카드 수가 이보다 적으면 조회가 굶는다(인접 축 확장 필요).
MIN_CARDS_PER_AXIS = 3

# analyzer 가 한 요청에 고를 수 있는 최대 축 수.
# 많이 고르면 후보가 넓어져 지금의 '아무거나 5장'으로 회귀한다.
MAX_AXES_PER_REQUEST = 3

# 카드 하나에 붙일 수 있는 최대 축 수.
MAX_AXES_PER_CARD = 3


# 축 이름 → (요청 쪽 설명, 카드 쪽 설명)
#   요청 쪽: analyzer 가 "이 요청에 이게 필요한가"를 판정할 때 읽는다.
#   카드 쪽: 태깅할 때 "이 카드가 이 지시문을 추가하는가"를 판정할 때 읽는다.
TECHNIQUE_AXES: dict[str, dict[str, str]] = {
    "role_assignment": {
        "request": "누구의 관점·전문성으로 쓸지가 결과를 좌우하는 요청",
        "card": "'너는 [역할]이다' 류의 역할·정체성 부여 지시문을 추가한다",
    },
    "output_format": {
        "request": (
            "표·목록·JSON 등 산출물의 구조가 지정됐거나 필요한 요청. "
            "재사용 템플릿의 변수 슬롯([항목명 입력])을 두는 요청도 여기다"
        ),
        "card": (
            "출력의 구조·형식을 지정하거나 채워 넣을 변수 슬롯을 두는 "
            "지시문을 추가한다 (템플릿·플레이스홀더 포함)"
        ),
    },
    "length_control": {
        "request": "분량·개수가 지정된 요청 (N장, N줄, N자, N개)",
        "card": "분량·개수를 수치로 제한하는 지시문을 추가한다",
    },
    "tone_style": {
        "request": "말투·문체·독자 눈높이가 지정됐거나 필요한 요청",
        "card": "말투·문체·독자 수준을 지정하는 지시문을 추가한다",
    },
    "constraints": {
        "request": "반드시 포함하거나 절대 금지할 조건이 있는 요청",
        "card": "지켜야 할 조건 또는 금지 사항을 명시하는 지시문을 추가한다",
    },
    "decomposition": {
        "request": "여러 단계를 거쳐야 하거나 추론 과정이 필요한 요청",
        "card": "단계로 나누어 순차 수행·추론하게 하는 지시문을 추가한다",
    },
    "examples": {
        "request": "원하는 결과를 예시로 보여줘야 전달되는 요청",
        "card": "예시를 제시해 출력 형태를 학습시키는 지시문을 추가한다",
    },
    "grounding": {
        "request": "사용자가 준 원문·자료에 답을 묶어야 하는 요청",
        "card": "주어진 자료 안에서만 답하게 하거나 출처를 달게 하는 지시문을 추가한다",
    },
    "uncertainty": {
        "request": (
            "확정되지 않은 정보가 있어 지어내면 안 되는 요청. "
            "모를 때 답을 멈추고 되묻게 해야 하는 경우"
        ),
        "card": (
            "근거가 부족할 때 답을 유보하거나 되묻게 하는 지시문을 추가한다. "
            "빈칸을 '두는' 구조가 아니라 '지어내지 않는' 태도가 핵심이다"
        ),
    },
    "context_isolation": {
        "request": "이전 맥락이나 다른 주제가 섞이면 안 되는 요청",
        "card": "범위를 한정하거나 구분자로 대상을 격리하는 지시문을 추가한다",
    },
    "comparison": {
        "request": "둘 이상을 기준에 따라 비교·평가해야 하는 요청",
        "card": "비교 기준·평가 척도를 세워 대조하게 하는 지시문을 추가한다",
    },
    "extraction": {
        "request": "원문에서 특정 항목을 뽑아내거나 분류해야 하는 요청",
        "card": "원문에서 지정 항목을 추출·분류하게 하는 지시문을 추가한다",
    },
}

AXIS_NAMES: tuple[str, ...] = tuple(TECHNIQUE_AXES)


def normalize_axes(raw: Any, limit: int = MAX_AXES_PER_REQUEST) -> list[str]:
    """LLM이 뱉은 축 목록을 통제 어휘로 정규화한다.

    어휘에 없는 값·중복·대소문자·공백을 걷어내고 상한을 적용한다.
    정규화 후 비면 호출자는 기존 유사도 경로로 폴백한다(무회귀).
    """
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, (list, tuple)):
        return []

    seen: list[str] = []
    for value in raw:
        if not isinstance(value, str):
            continue
        name = value.strip().lower().replace("-", "_").replace(" ", "_")
        if name in TECHNIQUE_AXES and name not in seen:
            seen.append(name)

    return seen[:limit]


def build_axis_catalog(side: str) -> str:
    """축 목록을 프롬프트에 넣을 짧은 문자열로 만든다.

    ⚠️ 축마다 긴 시나리오 예시를 쓰지 않는다. analyzer 주석의 실측 경고 —
    8b는 긴 예시를 무관한 요청에도 복사한다(2026-07-30).
    """
    if side not in {"request", "card"}:
        raise ValueError("side는 'request' 또는 'card'여야 합니다.")

    return "\n".join(
        f"- {name}: {spec[side]}"
        for name, spec in TECHNIQUE_AXES.items()
    )


def get_card_axes(card: dict[str, Any]) -> list[str]:
    """카드 메타데이터에서 태깅된 축을 꺼낸다(미태깅이면 빈 리스트)."""
    metadata = card.get("metadata")
    metadata = metadata if isinstance(metadata, dict) else {}
    return normalize_axes(metadata.get("axes"), limit=MAX_AXES_PER_CARD)


def filter_cards_by_axes(
    cards: list[dict[str, Any]],
    axes: list[str],
) -> list[dict[str, Any]]:
    """요청 축과 하나라도 겹치는 카드만 남긴다.

    겹치는 축 수가 많은 카드를 앞에 둔다. 같은 수면 원래 순서(임베딩 순위)를
    유지한다 — 축 안에서의 순위는 임베딩이 정하는 게 맞다.
    """
    wanted = set(normalize_axes(axes, limit=MAX_AXES_PER_REQUEST))
    if not wanted:
        return []

    scored = []
    for index, card in enumerate(cards):
        overlap = len(wanted & set(get_card_axes(card)))
        if overlap:
            scored.append((-overlap, index, card))

    return [card for _, _, card in sorted(scored, key=lambda x: (x[0], x[1]))]


def summarize_axis_coverage(cards: list[dict[str, Any]]) -> dict[str, Any]:
    """태깅 상태 점검 — 축당 카드 수와 미태깅 수.

    축이 MIN_CARDS_PER_AXIS 미만이면 조회가 굶으므로 어휘를 재검토해야 한다.
    """
    counts = {name: 0 for name in AXIS_NAMES}
    untagged = 0
    multi = 0

    for card in cards:
        axes = get_card_axes(card)
        if not axes:
            untagged += 1
            continue
        if len(axes) > 1:
            multi += 1
        for name in axes:
            counts[name] += 1

    return {
        "axesVersion": AXES_VERSION,
        "totalCards": len(cards),
        "untagged": untagged,
        "multiAxisCards": multi,
        "counts": counts,
        "starvedAxes": sorted(
            name for name, count in counts.items() if count < MIN_CARDS_PER_AXIS
        ),
    }

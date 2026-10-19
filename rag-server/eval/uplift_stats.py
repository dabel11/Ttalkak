"""
eval/uplift_stats.py
────────────────────────────────────────────────────────────
결과 상향 채점기의 통계 — 순수 함수(LLM·DB 없음).

비교 단위는 **문항**이다. 같은 문항의 두 조건(예: raw·딸각)을 짝지어 차이를 내고,
문항을 다시 뽑는 부트스트랩으로 평균 차이의 95% 신뢰구간을 낸다. 승/패는 부호 검정.
"""

import math
import random


def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float] | None:
    """비율 k/n 의 Wilson 95% 신뢰구간."""
    if n == 0:
        return None
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def sign_test_p(wins: int, losses: int) -> float | None:
    """양측 부호 검정 p값(무승부 제외). 승·패가 없으면 None."""
    n = wins + losses
    if n == 0:
        return None
    k = min(wins, losses)
    tail = sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n
    return min(1.0, 2 * tail)


def bootstrap_ci(diffs: list[float], n_boot: int = 4000, seed: int = 0,
                 alpha: float = 0.05) -> tuple[float, float] | None:
    """문항별 차이의 평균에 대한 퍼센타일 부트스트랩 신뢰구간(시드 고정 — 같은 입력이면 같은 구간)."""
    diffs = [d for d in diffs if d is not None]
    if len(diffs) < 2:
        return None
    rng = random.Random(seed)
    n = len(diffs)
    means = sorted(sum(rng.choice(diffs) for _ in range(n)) / n for _ in range(n_boot))
    lo = means[int(alpha / 2 * n_boot)]
    hi = means[int((1 - alpha / 2) * n_boot) - 1]
    return (lo, hi)


def paired(a: dict, b: dict, eps: float = 1e-9) -> dict:
    """문항별 값 a·b({문항: 값}) → b−a 차이 요약. 한쪽이라도 None 인 문항은 뺀다."""
    keys = [k for k in a if k in b and a[k] is not None and b[k] is not None]
    diffs = [b[k] - a[k] for k in keys]
    wins = sum(d > eps for d in diffs)
    losses = sum(d < -eps for d in diffs)
    return {
        "n": len(keys),
        "mean_a": mean([a[k] for k in keys]),
        "mean_b": mean([b[k] for k in keys]),
        "mean_diff": mean(diffs),
        "ci95": bootstrap_ci(diffs),
        "wins": wins, "ties": len(diffs) - wins - losses, "losses": losses,
        "sign_p": sign_test_p(wins, losses),
    }


def within_spread(per_repeat: dict[str, list[float]]) -> float | None:
    """같은 조건 안에서 반복 간 흔들림 — 문항별 (최대−최소)의 평균.
    이 값이 조건 간 차이보다 크면 차이를 믿을 수 없다."""
    spreads = []
    for vals in per_repeat.values():
        vals = [v for v in vals if v is not None]
        if len(vals) >= 2:
            spreads.append(max(vals) - min(vals))
    return mean(spreads)


def cohen_kappa(a: list[str], b: list[str]) -> float | None:
    """두 사람(또는 사람·판정기)의 일치도 κ. 우연히 맞을 확률을 뺀 값 — 0.6 이상이면 '질문이 명확하다'로 본다.
    답이 한 종류뿐이면(모두 yes 등) 정의되지 않아 None."""
    pairs = [(x, y) for x, y in zip(a, b) if x and y]
    if not pairs:
        return None
    labels = sorted({v for p in pairs for v in p})
    if len(labels) < 2:
        return None
    n = len(pairs)
    po = sum(x == y for x, y in pairs) / n
    pe = sum((sum(x == l for x, _ in pairs) / n) * (sum(y == l for _, y in pairs) / n) for l in labels)
    return None if pe == 1 else (po - pe) / (1 - pe)

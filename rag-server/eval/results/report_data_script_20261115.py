"""심사·발표용 보고서 숫자·차트 — 최종 측정(v7 대 v10)에서 다시 계산. (rag-server 에서, PYTHONPATH=.)"""
import json
from collections import Counter
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import Patch

OUT = Path(__file__).parent
R = Path("eval/results")
S = json.loads((R / "final_v10_summary_20261115.json").read_text(encoding="utf-8"))
items = {it["id"]: it for it in json.loads(Path("eval/uplift_set_v2.json").read_text(encoding="utf-8"))["items"]}
font_manager.fontManager.addfont("/System/Library/Fonts/AppleSDGothicNeo.ttc")
plt.rcParams.update({"font.family": "Apple SD Gothic Neo", "axes.unicode_minus": False, "font.size": 10})
TEAL, RUST, LIGHT, INK, MUTED = "#0F6E6E", "#B4552D", "#D9D6CF", "#1E2A2E", "#6B7478"

B = S["trackB"]
D = {"v7": B["v7"]["v2"], "v10": B["v10"]["v2"], "v7_v1": B["v7"]["v1"], "v10_v1": B["v10"]["v1"],
     "v7_both": B["v7"]["both"], "v10_both": B["v10"]["both"], "paired": S["paired"], "items": S["items"],
     "behavior": S["behavior"], "trackA": S["trackA"],
     "n_cells": {v: B[v]["n_cells"] for v in ("v7", "v10")}, "asked": {v: B[v]["asked_or_missing"] for v in ("v7", "v10")}}
# 행동 지표 비율
for v in ("v7", "v10"):
    D["behavior"][v]["caps_rate"] = D["behavior"][v]["count_caps_in_prompt"] / D["n_cells"][v]
    D["behavior"][v]["checklist_rate"] = D["behavior"][v]["checklist_outputs"] / D["n_cells"][v]
# 요청 이름(차트용)
per = S["items"]["per_item"]
label = lambda i: (lambda q: q[:16] + ("…" if len(q) > 16 else ""))(items[i]["query"].split("\n")[0].split(":")[0])
D["per_item"] = sorted([{"id": i, "q": label(i), "v7": v["v7"], "v10": v["v10"]} for i, v in per.items()],
                       key=lambda x: (x["v10"] - x["v7"], x["v10"]))
(OUT / "data2.json").write_text(json.dumps(D, ensure_ascii=False, indent=1, default=float), encoding="utf-8")


def style(ax):
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color(LIGHT)
    ax.tick_params(colors=MUTED, length=0)


# 차트 1 — v7 대 v10 승·무·패(사람에 가까운 판정기)
fig, ax = plt.subplots(figsize=(6.4, 2.2), dpi=200)
rows = [("v7 (이전)", D["v7"]), ("v10 (개선 후)", D["v10"])]
for i, (lab, s) in enumerate(rows[::-1]):
    left = 0
    for key, col, tc in (("W", TEAL, "white"), ("T", LIGHT, INK), ("L", RUST, "white")):
        w = s[key] / s["N"] * 100
        ax.barh(i, w, left=left, color=col, height=.6, edgecolor="white", lw=1.2)
        if w >= 7:
            ax.text(left + w / 2, i, f"{w:.0f}%", ha="center", va="center", color=tc, fontsize=10, fontweight="bold")
        left += w
    ax.text(101, i, f"n={s['N']}", va="center", color=MUTED, fontsize=8.5)
ax.set_yticks(range(len(rows)), [r[0] for r in rows[::-1]], fontsize=10)
ax.set_xlim(0, 108); ax.set_xticks([]); style(ax); ax.spines["bottom"].set_visible(False)
ax.legend(handles=[Patch(color=TEAL, label="딸깍이 더 좋음"), Patch(color=LIGHT, label="비슷함"), Patch(color=RUST, label="원래 요청이 더 좋음")],
          frameon=False, loc="upper center", ncol=3, bbox_to_anchor=(.45, 1.28), fontsize=9)
fig.tight_layout(); fig.savefig(OUT / "chart2_bars.png"); plt.close(fig)

# 차트 2 — 요청별 (승 − 패), v7 → v10
it = D["per_item"]
fig, ax = plt.subplots(figsize=(6.4, 4.6), dpi=200)
for i, x in enumerate(it):
    col = TEAL if x["v10"] > x["v7"] else (RUST if x["v10"] < x["v7"] else MUTED)
    ax.plot([x["v7"], x["v10"]], [i, i], color=LIGHT, lw=3, zorder=1)
    ax.scatter([x["v7"]], [i], color="white", edgecolor=MUTED, s=42, zorder=2)
    ax.scatter([x["v10"]], [i], color=col, s=48, zorder=3)
ax.axvline(0, color=INK, lw=.8)
ax.set_yticks(range(len(it)), [x["q"] for x in it], fontsize=8)
ax.set_xlim(-4.5, 4.5); ax.set_xticks([-4, -2, 0, 2, 4], ["원래 요청\n4번 모두 승", "", "동률", "", "딸깍\n4번 모두 승"], fontsize=8)
ax.grid(axis="x", color=LIGHT, lw=.6); style(ax)
ax.legend(handles=[plt.Line2D([], [], marker="o", ls="", markerfacecolor="white", markeredgecolor=MUTED, label="v7"),
                   plt.Line2D([], [], marker="o", ls="", color=TEAL, label="v10 (좋아짐)"),
                   plt.Line2D([], [], marker="o", ls="", color=RUST, label="v10 (나빠짐)"),
                   plt.Line2D([], [], marker="o", ls="", color=MUTED, label="변화 없음")],
          frameon=False, loc="upper center", ncol=4, bbox_to_anchor=(.4, 1.07), fontsize=8.5)
fig.tight_layout(); fig.savefig(OUT / "chart2_items.png"); plt.close(fig)
print(json.dumps({k: D[k] for k in ("v7", "v10", "items")}, ensure_ascii=False, default=float)[:900])
print([(x["q"], x["v7"], x["v10"]) for x in it])

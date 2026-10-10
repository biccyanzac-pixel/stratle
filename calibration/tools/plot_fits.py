"""Overlay plots: real answer distribution (grey bars) vs the fitted crowd model (blue line).

Published datasets -> docs/img/calibration/<id>.png (committed).
YouTube datasets   -> calibration/private/plots/<id>.png (git-ignored: calibration only).

Usage (from the repo root): python -I calibration/tools/plot_fits.py
"""
import json
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.ticker import MaxNLocator  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
DATA, MODEL = "#c3c2b7", "#2a78d6"


def load(*parts):
    path = os.path.join(ROOT, *parts)
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def smooth_bins(freq, lo, width):
    """Groups a per-number distribution into bins of `width` for readable bars on wide ranges."""
    xs, ys = [], []
    for start in range(0, len(freq), width):
        xs.append(lo + start + (width - 1) / 2)
        ys.append(sum(freq[start:start + width]) / width)
    return xs, ys


def option_labels(part):
    p = part["params"]
    if "labels" in p:
        return p["labels"]
    if "options" in p:
        return ["ABCDEF"[i] for i in range(len(p["options"]))]
    if "values" in p:
        return [str(v) for v in p["values"]]
    if part["template"] == "splitsteal":
        return ["Split", "Steal"]
    return None


def plot(ds, fit, out):
    model = fit["model"]
    lo, hi = model["min"], model["max"]
    span = hi - lo
    width = 1 if span <= 100 else 10
    fig, ax = plt.subplots(figsize=(7.2, 3.0), dpi=150)
    fig.patch.set_facecolor(SURFACE)
    ax.set_facecolor(SURFACE)

    if "freq" in ds:
        xs, ys = smooth_bins(ds["freq"], lo, width)
        ax.bar(xs, ys, width=width * 0.8, color=DATA, label="Real answers", zorder=2)
    elif "bins" in ds:
        for i, (a, b, share) in enumerate(ds["bins"]):
            ax.bar((a + b) / 2, share / (b - a + 1), width=(b - a + 1) * 0.94, color=DATA,
                   label="Real answers (binned)" if i == 0 else None, zorder=2)
    labels = option_labels(ds) if ds.get("template") in ("threshold", "common", "catch", "splitsteal") else None
    if labels:
        ax.scatter(range(len(model["w"])), model["w"], color=MODEL, s=36, label="Simulated crowd", zorder=3)
        ax.set_xticks(range(len(labels)), labels)
    else:
        mx, my = smooth_bins(model["w"], lo, width)
        ax.plot(mx, my, color=MODEL, linewidth=1.6, label="Simulated crowd", zorder=3)

    s = fit["settings"]
    title = f"{ds['label']}  (n = {ds['n']:,})"
    m = fit.get("metrics", {})
    sub = (f"τ {s['tau']:.2f} · noise {s['noise']} · theorists {s['eq']:.0%} · jokers {s['joker']:.0%} · "
           f"imagined crowd {s['sample'] or '∞'}   |   ")
    if labels is None and "modelMean" in m:
        sub += f"mean {m['modelMean']:.1f} vs {ds.get('reported', {}).get('mean', '–')}"
    if "w1" in m:
        sub += f" · W1 {m['w1']:.1f}% · TV {m['tv']:.2f}"
    elif "tv" in m:
        sub += f" · TV {m['tv']:.2f}"
    ax.set_title(title, loc="left", fontsize=10, color=INK, pad=16)
    ax.text(0, 1.02, sub, transform=ax.transAxes, fontsize=7, color=INK2)
    ax.set_xlim(lo - span * 0.01 - 0.5, hi + span * 0.01 + 0.5)
    if not labels:
        ax.xaxis.set_major_locator(MaxNLocator(integer=True))
    ax.set_ylabel("share per number" if width == 1 else f"share per number ({width}-wide bins)", fontsize=8, color=INK2)
    ax.tick_params(colors=INK2, labelsize=7, length=0)
    ax.grid(axis="y", color=GRID, linewidth=0.6, zorder=0)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(INK2)
    ax.legend(frameon=False, fontsize=7, labelcolor=INK2, loc="upper right")
    fig.tight_layout()
    fig.savefig(out, facecolor=SURFACE)
    plt.close(fig)


def main():
    fits = load("calibration", "fit.json")["datasets"]
    datasets = load("calibration", "datasets", "published.json") + load("calibration", "private", "youtube.json")
    pub_dir = os.path.join(ROOT, "docs", "img", "calibration")
    priv_dir = os.path.join(ROOT, "calibration", "private", "plots")
    os.makedirs(pub_dir, exist_ok=True)
    os.makedirs(priv_dir, exist_ok=True)
    for ds in datasets:
        if ds["id"] not in fits:
            continue
        out_dir = priv_dir if ds["id"].startswith("yt_") else pub_dir
        fit = fits[ds["id"]]
        if "parts" in ds:
            for i, (part, pfit) in enumerate(zip(ds["parts"], fit["parts"])):
                name = part["label"] if len(ds["parts"]) == 1 else f"{ds['label']}: {part['label']}"
                plot({**part, "label": name}, {**pfit, "settings": fit["settings"]},
                     os.path.join(out_dir, f"{ds['id']}_{i + 1}.png"))
            print("plotted", ds["id"], f"({len(ds['parts'])} parts) ->", os.path.relpath(out_dir, ROOT))
        elif "freq" in ds or "bins" in ds:
            plot(ds, fit, os.path.join(out_dir, f"{ds['id']}.png"))
            print("plotted", ds["id"], "->", os.path.relpath(out_dir, ROOT))


if __name__ == "__main__":
    main()

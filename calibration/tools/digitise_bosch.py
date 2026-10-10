"""Digitise Figure 1 of Bosch-Domènech et al. (2002): relative frequencies of choices 0..100 in the
Financial Times, Spektrum and Expansión newspaper experiments.

The figure is a raster image (white bars on black after extraction). Each panel's bar grid is anchored on
the measured centre columns of bar 1 and bar 100 (bar 0 is partly hidden by the frame, and Expansión has
no 0). Each bar's height above the baseline is the median over its 3 centre columns, converted to a
frequency with the y-axis labels (0.00 .. 0.14; 1 px is about 0.0007, i.e. one FT entry), then
renormalised to sum 1.
Checked against the paper's reported averages (18.91, 22.08, 25.47).

Usage: python -I calibration/tools/digitise_bosch.py <fig_p4.png> <out.json>
"""
import json
import sys

import numpy as np
import pymupdf

PANELS = {
    # name: (baseline row, y of label 0.00, y of label 0.14, x centre of bar 1, x centre of bar 100, n, mean)
    "ft": (321, 320.5, 126.5, 120.0, 780.0, 1468, 18.91),
    "spektrum": (805, 806.5, 600.0, 118.0, 775.0, 2729, 22.08),
    "expansion": (1292, 1295.5, 1083.5, 117.5, 774.0, 3696, 25.47),
}


def load(path):
    pix = pymupdf.Pixmap(path)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)


def column_heights(a, base):
    """Height in pixels of the ink run rising from just above the baseline, per column."""
    ink = a > 128
    h = np.zeros(a.shape[1], dtype=int)
    for x in range(a.shape[1]):
        y = base - 1
        while y > 0 and ink[y, x]:
            y -= 1
        h[x] = base - 1 - y
    return h


def digitise(a, base, y0, y14, c1, c100):
    pitch = (c100 - c1) / 99
    left = c1 - pitch
    h = column_heights(a, base)
    per_px = 0.14 / (y0 - y14)
    freqs = []
    for v in range(101):
        c = int(round(left + v * pitch))
        freqs.append(float(np.median(h[c - 1:c + 2])) * per_px)
    return np.array(freqs), left, pitch


def main(src, out):
    a = load(src)
    result = {}
    for name, (base, y0, y14, c1, c100, n, mean) in PANELS.items():
        f, left, pitch = digitise(a, base, y0, y14, c1, c100)
        raw_sum = f.sum()
        f = f / raw_sum
        est = float((f * np.arange(101)).sum())
        print(f"{name}: bar 0 at {left:.1f} pitch {pitch:.3f}, raw sum {raw_sum:.3f}, mean {est:.2f} vs reported {mean}")
        result[name] = {"n": n, "reported_mean": mean, "digitised_mean": round(est, 3),
                        "freq": [round(x, 5) for x in f]}
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=1)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

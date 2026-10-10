"""Digitise the NYT Upshot 2015 "guess 2/3 of the average" results chart (59,643 guesses, average 28,
winner 19), as reproduced by Wait But Why (NYTimes-Graph.png, 2220x1350).

Bars are light grey (the winner blue, the average dark grey) on white, ending 1 px above the baseline. The y-axis is linear: baseline
(0%) at row 1235 and gridlines every 1% (about 91.4 px). Bar v is centred at x = 115.5 + 19.94 v.
The bar at 33 runs off the top of the chart, so its value is 1 minus the sum of all the others.

Usage: python -I calibration/tools/digitise_nyt.py <NYTimes-Graph.png> <out.json>
"""
import json
import sys

import numpy as np
import pymupdf

BASE, ONE_PCT_ROW, NINE_PCT_ROW = 1235, 1144, 411.5
X0, PITCH = 115.5, 19.94
CLIPPED = 33


def main(src, out):
    pix = pymupdf.Pixmap(src)
    a = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, :3].astype(int)
    per_px = 0.08 / (ONE_PCT_ROW - NINE_PCT_ROW)  # 8 percentage points between the 1% and 9% gridlines
    freq = []
    for v in range(101):
        heights = []
        for x in range(int(round(X0 + v * PITCH)) - 2, int(round(X0 + v * PITCH)) + 3):
            y = BASE - 2  # bars stop 1 px above the black baseline
            while y > 0 and a[y, x].max() < 225:
                y -= 1
            heights.append(BASE - 2 - y)
        freq.append(float(np.median(heights)) * per_px)
    freq[CLIPPED] = 0.0
    freq[CLIPPED] = 1 - sum(freq)
    mean = sum(v * f for v, f in enumerate(freq))
    print(f"bar 33 inferred {freq[CLIPPED]:.4f}; mean {mean:.2f} (reported 28, rounded); 0:{freq[0]:.4f} 1:{freq[1]:.4f} 22:{freq[22]:.4f} 50:{freq[50]:.4f} 100:{freq[100]:.4f}")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump({"nyt2015": {"n": 59643, "reported_mean": 28, "reported_winner": 19,
                               "digitised_mean": round(mean, 3), "freq": [round(f, 5) for f in freq]}}, fh, indent=1)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

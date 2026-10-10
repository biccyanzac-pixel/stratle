"""Builds the calibration datasets from the downloaded sources in calibration/raw and calibration/private.

Writes:
  calibration/datasets/published.json   histograms and summaries from published sources (committed)
  calibration/private/youtube.json      histograms from the YouTube survey (git-ignored, never published)

Each dataset says which Stratle template and params reproduce its game, and has one of:
  freq     relative frequency of each whole number on the template's grid
  bins     [[lo, hi, share], ...] coarse bins (inclusive)
  mean     a reported mean only

Usage (from the repo root): python -I calibration/tools/build_datasets.py
"""
import collections
import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, "calibration", "raw")
PRIVATE = os.path.join(ROOT, "calibration", "private")

TWO_THIRDS = {"template": "target", "params": {"range": 100, "stat": "mean", "a": [2, 3], "b": 0}}

BOSCH = {
    "url": "https://www.aeaweb.org/articles?id=10.1257/000282802762024737",
    "pdf": "https://www.upf.edu/documents/8394861/8967210/boschetalAER2002.pdf/bd0a2012-563c-7db9-b36a-eff29cf50897",
    "citation": "Bosch-Domènech, Montalvo, Nagel & Satorra (2002), One, Two, (Three), Infinity, ...: Newspaper and Lab "
                "Beauty-Contest Experiments, American Economic Review 92(5): 1687-1701.",
    "terms": "Journal article © American Economic Association. Frequencies digitised from Figure 1 (and Figure 3 for the lab "
             "summary) for research use; the PDF is not redistributed.",
}


def load_json(*parts):
    with open(os.path.join(*parts), encoding="utf-8") as fh:
        return json.load(fh)


def hist(values, lo, hi):
    c = collections.Counter(values)
    n = len(values)
    return [c.get(v, 0) / n for v in range(lo, hi + 1)]


def numbers(rows, col, lo, hi):
    """Numeric answers in [lo, hi], decimals rounded to whole numbers. Returns (values, excluded)."""
    ok, bad = [], 0
    for r in rows:
        s = r[col].strip().replace(",", "") if col < len(r) else ""
        try:
            x = float(s)
        except ValueError:
            bad += 1
            continue
        if lo <= x <= hi:
            ok.append(int(round(x)))
        else:
            bad += 1
    return ok, bad


def published():
    out = []
    fig1 = load_json(RAW, "bosch2002", "digitised_fig1.json")
    for key, label, winner, note in (
        ("ft", "Financial Times 1997", 13, "Integers 0-100."),
        ("spektrum", "Spektrum der Wissenschaft 1997", 14.7, "Real numbers 0-100, binned to whole numbers."),
        ("expansion", "Expansión 1997", 16.99, "Real numbers 1-100 (no 0), binned to whole numbers."),
    ):
        d = fig1[key]
        out.append({
            "id": key, "label": label, "family": "beauty", **TWO_THIRDS, "n": d["n"],
            "reported": {"mean": d["reported_mean"], "winner": winner},
            "freq": d["freq"], "digitised_mean": d["digitised_mean"],
            "source": {**BOSCH, "note": f"{note} Digitised mean {d['digitised_mean']} vs reported {d['reported_mean']}: "
                                        "bins of one or two entries are under a pixel, so the reported mean is used as a constraint."},
        })

    out.append({
        "id": "nagel_lab", "label": "Nagel lab 1991-94 (Bonn, Caltech)", "family": "beauty", **TWO_THIRDS, "n": 86,
        "reported": {"mean": 35.13}, "mean": 35.13,
        "source": {**BOSCH, "note": "Lab experiments 1-5 (Nagel 1995, 1998), first round, pooled in Figure 3.1 of Bosch-Domènech et al. "
                                    "Undergraduates, 15-18 per session. Mean only (n is too small to digitise usefully)."},
    })

    nyt = load_json(RAW, "nyt2015", "digitised.json")["nyt2015"]
    out.append({
        "id": "nyt2015", "label": "New York Times Upshot 2015", "family": "beauty", **TWO_THIRDS, "n": nyt["n"],
        "reported": {"mean": 28, "winner": 19}, "freq": nyt["freq"], "digitised_mean": nyt["digitised_mean"],
        "source": {
            "url": "https://www.nytimes.com/interactive/2015/08/13/upshot/are-you-smarter-than-other-new-york-times-readers.html",
            "chart": "https://waitbutwhy.com/wp-content/uploads/2015/08/NYTimes-Graph.png",
            "citation": "Leonhardt & Quealy (2015), Are You Smarter Than Other New York Times Readers?, The Upshot. "
                        "Results chart as reproduced by Wait But Why.",
            "terms": "© The New York Times. Frequencies digitised from the results chart (59,643 guesses) for research use; "
                     "the chart is not redistributed. The bar at 33 runs off the chart and is inferred as 1 minus the rest.",
        },
    })

    wbw_rows = list(csv.reader(open(os.path.join(RAW, "waitbutwhy", "responses.csv"), encoding="utf-8")))[1:]
    wbw, wbw_bad = numbers(wbw_rows, 1, 0, 100)
    out.append({
        "id": "waitbutwhy2015", "label": "Wait But Why 2015", "family": "beauty", **TWO_THIRDS, "n": len(wbw),
        "reported": {"mean": 22.956, "winner": 15}, "freq": hist(wbw, 0, 100),
        "source": {
            "url": "https://waitbutwhy.com/table/can-you-guess-what-other-readers-are-guessing-results",
            "data": "https://docs.google.com/spreadsheets/d/1xskCsP1-1MKFK23a1C-wV5Tf1UXQ3ZyE5zYVCK-jQno",
            "citation": "Urban (2015), Can You Guess What Other Readers Are Guessing? RESULTS, Wait But Why.",
            "terms": "Raw responses published openly by the author as a Google Sheet; no licence stated. Only the histogram "
                     "is kept here; the raw sheet is not redistributed.",
            "note": f"{len(wbw)} numeric answers in 0-100 after excluding {wbw_bad} (blank, words, out of range). "
                    "The author's own cleaning (dropping decimals too) kept 4,940 with mean 22.956.",
        },
    })

    out.append({
        "id": "rubinstein2007", "label": "Rubinstein 2007 (online, students)", "family": "beauty", **TWO_THIRDS, "n": 2423,
        "reported": {"mean": 36.2},
        "bins": [[0, 1, 0.11], [2, 13, 0.09], [14, 15, 0.02], [16, 21, 0.06], [22, 22, 0.04], [23, 32, 0.10],
                 [33, 34, 0.11], [35, 49, 0.11], [50, 50, 0.16], [51, 100, 0.20]],
        "source": {
            "url": "https://arielrubinstein.org/papers/78.pdf",
            "citation": "Rubinstein (2007), Instinctive and Cognitive Reasoning: A Study of Response Times, Economic Journal 117: 1243-1259.",
            "terms": "Journal article © Royal Economic Society. Bin shares copied from Table 4 (facts); the PDF is not redistributed.",
            "note": "2,423 students in 66 courses via gametheory.tau.ac.il; integers 0-100.",
        },
    })

    out.append({
        "id": "chessbase2009", "label": "ChessBase 2009 (chess players)", "family": "beauty", **TWO_THIRDS, "n": 6000,
        "reported": {"mean": 32.215, "winner": 21.477}, "mean": 32.215,
        "source": {
            "url": "https://en.chessbase.com/post/6000-che-players-took-part-in-our-beauty-contest",
            "citation": "Bühren & Frank (2009), 6000 chess players took part in our beauty contest, ChessBase News.",
            "terms": "News article © ChessBase. Only the reported mean (32.21539) and target (21.4769) are used. "
                     "No histogram was published; n is 'over 6000'.",
        },
    })

    out.append({
        "id": "politiken2005", "label": "Politiken 2005", "family": "beauty", **TWO_THIRDS, "n": 19196,
        "reported": {"winner": 21.6, "mean": 32.4}, "mean": 32.4,
        "source": {
            "url": "https://en.wikipedia.org/wiki/Guess_2/3_of_the_average",
            "citation": "Schou (2005), Danish newspaper Politiken, as cited by Wikipedia (Guess 2/3 of the average).",
            "terms": "Only the reported winning number (21.6, so a mean of 32.4) and n are used. The original Politiken "
                     "article could not be found online; no histogram is available.",
        },
    })
    return out


def youtube():
    rows = list(csv.reader(open(os.path.join(PRIVATE, "youtube", "sheet.csv"), encoding="utf-8")))[1:]
    src = {
        "url": "https://www.youtube.com/watch?v=sJ7IHSTOzng",
        "data": "https://docs.google.com/spreadsheets/d/17109ZDWhCj4dId8-om3r5a8RKzc3t-zT0prov9z-Vhw",
        "terms": "Provided by the owner for calibration only. Do not commit or redistribute the data or histograms derived from it.",
    }
    specs = [
        ("yt_two_thirds", "YouTube survey: 2/3 of the average", "beauty", 2, "target",
         {"range": 100, "stat": "mean", "a": [2, 3], "b": 0}, 0, 100),
        ("yt_plus_five", "YouTube survey: average + 5", "beautyUp", 3, "target",
         {"range": 100, "stat": "mean", "a": [1, 1], "b": 5}, 0, 100),
        ("yt_avoid_rank", "YouTube survey: percentile rings 0-1000", "avoid", 4, "avoid",
         {"mode": "rank", "range": 1000, "edges": [5, 15, 25], "points": [0, 10, 5]}, 0, 1000),
        ("yt_underbid", "YouTube survey: bid under the average", "underbid", 6, "underbid",
         {"max": 20, "c": [1, 1]}, 1, 20),
    ]
    out = []
    for id_, label, family, col, template, params, lo, hi in specs:
        vals, bad = numbers(rows, col, lo, hi)
        out.append({"id": id_, "label": label, "family": family, "template": template, "params": params,
                    "n": len(vals), "reported": {"mean": round(sum(vals) / len(vals), 3)},
                    "freq": hist(vals, lo, hi), "source": {**src, "note": f"{bad} answers excluded (blank, text or out of range)."}})

    def choice(col, labels, match=lambda answer, label: answer.strip().lower().startswith(label.lower())):
        """Share of each option; answers matching no option are dropped."""
        counts = [0] * len(labels)
        for r in rows:
            a = r[col].strip() if col < len(r) else ""
            hit = [i for i, l in enumerate(labels) if a and match(a, l)]
            if len(hit) == 1:
                counts[hit[0]] += 1
        n = sum(counts)
        return [c / n for c in counts], n

    def part(label, template, params, freq, n):
        return {"label": label, "template": template, "params": params, "freq": freq, "n": n}

    # Families fitted jointly over several questions: one set of settings, the mean loss over the parts.
    groups = []
    f7, n7 = choice(7, ["A:", "B:"])
    f8, n8 = choice(8, ["A:", "B:", "C:", "D:", "E:"])
    groups.append(("yt_threshold", "YouTube survey: threshold options (2 questions)", "threshold", [
        part("A: 3 always / B: 10 if under 20%", "threshold", {"options": [{"points": 3, "cap": 100}, {"points": 10, "cap": 20}]}, f7, n7),
        part("10/20%, 8/25%, 6/33%, 4/50%, 2 always", "threshold", {"options": [
            {"points": 10, "cap": 20}, {"points": 8, "cap": 25}, {"points": 6, "cap": 33.333}, {"points": 4, "cap": 50},
            {"points": 2, "cap": 100}]}, f8, n8),
    ]))
    letters = list("PINUTVFLWZXY")
    exact = lambda a, l: a.strip().upper() == l.upper()  # noqa: E731
    f14, n14 = choice(14, letters, exact)
    nums = [str(i) for i in range(1, 11)]
    f15, n15 = choice(15, nums, exact)
    colours = ["Green", "Red", "Blue", "Yellow", "Purple", "Orange"]
    f16, n16 = choice(16, colours, exact)
    f17, n17 = choice(17, list("ABCD"), exact)
    groups.append(("yt_common_most", "YouTube survey: most common (2 questions)", "commonMost", [
        part("numbers 1-10, most common 8/5/3/1", "common", {"set": "numbers", "labels": nums, "order": "most", "points": [8, 5, 3, 1]}, f15, n15),
        part("colours, most common 0/8/3", "common", {"set": "colours", "labels": colours, "order": "most", "points": [0, 8, 3]}, f16, n16),
    ]))
    groups.append(("yt_common_least", "YouTube survey: least common (2 questions)", "commonLeast", [
        part("letters, least common 8/5/3/1", "common", {"set": "letters", "labels": letters, "order": "least", "points": [8, 5, 3, 1]}, f14, n14),
        part("A-D, least common wins", "common", {"set": "abc", "labels": list("ABCD"), "order": "least", "points": [5]}, f17, n17),
    ]))
    pts = lambda a, l: a.strip().split(" ")[0] == l  # noqa: E731
    f20, n20 = choice(20, ["1", "3", "5", "8"], pts)
    f19, n19 = choice(19, ["0", "1", "3", "5"], pts)
    groups.append(("yt_catch", "YouTube survey: points with a catch (2 questions)", "catch", [
        part("1/3/5/8, most common gets 0", "catch", {"values": [1, 3, 5, 8], "rule": "mostZero"}, f20, n20),
        part("0/1/3/5, least common +5", "catch", {"values": [0, 1, 3, 5], "rule": "leastBonus", "bonus": 5}, f19, n19),
    ]))
    f9, n9 = choice(9, ["Split", "Steal"], exact)
    groups.append(("yt_splitsteal", "YouTube survey: split or steal with two neighbours", "splitsteal", [
        part("neighbours, pot 6, -5 if both steal", "splitsteal", {"mode": "neighbours", "pot": 6, "penalty": 5}, f9, n9),
    ]))
    f18, n18 = choice(18, ["Yes", "No"], exact)
    groups.append(("yt_selfref", "YouTube survey: will more people answer NO than YES?", "selfref", [
        {"label": "vote only (5 points for being right)", "template": "selfref", "params": {"bonus": 100, "width": 10, "focus": "NO"},
         "bins": [[0, 100, f18[0]], [101, 201, f18[1]]], "n": n18},
    ]))
    samples = [21, 22, 103, 237, 248, 255, 261, 276, 279, 318]
    tank_vals, tank_bad = numbers(rows, 5, 1, 4 * samples[-1])
    groups.append(("yt_tank", "YouTube survey: German tank (10 numbers, max 318)", "tank", [
        # N only affects scoring, not how bots guess; 350 is a placeholder.
        part("10 numbers, max 318", "tank", {"N": 350, "samples": samples}, hist(tank_vals, 1, 4 * samples[-1]), len(tank_vals)),
    ]))
    for id_, label, family, parts in groups:
        out.append({"id": id_, "label": label, "family": family, "parts": parts, "n": sum(p["n"] for p in parts),
                    "reported": {}, "source": {**src, "note": "Answers matching no option (or outside the grid) are dropped."}})
    return out


def main():
    os.makedirs(os.path.join(ROOT, "calibration", "datasets"), exist_ok=True)
    pub = published()
    with open(os.path.join(ROOT, "calibration", "datasets", "published.json"), "w", encoding="utf-8") as fh:
        json.dump(pub, fh, indent=1, ensure_ascii=False)
    yt = youtube()
    with open(os.path.join(PRIVATE, "youtube.json"), "w", encoding="utf-8") as fh:
        json.dump(yt, fh, indent=1, ensure_ascii=False)
    for d in pub + yt:
        print(f"{d['id']:16} n={d['n']:6}  {'parts' if 'parts' in d else 'freq' if 'freq' in d else 'bins' if 'bins' in d else 'mean'}  {d['reported']}")


if __name__ == "__main__":
    main()

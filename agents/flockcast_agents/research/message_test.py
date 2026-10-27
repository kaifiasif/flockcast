"""
Tally the Pollster tests two to four versions of a message on several groups at once. Every person rates
every version for appeal, clarity and believability, and says whether they would act; Tally scores each
version per group, names the winner per group and overall, and flags when groups disagree, which is the
case a single average would hide. Simulated ratings, not a survey.
"""
from ..swarm.simulate import rng_from
from ..text import clean
from .brand import rule_issues
from .panel import build_panel, roster, segments_of
from .signals import clamp, signals

LABELS = "ABCD"


def _rating(v):
    try:
        return int(clamp(round(float(v)), 1, 5))
    except (TypeError, ValueError):
        return 3


def _validate_ratings(o, people, n_messages):
    raw = o.get("ratings") if isinstance(o, dict) else None
    if not isinstance(raw, list):
        raise ValueError("expected {ratings: [..]}")
    ids = {p["id"] for p in people}
    out, seen = [], set()
    for r in raw:
        if not isinstance(r, dict):
            continue
        try:
            pid, mi = int(r.get("person")), LABELS.index(str(r.get("message")).strip().upper()[:1])
        except (TypeError, ValueError):
            continue
        if pid not in ids or mi >= n_messages or (pid, mi) in seen:
            continue
        seen.add((pid, mi))
        out.append({"person": pid, "message": mi, "appeal": _rating(r.get("appeal")), "clarity": _rating(r.get("clarity")), "credibility": _rating(r.get("credibility")), "act": r.get("act") is True, "says": clean(r.get("says"), 240)})
    if len(out) < len(people) * n_messages // 2:
        raise ValueError("fewer than half the ratings came back")
    return out


def _rate(llm, inp, messages, people):
    return llm.json(
        system="You play each research participant and rate messages the way that person honestly would, from their own situation. Most messages are not exciting to most people. Reply with JSON only.",
        user="\n\n".join(x for x in [
            f"Goal of the message: {inp['goal']}" if inp.get("goal") else "",
            "Versions:\n" + "\n".join(f"{LABELS[i]}: {m['text']}" for i, m in enumerate(messages)),
            f"Participants:\n{roster(people)}",
            "Each participant rates every version from 1 to 5 for appeal, clarity and credibility, says whether they would act on it, and says one short line in their own words.",
            'JSON shape: {"ratings":[{"person":1,"message":"A","appeal":3,"clarity":4,"credibility":2,"act":false,"says":"..."}]}',
        ] if x),
        validate=lambda o: _validate_ratings(o, people, len(messages)),
        temperature=0.8,
        max_tokens=6000,
    )


def _offline_ratings(messages, people):
    sigs = [signals(m["text"]) for m in messages]
    out = []
    for p in people:
        lean = {"supportive": 0.6, "neutral": 0.0, "skeptical": -0.6}[p["stance"]]
        for i, s in enumerate(sigs):
            rng = rng_from(f"{p['id']}|{p['segment']}|{messages[i]['text']}")
            unsupported = bool(s["claim"]) and not s["sourced"]
            clarity = 4.2 - max(0, s["avg_sentence"] - 18) / 8 - max(0, s["words"] - 60) / 60
            credibility = 3.4 - (1.3 if unsupported and p["stance"] == "skeptical" else 0.5 if unsupported else 0) + (0.6 if s["sourced"] else 0)
            appeal = 3 + lean + min(s["you"], 3) * 0.2 + (0.3 if s["ask"] else -0.2)
            r = {k: _rating(v + (rng() - 0.5) * 0.8) for k, v in (("appeal", appeal), ("clarity", clarity), ("credibility", credibility))}
            out.append({"person": p["id"], "message": i, **r, "act": r["appeal"] >= 4 and s["ask"], "says": ""})
    return out


def _score(items):
    if not items:
        return None
    mean = sum((r["appeal"] + r["clarity"] + r["credibility"]) / 3 for r in items) / len(items)
    return round((mean - 1) / 4 * 100)


def scoreboard(messages, people, ratings):
    by_id = {p["id"]: p for p in people}
    segments = list(dict.fromkeys(p["segment"] for p in people))
    matrix = []
    for seg in segments:
        cells = []
        for i in range(len(messages)):
            items = [r for r in ratings if r["message"] == i and by_id[r["person"]]["segment"] == seg]
            quote = next((r for r in sorted(items, key=lambda r: -abs(r["appeal"] - 3)) if r["says"]), None)
            cells.append({"message": i, "score": _score(items), "act_share": round(sum(r["act"] for r in items) / len(items), 2) if items else None, "quote": {"person": quote["person"], "text": quote["says"]} if quote else None})
        best = max((c for c in cells if c["score"] is not None), key=lambda c: c["score"], default=None)
        matrix.append({"segment": seg, "cells": cells, "winner": best["message"] if best else None})
    overall = []
    for i in range(len(messages)):
        scores = [row["cells"][i]["score"] for row in matrix if row["cells"][i]["score"] is not None]
        acts = [row["cells"][i]["act_share"] for row in matrix if row["cells"][i]["act_share"] is not None]
        # every group counts the same, however many people it had
        overall.append({"message": i, "score": round(sum(scores) / len(scores)) if scores else None, "act_share": round(sum(acts) / len(acts), 2) if acts else None})
    winner = max((o for o in overall if o["score"] is not None), key=lambda o: o["score"], default=None)
    winners = {row["winner"] for row in matrix if row["winner"] is not None}
    return {"matrix": matrix, "overall": overall, "winner": winner["message"] if winner else None, "split": len(winners) > 1}


def run_message_test(llm, inp, brand, on_stage):
    messages = [{"label": clean(m.get("label"), 40) or f"Version {LABELS[i]}", "text": clean(m.get("text"), 2000)} for i, m in enumerate((inp.get("messages") or [])[:4]) if isinstance(m, dict)]
    messages = [m for m in messages if m["text"]]
    if len(messages) < 2:
        raise ValueError("a message test needs at least two versions")
    segments = segments_of(inp.get("segments"), 5)
    per = int(clamp(int(inp.get("per_segment") or 5), 2, 10))
    on_stage("preparing", 5)
    people = build_panel(llm, segments, per, " / ".join(m["text"][:200] for m in messages))
    on_stage("running", 30)
    ratings = []
    if llm:
        for i, seg in enumerate(segments):
            ratings += _rate(llm, inp, messages, [p for p in people if p["segment"] == seg["name"]])
            on_stage("running", 30 + round(55 * (i + 1) / len(segments)))
    else:
        ratings = _offline_ratings(messages, people)
    on_stage("reporting", 90)
    board = scoreboard(messages, people, ratings)
    if brand:
        for m in messages:
            m["brand"] = rule_issues(m["text"], brand)
    return {"messages": messages, "panel": people, "ratings": ratings, **board}

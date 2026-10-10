"""
Sable the Sniffer: does the post read as written by AI? LinkedIn added a "seems like AI" button and
shows such posts to fewer people, so this flags the sentences a reader would notice. Offline it uses a
list of tell-tale phrases; with a model it also asks a reader's eye, and both only ever point at real
sentences of the post.
"""
import re

from ..jsnum import js_round
from ..text import clean, sentences_of

# phrase, why a reader notices it
TELLS = [
    (r"\bdelve\b", "“Delve” is one of the words people now associate with AI writing."),
    (r"\bin today'?s (fast-paced|digital|ever-changing|rapidly)", "A stock opener that reads as generated."),
    (r"\bgame[- ]?changer\b|\bgame[- ]?changing\b", "A cliché that makes the claim sound like marketing."),
    (r"\bunlock(ing)? (the|your|new)\b", "“Unlock your…” is a common AI phrasing."),
    (r"\bleverag(e|ing)\b", "Corporate filler that many AI drafts lean on."),
    (r"\b(it'?s|this is) not (just|only) (about )?[^.,;]{1,40}[,;—-]+ ?(it'?s|this is)\b", "The “it’s not X, it’s Y” turn is a well-known AI pattern."),
    (r"\bhere'?s the (thing|kicker|truth)\b", "A stock transition that reads as templated."),
    (r"\blet that sink in\b", "A cliché closer people scroll past."),
    (r"\b(i'?m|i am) (thrilled|humbled|excited) to (announce|share)\b", "A stock announcement line."),
    (r"\b(navigate|navigating) the (complex|ever)", "Vague, generated-sounding phrasing."),
    (r"\b(tapestry|testament to|ever-evolving|seamless(ly)?|robust|cutting[- ]edge|elevate)\b", "A word that shows up far more in AI text than in people’s posts."),
    (r"^\s*(🚀|✅|👉|💡|🔥)", "Emoji bullets at the start of lines are a common AI-post format."),
    (r"\b(in conclusion|to sum up|at the end of the day)\b", "A stock wrap-up that reads as filler."),
]
_TELLS = [(re.compile(p, re.I | re.M), why) for p, why in TELLS]
MAX_FLAGS = 8


def rule_flags(sentences):
    out = []
    for i, s in enumerate(sentences):
        for rx, why in _TELLS:
            if rx.search(s):
                out.append({"index": i, "sentence": s, "why": why, "by": "rules"})
                break
    return out


def _score(flags, n):
    return js_round(100 * len({f["index"] for f in flags}) / n) if n else 0


def ai_check(llm, posts, platform):
    sentences = [s for p in posts for s in sentences_of(p)]
    flags = rule_flags(sentences)
    if not llm or not sentences:
        return {"method": "rules", "score": _score(flags, len(sentences)), "flags": flags[:MAX_FLAGS]}
    numbered = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(sentences))

    def validate(o):
        lst = o.get("flags") if isinstance(o, dict) else None
        if not isinstance(lst, list):
            raise ValueError("expected {flags: [..]}")
        out = []
        for f in lst[:MAX_FLAGS]:
            if not isinstance(f, dict):
                continue
            try:
                i = int(f.get("sentence")) - 1
            except (TypeError, ValueError):
                continue
            why = clean(f.get("why"), 200)
            if 0 <= i < len(sentences) and why:
                out.append({"index": i, "sentence": sentences[i], "why": why, "by": "model"})
        return out

    found = llm.json(
        system=f"You are a sharp, ordinary reader on {platform['name']} who has seen thousands of AI-written posts. You point out sentences that sound machine-written: stock phrases, empty intensifiers, symmetrical 'not X but Y' turns, vague claims, list-like rhythm. Plain, specific human sentences are fine; do not flag them. Reply with JSON only.",
        user="\n\n".join([
            f"The post, one sentence per line:\n{numbered}",
            "Which sentences would make a reader think an AI wrote this? Up to 6, only the clear ones. For each, say in under 20 words what gives it away.",
            'JSON shape: {"flags":[{"sentence":2,"why":"..."}]}',
        ]),
        validate=validate,
        temperature=0.2,
    )
    seen = {f["index"] for f in found}
    merged = sorted(found + [f for f in flags if f["index"] not in seen], key=lambda f: f["index"])[:MAX_FLAGS]
    return {"method": "model", "score": _score(merged, len(sentences)), "flags": merged}

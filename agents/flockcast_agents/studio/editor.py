"""
Editor Ember: turns "this sentence drew pushback" into "here is why, and here is a better version".
Each fix names the simulated readers who objected and quotes what they said, so a rewrite can always be
traced back to the rehearsal. Offline it explains and suggests; only a model writes rewrites.
"""
import re

from ..text import clean

MAX_FIXES = 4
_CLAIMY = re.compile(r"\d|%|\b(always|never|every|nobody|everyone|all|most|proven|fact|guaranteed|best|only)\b", re.I)


def candidates(summary, ai_flags):
    """The sentences worth fixing: most pushback first, then the ones that read as AI."""
    hot = sorted((s for s in summary["sentences"] if s["pushback"]), key=lambda s: (-s["pushback"], -s["mentions"]))
    out, seen = [], set()
    for s in hot:
        out.append({"sentence": s["text"], "pushback": s["pushback"], "examples": s["examples"], "ai": None})
        seen.add(s["text"])
    for f in ai_flags:
        if f["sentence"] in seen:
            next(c for c in out if c["sentence"] == f["sentence"])["ai"] = f["why"]
        elif f["sentence"] not in seen:
            out.append({"sentence": f["sentence"], "pushback": 0, "examples": [], "ai": f["why"]})
            seen.add(f["sentence"])
    return out[:MAX_FIXES]


def _who(examples, replies):
    names = []
    for r in replies:
        if r["text"] in examples and r["agent_name"] not in names:
            names.append(r["agent_name"])
    return names


def _why(c):
    parts = []
    if c["pushback"]:
        parts.append(f"{c['pushback']} simulated {'reader' if c['pushback'] == 1 else 'readers'} pushed back on this")
    if c["ai"]:
        parts.append("it reads as AI-written")
    if not parts:
        return ""
    text = " and ".join(parts) + "."
    return text[:1].upper() + text[1:]


def _suggestion(c):
    if c["pushback"] and _CLAIMY.search(c["sentence"]):
        return "Say where this comes from, or soften it so it doesn't sound like a hard fact."
    if c["pushback"]:
        return "Add an example or the reason behind it, so readers don't have to take it on trust."
    return "Say it the way you would out loud to one person, with a concrete detail."


def fixes(llm, summary, ai, platform, handle):
    cands = candidates(summary, ai["flags"])
    base = [{"sentence": c["sentence"], "why": _why(c), "who": _who(c["examples"], summary["replies"]), "said": c["examples"][:2], "suggestion": _suggestion(c), "rewrite": None} for c in cands]
    if not llm or not cands:
        return base
    blocks = []
    for i, c in enumerate(cands):
        lines = [f"{i + 1}. \"{c['sentence']}\""]
        if c["examples"]:
            lines.append("   Readers said: " + " | ".join(f'"{e}"' for e in c["examples"][:3]))
        if c["ai"]:
            lines.append(f"   Reads as AI because: {c['ai']}")
        blocks.append("\n".join(lines))

    def validate(o):
        lst = o.get("fixes") if isinstance(o, dict) else None
        if not isinstance(lst, list):
            raise ValueError("expected {fixes: [..]}")
        out = {}
        for f in lst:
            if not isinstance(f, dict):
                continue
            try:
                i = int(f.get("sentence")) - 1
            except (TypeError, ValueError):
                continue
            if not 0 <= i < len(cands):
                continue
            rewrite = clean(f.get("rewrite"), max(200, 2 * len(cands[i]["sentence"])))
            why = clean(f.get("why"), 240)
            if rewrite and rewrite != cands[i]["sentence"]:
                out[i] = {"why": why, "rewrite": rewrite}
        return out

    got = llm.json(
        system=f"You are an editor helping {handle} fix a {platform['name']} post before it goes out. Keep the author's voice and meaning. Never invent facts, numbers or sources: where a source is missing, write [source] for the author to fill in. Reply with JSON only.",
        user="\n\n".join([
            "These sentences drew pushback from simulated readers, or read as AI-written:",
            "\n".join(blocks),
            "For each, say in one sentence why readers reacted, then rewrite it so the objection goes away. Similar length or shorter.",
            'JSON shape: {"fixes":[{"sentence":1,"why":"...","rewrite":"..."}]}',
        ]),
        validate=validate,
        temperature=0.4,
    )
    for i, g in got.items():
        base[i]["rewrite"] = g["rewrite"]
        if g["why"]:
            base[i]["why"] = g["why"]
    return base

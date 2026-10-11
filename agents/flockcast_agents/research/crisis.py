"""
Juniper the Steady rehearses a statement before a hard moment: an outage, a recall, a layoff, a post that went
wrong. Stakeholder groups react to the statement, the story spreads a round, and Juniper lists what to fix
and drafts a steadier version. The statement checks are exact and run without a model; a revised
statement never gains a fact the person did not give, so any new number is replaced with [fact].
"""
import re

from ..text import clean, sentences_of

GROUPS = {
    "customers": ("Customers", "People who pay for or use the product and were affected."),
    "press": ("Press", "Reporters looking for the angle and the quote."),
    "employees": ("Employees", "Staff who read it and wonder what it means for them."),
    "investors": ("Investors", "Backers who care about risk, cost and leadership."),
    "regulators": ("Regulators", "Officials who care about harm, disclosure and compliance."),
    "critics": ("Critics", "Long-time detractors who will quote the weakest line."),
}
# how warm each group starts, before the statement helps or hurts (1 calm, 5 furious)
BASE_HEAT = {"customers": 3, "press": 3, "employees": 2, "investors": 2, "regulators": 3, "critics": 4}

CHECKS = [
    ("apology", re.compile(r"\b(sorry|apologi[sz]e|apology)\b", re.I), True, "Says sorry", "Says sorry plainly.", "There is no apology. People read its absence first."),
    ("ownership", re.compile(r"\bwe\b[^.]{0,40}\b(made|got|caused|failed|are responsible|take (full )?responsibility|messed up)\b", re.I), True, "Owns it", "Says what you did, in the first person.", "It never says who got it wrong."),
    ("passive", re.compile(r"\b(mistakes were made|errors occurred|was impacted|were impacted|an issue (occurred|arose))\b", re.I), False, "Passive voice", "", "Passive phrasing reads as dodging blame."),
    ("deflect", re.compile(r"\b(if anyone was offended|some users|a small number|unfortunately|out of our control|third[- ]party)\b", re.I), False, "Deflection", "", "This line shifts blame or shrinks the problem, and critics will quote it."),
    ("next", re.compile(r"\b(we will|we'll|starting|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|the end of)|within \d+|next step)\b", re.I), True, "Next steps", "Says what happens next.", "It does not say what you will do next or when."),
    ("contact", re.compile(r"\b(contact|reach us|email|support|help ?center|status page|updates? (at|on))\b|https?://", re.I), True, "Where to go", "Tells people where to get help or updates.", "It does not tell people where to get help or updates."),
    ("legalese", re.compile(r"\b(pursuant|hereby|aforementioned|in accordance with|we take .{0,20} seriously)\b", re.I), False, "Stock phrasing", "", "Legal or stock phrasing sounds like a lawyer wrote it."),
]


def statement_checks(statement):
    sentences = sentences_of(statement) or [statement]
    out = []
    for key, rx, wanted, title, good, bad in CHECKS:
        hit = next((s for s in sentences if rx.search(s)), None)
        if wanted:
            out.append({"id": key, "level": "good" if hit else "risk", "title": title, "detail": good if hit else bad, "excerpt": hit[:240] if hit else None})
        elif hit:
            out.append({"id": key, "level": "risk", "title": title, "detail": bad, "excerpt": hit[:240]})
    return out


def _numbers(text):
    return set(re.findall(r"\d[\d,.:]*", text))


def guard_facts(revised, sources):
    """Any number the person never wrote becomes [fact], so a draft cannot invent a date or a count."""
    known = _numbers(" ".join(sources))
    return re.sub(r"\d[\d,.:]*", lambda m: m.group(0) if m.group(0) in known else "[fact]", revised)


def _heat(v):
    try:
        return max(1, min(5, round(float(v))))
    except (TypeError, ValueError):
        return 3


def _validate_reactions(o, groups, statement):
    raw = o.get("reactions") if isinstance(o, dict) else None
    if not isinstance(raw, list):
        raise ValueError("expected {reactions: [..]}")
    out = {}
    for r in raw:
        g = clean(r.get("group"), 20).lower() if isinstance(r, dict) else ""
        if g not in groups or g in out:
            continue
        worst = clean(r.get("worst_line"), 240)
        out[g] = {
            "group": g,
            "name": GROUPS[g][0],
            "heat": _heat(r.get("heat")),
            "reaction": clean(r.get("reaction"), 400),
            # only a line that is really in the statement can be called the worst line
            "worst_line": worst if worst and worst.lower() in statement.lower() else None,
            "question": clean(r.get("question"), 240) or None,
        }
    if len(out) < len(groups):
        raise ValueError("missing a reaction for some groups")
    return [out[g] for g in groups]


def _offline_reactions(groups, checks):
    risks = [c for c in checks if c["level"] == "risk"]
    helps = sum(1 for c in checks if c["level"] == "good")
    worst = next((c["excerpt"] for c in risks if c["excerpt"]), None)
    out = []
    for g in groups:
        heat = max(1, min(5, BASE_HEAT[g] + (1 if len(risks) >= 2 else 0) - (1 if helps >= 3 else 0)))
        out.append({
            "group": g,
            "name": GROUPS[g][0],
            "heat": heat,
            "reaction": f"Offline estimate from the statement checks: {risks[0]['detail'] if risks else 'the statement covers the basics.'}",
            "worst_line": worst,
            "question": None,
        })
    return out


def _validate_spread(o):
    if not isinstance(o, dict) or o.get("spread") not in ("low", "medium", "high"):
        raise ValueError("expected {spread: low|medium|high}")
    return {
        "spread": o["spread"],
        "why": clean(o.get("why"), 300),
        "headlines": [clean(h, 140) for h in o.get("headlines") or [] if clean(h, 140)][:3],
        "follow_ups": [clean(q, 200) for q in o.get("follow_ups") or [] if clean(q, 200)][:5],
    }


def _validate_advice(o, sources):
    if not isinstance(o, dict) or not clean(o.get("revised"), 3000):
        raise ValueError("expected {revised: '...'}")
    return {
        "changes": [clean(c, 240) for c in o.get("changes") or [] if clean(c, 240)][:6],
        "revised": guard_facts(clean(o["revised"], 3000), sources),
    }


def run_crisis(llm, inp, on_stage):
    situation, statement = clean(inp.get("situation"), 2000), str(inp.get("statement") or "").strip()[:3000]
    if not situation or not statement:
        raise ValueError("a crisis rehearsal needs the situation and a draft statement")
    groups = [g for g in dict.fromkeys(inp.get("stakeholders") or []) if g in GROUPS] or ["customers", "press", "critics"]
    on_stage("preparing", 10)
    checks = statement_checks(statement)
    brief = f"What happened: {situation}\n\nThe statement:\n{statement}"
    on_stage("running", 25)
    if llm:
        reactions = llm.json(
            system="You simulate how real stakeholder groups react to a company statement during a crisis. Be realistic and unsentimental; do not soften reactions. Reply with JSON only.",
            user="\n\n".join([
                brief,
                "Groups:\n" + "\n".join(f"- {g}: {GROUPS[g][1]}" for g in groups),
                "For each group: how heated it is from 1 (calm) to 5 (furious), its reaction in 1-2 sentences, the single line of the statement it would quote back (copied exactly, or empty), and the question it would ask next.",
                'JSON shape: {"reactions":[{"group":"customers","heat":3,"reaction":"...","worst_line":"...","question":"..."}]}',
            ]),
            validate=lambda o: _validate_reactions(o, groups, statement),
            temperature=0.7,
        )
    else:
        reactions = _offline_reactions(groups, checks)
    spread = None
    if llm and int(inp.get("rounds") or 2) >= 2:
        on_stage("running", 60)
        spread = llm.json(
            system="You predict how a story develops over the next day once the first reactions are public. Reply with JSON only.",
            user="\n\n".join([brief, "First reactions:\n" + "\n".join(f"- {r['name']} (heat {r['heat']}): {r['reaction']}" for r in reactions), 'JSON shape: {"spread":"low|medium|high","why":"1 sentence","headlines":["up to 3 likely headlines"],"follow_ups":["up to 5 questions reporters or customers will ask next"]}']),
            validate=_validate_spread,
            temperature=0.6,
        )
    on_stage("reporting", 85)
    advice = None
    if llm:
        advice = llm.json(
            system="You are a calm, experienced crisis communications adviser. Keep the company's facts; never add a fact, number, date or promise that is not in the brief. Where one is needed, write [fact] for the person to fill in. Reply with JSON only.",
            user="\n\n".join([
                brief,
                "Statement checks:\n" + "\n".join(f"- {c['title']}: {c['detail']}" for c in checks),
                "Reactions:\n" + "\n".join(f"- {r['name']}: {r['reaction']}" + (f" Quoted: \"{r['worst_line']}\"" if r["worst_line"] else "") for r in reactions),
                'JSON shape: {"changes":["what to change, most important first"],"revised":"the full revised statement"}',
            ]),
            validate=lambda o: _validate_advice(o, [situation, statement]),
            temperature=0.4,
        )
    heat = round(sum(r["heat"] for r in reactions) / len(reactions), 1)
    level = "high" if heat >= 3.7 or (spread and spread["spread"] == "high") else "medium" if heat >= 2.6 else "low"
    return {
        "checks": checks,
        "reactions": reactions,
        "spread": spread,
        "advice": advice or {"changes": [c["detail"] for c in checks if c["level"] == "risk"][:6], "revised": None},
        "risk": {"level": level, "heat": heat},
    }

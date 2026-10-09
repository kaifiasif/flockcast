"""
Captain Compass writes the decision around Lord Ledger's prices. The model names the plans and says what
goes in each, but never picks a number, so a confident-sounding price can always be traced back to the buyers.
"""
from ..jsnum import js_round
from ..text import as_list, clean
from .pricing import price_points

VERDICTS = ("go", "go_with_changes", "rethink")
EFFORTS = ("small", "medium", "large")


def _lines(v, n, max_len):
    return [x for x in (clean(s, max_len) for s in as_list(v, n)) if x]


def _tier_text(v, fallback):
    t = v if isinstance(v, dict) else {}
    return {"name": clean(t.get("name"), 30, fallback), "who": clean(t.get("who"), 160), "includes": _lines(t.get("includes"), 6, 120)}


def validate_decision(o, findings):
    d = o if isinstance(o, dict) else {}
    ids = {f["id"] for f in findings}
    verdict = d.get("verdict") if d.get("verdict") in VERDICTS else None
    headline = clean(d.get("headline"), 200)
    if not verdict or not headline:
        raise ValueError("expected a verdict (go, go_with_changes or rethink) and a headline")
    features = []
    for raw in as_list(d.get("features"), 6):
        f = raw if isinstance(raw, dict) else {}
        name = clean(f.get("name"), 80)
        if not name:
            continue
        features.append({"name": name, "why": clean(f.get("why"), 240), "effort": f.get("effort") if f.get("effort") in EFFORTS else "medium", "finding": f.get("finding") if isinstance(f.get("finding"), str) and f.get("finding") in ids else None})
    tiers = d.get("tiers") if isinstance(d.get("tiers"), dict) else {}
    return {
        "plan": {"verdict": verdict, "headline": headline, "reasons": _lines(d.get("reasons"), 5, 240), "features": features, "steps": _lines(d.get("steps"), 8, 240), "risks": _lines(d.get("risks"), 4, 240), "launch_post": clean(d.get("launch_post"), 1200)},
        "free": _tier_text(tiers.get("free"), "Free") if d.get("free_tier") is True else None,
        "hero": _tier_text(tiers.get("hero"), "Pro"),
        "top": _tier_text(tiers.get("top"), "Team"),
        "why": clean(d.get("price_why"), 500),
    }


def _num(n):
    """A number as JavaScript prints it: 19, not 19.0."""
    return str(int(n)) if float(n).is_integer() else repr(float(n))


def _money(n, inp):
    return f"{_num(n)} {inp['currency']}" + (" a month" if inp["billing"] == "subscription" else "")


def decide(llm, inp, market, reception, rng, points, findings):
    parts = [f"Product: {inp['product']}\nWhat it does: {inp['pitch']}\nFor: {inp.get('audience') or 'not stated'}\nThe founder's price idea: {inp.get('price_idea') or 'none'}"]
    if market:
        comps = "; ".join(c["name"] + (f" ({c['price']})" if c["price"] else "") + f": {c['weakness']}" for c in market["competitors"]) or "none found"
        voices = " | ".join(f"[{v['finding']}] {v['quote']}" for v in market["voices"]) or "nothing found"
        parts.append(f"Market research: {market['summary']}\nCompetitors: {comps}\nWhat people ask for or complain about: {voices}\nPrice signals: {'; '.join(market['price_signals']) or 'none'}")
    else:
        parts.append("No web research is available.")
    if reception:
        parts.append(f"Simulated buyers: reception {reception['score']}/100, {js_round(reception['would_try_share'] * 100)}% would try it. Top objections: {'; '.join(reception['objections'])}. Top must-haves: {'; '.join(reception['must_haves'])}.")
    if rng and points:
        parts.append(f"Prices are already decided from the buyers' answers: the main plan is {_money(points['hero'], inp)}, the bigger plan {_money(points['top'], inp)}. Acceptable range {_num(rng['low'])}-{_num(rng['high'])} {inp['currency']}. Do not change these numbers; decide only what each plan includes.")
    parts += [
        "\n".join([
            "Decide:",
            "- verdict: go (launch as is), go_with_changes (launch after the changes you list) or rethink (do not launch yet).",
            "- headline: one sentence the founder reads first.",
            "- reasons: up to 4 short reasons.",
            "- features: up to 5 features to add before or soon after launch, most important first, each with why, effort (small, medium or large) and the finding id that supports it, or null.",
            "- steps: 5 to 8 launch steps in order, each one action the founder can do this week.",
            "- risks: up to 3.",
            "- launch_post: a short, honest launch post (under 120 words) for the place these buyers hang out.",
            "- free_tier: true if a free plan will help people try it, false if not.",
            "- tiers: names (one or two words), who each is for, and up to 5 things each includes, for free (only if free_tier), hero (the main plan) and top (the bigger plan).",
            "- price_why: two sentences on why these prices, in plain words.",
        ]),
        'JSON shape: {"verdict":"go_with_changes","headline":"","reasons":[""],"features":[{"name":"","why":"","effort":"small","finding":"f2"}],"steps":[""],"risks":[""],"launch_post":"","free_tier":true,"tiers":{"free":{"name":"","who":"","includes":[""]},"hero":{"name":"","who":"","includes":[""]},"top":{"name":"","who":"","includes":[""]}},"price_why":""}',
    ]
    return llm.json(
        system='You are a launch advisor for first-time founders. They will do exactly what you say, so be decisive and concrete: no hedging, no jargon, no "it depends". Base every call on the research and the simulated buyers you are given, and say so when the evidence is thin. Simulated buyers are a rehearsal, not a forecast. Reply with JSON only.',
        user="\n\n".join(x for x in parts if x),
        validate=lambda o: validate_decision(o, findings),
        temperature=0.3,
        max_tokens=6000,
    )


def pricing_of(inp, rng, decision):
    p = price_points(rng, inp["billing"], inp["currency"])
    sub = inp["billing"] == "subscription"

    def tier(t, price, yearly, hero):
        return {"name": t["name"], "monthly": price if sub else None, "yearly": yearly if sub else None, "one_time": None if sub else price, "who": t["who"], "includes": t["includes"], "hero": hero}

    tiers = ([tier(decision["free"], 0, 0 if sub else None, False)] if decision["free"] else []) + [
        tier(decision["hero"], p["hero"], p["heroYearly"], True),
        tier(decision["top"], p["top"], p["topYearly"], False),
    ]
    return {"currency": inp["currency"], "billing": inp["billing"], "range": rng, "tiers": tiers, "why": decision["why"]}

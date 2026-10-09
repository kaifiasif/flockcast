"""
Mystic Mira: a simulated set of potential buyers hears the pitch and answers the four price questions.
Simulated answers are a rehearsal of the conversation, not market data, and the report says so.
"""
import re

from ..jsnum import js_round
from ..text import clean, num


def validate_buyers(o, n):
    raw = o.get("buyers") if isinstance(o, dict) else None
    if not isinstance(raw, list) or len(raw) < 3:
        raise ValueError("expected {buyers: [..]} with at least 3 people")
    out = []
    for i, r in enumerate(raw[:n]):
        b = r if isinstance(r, dict) else {}
        p = b.get("prices") if isinstance(b.get("prices"), dict) else {}
        name = clean(b.get("name"), 40)
        if not name:
            raise ValueError(f"buyers[{i}] needs a name")
        out.append({
            "id": i + 1,
            "name": name,
            "segment": clean(b.get("segment"), 40, "Buyer"),
            "bio": clean(b.get("bio"), 300),
            "interest": min(5, max(1, js_round(num(b.get("interest")) or 3))),
            "would_try": b.get("would_try") is True,
            "objection": clean(b.get("objection"), 200),
            "must_have": clean(b.get("must_have"), 200),
            "prices": {k: num(p.get(k)) for k in ("too_cheap", "bargain", "expensive", "too_expensive")},
        })
    return out


def ask_buyers(llm, inp, market):
    unit = f"{inp['currency']} per month" if inp["billing"] == "subscription" else f"{inp['currency']}, paid once"
    space = ""
    if market:
        options = ", ".join(c["name"] + (f" ({c['price']})" if c["price"] else "") for c in market["competitors"]) or "none found"
        space = f"What people say about this space today: {market['summary']}\nExisting options: {options}"
    parts = [
        f"Create {inp['buyers']} potential buyers who could plausibly come across this product.",
        f"Product: {inp['product']}\nWhat it does: {inp['pitch']}",
        f"Who it is for: {inp.get('audience') or 'infer the likely buyers from the pitch, and include a few who are only loosely in the market'}",
        space,
        f"For each buyer give: interest from 1 (would ignore it) to 5 (would buy today), whether they would try it, their main objection, the one thing it must do for them, and their answers in {unit} to: at what price is it so cheap you would doubt its quality (too_cheap), a bargain (bargain), getting expensive but still worth considering (expensive), too expensive to consider (too_expensive).",
        "Spread them across groups, budgets and levels of interest. Include skeptics and people happy with what they use now.",
        'JSON shape: {"buyers":[{"name":"","segment":"","bio":"1 sentence","interest":3,"would_try":true,"objection":"","must_have":"","prices":{"too_cheap":0,"bargain":0,"expensive":0,"too_expensive":0}}]}',
    ]
    return llm.json(
        system="You simulate realistic potential buyers for a product, each with their own budget and doubts. Be honest: most people are not excited by most products. Reply with JSON only.",
        user="\n\n".join(x for x in parts if x),
        validate=lambda o: validate_buyers(o, inp["buyers"]),
        temperature=0.9,
        max_tokens=6000,
    )


def _common(items, max_n):
    """Counts the things several buyers said, most common first."""
    counts = {}
    for t in (x for x in items if x):
        key = re.sub(r"[^\w ]|_", "", t.lower())[:60]
        if key in counts:
            counts[key][1] += 1
        else:
            counts[key] = [t, 1]
    return [t for t, _ in sorted(counts.values(), key=lambda c: -c[1])[:max_n]]


def reception_of(buyers):
    if not buyers:
        return None
    mean = sum(b["interest"] for b in buyers) / len(buyers)
    return {
        "score": js_round((mean - 1) / 4 * 100),
        "would_try_share": js_round(sum(1 for b in buyers if b["would_try"]) / len(buyers) * 100) / 100,
        "objections": _common([b["objection"] for b in buyers], 5),
        "must_haves": _common([b["must_have"] for b in buyers], 5),
    }

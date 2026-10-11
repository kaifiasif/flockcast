"""
The people in a study. Studies ask named groups the same questions, so the panel is built per group:
with a model, one call writes specific people for every group; offline, each group gets a fixed spread
of supportive, neutral and skeptical members so demos and tests run free.
"""
from ..text import clean

STANCES = ("supportive", "neutral", "skeptical")


def segments_of(raw, limit=5):
    """Groups arrive as {name, about} from Node; anything else is dropped."""
    out = []
    for s in raw if isinstance(raw, list) else []:
        name = clean(s.get("name") if isinstance(s, dict) else s, 40)
        if name and name.lower() not in {x["name"].lower() for x in out}:
            out.append({"name": name, "about": clean(s.get("about") if isinstance(s, dict) else "", 300)})
    if not out:
        raise ValueError("a study needs at least one group of people")
    return out[:limit]


def validate_panel(o, segments, per_segment):
    raw = o.get("people") if isinstance(o, dict) else None
    if not isinstance(raw, list):
        raise ValueError("expected {people: [..]}")
    names = {s["name"].lower(): s["name"] for s in segments}
    kept = {s["name"]: [] for s in segments}
    for p in raw:
        if not isinstance(p, dict):
            continue
        seg = names.get(clean(p.get("segment"), 40).lower())
        name = clean(p.get("name"), 40)
        if not seg or not name or len(kept[seg]) >= per_segment:
            continue
        kept[seg].append({"name": name, "segment": seg, "bio": clean(p.get("bio"), 240), "stance": p.get("stance") if p.get("stance") in STANCES else "neutral"})
    missing = [s for s, people in kept.items() if not people]
    if missing:
        raise ValueError(f"no people for {', '.join(missing)}")
    return _numbered(kept)


def offline_panel(segments, per_segment):
    kept = {}
    for s in segments:
        kept[s["name"]] = [
            {"name": f"{s['name']} {i + 1}", "segment": s["name"], "bio": s["about"] or s["name"], "stance": STANCES[i % 3]}
            for i in range(per_segment)
        ]
    return _numbered(kept)


def _numbered(kept):
    people = [p for group in kept.values() for p in group]
    return [{**p, "id": i + 1} for i, p in enumerate(people)]


def build_panel(llm, segments, per_segment, context):
    if not llm:
        return offline_panel(segments, per_segment)
    groups = "\n".join(f"- {s['name']}" + (f": {s['about']}" if s["about"] else "") for s in segments)
    return llm.json(
        system="You recruit realistic research participants for a simulated study. Each is a specific person with a job, habits and opinions of their own. Reply with JSON only.",
        user="\n\n".join([
            f"Recruit {per_segment} people for each of these groups:\n{groups}",
            f"What they will be shown: {context[:600]}",
            "Mix stances inside every group: some open to it, some neutral, some skeptical. Real people are rarely all enthusiastic.",
            'JSON shape: {"people":[{"name":"first name and last initial","segment":"exactly one group name","bio":"1 sentence: who they are","stance":"supportive|neutral|skeptical"}]}',
        ]),
        validate=lambda o: validate_panel(o, segments, per_segment),
        temperature=0.9,
        max_tokens=6000,
    )


def roster(people):
    return "\n".join(f"#{p['id']} {p['name']} ({p['segment']}, {p['stance']}): {p['bio']}" for p in people)

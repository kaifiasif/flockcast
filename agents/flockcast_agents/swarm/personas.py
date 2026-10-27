"""
The simulated audience. With a model, one call turns the audience notes and past posts into varied,
specific people. Offline, a fixed mix is built from the audience lines so demos and tests run free.
"""
import re

from ..text import trimmed

DEFAULT_AUDIENCE = "\n".join([
    "Peers: people in the same field who reply with their own experience.",
    "Skeptics: followers who push back on claims that sound too neat or lack a source.",
    "Lurkers: people who like and repost but rarely reply.",
    "Newcomers: people seeing the author for the first time through a repost.",
])
STANCES = ("supportive", "skeptical", "neutral")
EXAMPLES_SHOWN = 15


def clamp(x, lo, hi):
    return min(max(x, lo), hi)


def _number_or(v, fallback):
    """Number(v) || fallback."""
    try:
        x = float(v) if not isinstance(v, bool) else float(int(v))
    except (TypeError, ValueError):
        return fallback
    return x if x == x and x != 0 else fallback


def validate_personas(o, n: int) -> list:
    """Model output is untrusted: every field is checked, clipped and defaulted before it is used."""
    lst = o.get("personas") if isinstance(o, dict) else None
    if not isinstance(lst, list) or len(lst) < 2:
        raise ValueError("expected {personas: [..]} with at least 2 entries")
    out = []
    for i, raw in enumerate(lst[:n]):
        p = raw if isinstance(raw, dict) else {}
        name = trimmed(p.get("name"), 40)
        if not name or not isinstance(p.get("bio"), str):
            raise ValueError(f"personas[{i}] needs name and bio")
        interests = p.get("interests")
        out.append({
            "id": i + 1,  # 0 is the author
            "name": name,
            "segment": trimmed(p.get("segment"), 40, "Follower"),
            "bio": trimmed(p.get("bio"), 300),
            "interests": [str(x)[:40] for x in interests][:6] if isinstance(interests, list) else [],
            "stance": p.get("stance") if p.get("stance") in STANCES else "neutral",
            "activity": clamp(_number_or(p.get("activity"), 0.5), 0.1, 1),
            "follows_author": p.get("follows_author") is not False and p.get("follows_creator") is not False,
        })
    return out


# a model writes about 25 detailed people per answer before it runs out of room
BATCH = 25


def generate_personas(llm, audience, examples, handle, platform, count, rng) -> list:
    if not llm:
        return offline_personas(audience, count, rng)
    if count > BATCH:
        crowd = generate_personas(llm, audience, examples, handle, platform, BATCH, rng)
        crowd += generate_personas(llm, audience, examples, handle, platform, count - BATCH, rng)
        return [{**p, "id": i + 1} for i, p in enumerate(crowd)]
    sample = "\n".join("- " + re.sub(r"\s+", " ", a["text"])[:240] for a in examples[:EXAMPLES_SHOWN]) or "- (no past posts given)"
    return llm.json(
        system="You design realistic, varied social media users for an audience simulation. Reply with JSON only.",
        user="\n\n".join([
            f"Create {count} distinct people on {platform['name']} who could plausibly see posts by {handle}.",
            f"How people behave on {platform['name']}: {platform['culture']}",
            f"Audience groups (spread the people across them):\n{(audience or DEFAULT_AUDIENCE).strip()}",
            f"What {handle} has posted before:\n{sample}",
            "Make them specific people with their own jobs, opinions and posting habits. Include a few who disagree easily, and a few who rarely post.",
            'JSON shape: {"personas":[{"name":"...","segment":"one of the groups","bio":"1-2 sentences","interests":["..."],"stance":"supportive|skeptical|neutral","activity":0.1-1.0,"follows_author":true|false}]}',
        ]),
        validate=lambda o: validate_personas(o, count),
        temperature=0.9,
    )


# keyword-matched archetypes for offline mode; only stance and activity matter there
ARCHETYPES = [
    (re.compile(r"skeptic|critic|push ?back|doubt|cynic", re.I), "skeptical", 0.7, True),
    (re.compile(r"lurk|silent|quiet", re.I), "neutral", 0.25, True),
    (re.compile(r"new|first time|stranger", re.I), "neutral", 0.45, False),
    (re.compile(r"peer|fan|creator|builder|friend|customer|user", re.I), "supportive", 0.65, True),
]


def offline_personas(audience, count, rng) -> list:
    lines = [l.strip() for l in (audience or DEFAULT_AUDIENCE).split("\n") if l.strip()][:8]
    out = []
    for i in range(count):
        line = lines[i % len(lines)]
        segment = re.sub(r"^[-*\s]+", "", line.split(":")[0])[:40] or "Follower"
        stance, activity, follows = next(((s, a, f) for rx, s, a, f in ARCHETYPES if rx.search(line)), ("neutral", 0.5, True))
        out.append({
            "id": i + 1,
            "name": f"{segment} {i // len(lines) + 1}",
            "segment": segment,
            "bio": line[:300],
            "interests": [],
            "stance": stance,
            "activity": clamp(activity + (rng() - 0.5) * 0.2, 0.1, 1),
            "follows_author": follows,
        })
    return out


# Rook the Contrarian: synthetic crowds are known to be too agreeable, so a tough crowd always has one
# reader who goes looking for the weakest claim
CRITIC = {
    "name": "Rook (harsh critic)",
    "segment": "Harsh critic",
    "bio": "Reads every post looking for the weakest claim and says so in public. Hard to impress, but fair when something holds up.",
    "interests": ["evidence", "clarity", "overclaiming"],
    "stance": "skeptical",
    "activity": 1.0,
    "follows_author": True,
}


def tough_crowd(personas, count):
    """Adds the critic in the last seat and makes sure at least a quarter of the crowd is skeptical."""
    crowd = [dict(p) for p in personas[: count - 1]]
    crowd.append({**CRITIC, "id": len(crowd) + 1})
    need = -(-count // 4)
    for p in reversed(crowd[:-1]):
        if sum(1 for x in crowd if x["stance"] == "skeptical") >= need:
            break
        if p["stance"] == "neutral":
            p["stance"] = "skeptical"
    return crowd


def cast_of(cast, limit=50):
    """A crowd handed back from an earlier rehearsal, so drafts can be compared on the same people.
    Checked field by field, since it round-trips through the caller."""
    if not isinstance(cast, list) or not 2 <= len(cast) <= limit:
        raise ValueError(f"cast must list 2 to {limit} people")
    out = []
    for i, p in enumerate(cast):
        if not isinstance(p, dict) or not trimmed(p.get("name"), 60):
            raise ValueError(f"cast[{i}] needs a name")
        out.append({
            "id": i + 1,
            "name": trimmed(p.get("name"), 60),
            "segment": trimmed(p.get("segment"), 60) or "Reader",
            "bio": trimmed(p.get("bio"), 300),
            "interests": [trimmed(x, 40) for x in (p.get("interests") or [])[:6] if isinstance(x, str)],
            "stance": p.get("stance") if p.get("stance") in STANCES else "neutral",
            "activity": _activity(p.get("activity")),
            "follows_author": p.get("follows_author") is not False,
        })
    return out


def _activity(v):
    try:
        return min(1.0, max(0.05, float(v)))
    except (TypeError, ValueError):
        return 0.5

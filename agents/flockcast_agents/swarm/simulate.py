"""
A small social-feed simulation. The author (agent 0) posts the draft word for word in round 0; in each
later round a random subset of people scrolls a ranked feed and acts. With a model, everyone active in
a round is decided in ONE call (about rounds + 2 calls per rehearsal, which fits free tiers). Offline,
a rule policy stands in and the result is labelled as an estimate.

Posts and actions use the same shapes as the MiroFish engine, so the summary reads both.
"""
import math
import re

from ..jsnum import imul, u32, utf16_units
from ..text import sentences_of, words

MAX_ACTIVE = 8
FEED_SIZE = 4
MAX_ACTIONS_PER_ROUND = 2
ACTION_TYPES = {"like": "LIKE_POST", "repost": "REPOST", "reply": "REPLY", "quote": "QUOTE_POST", "post": "CREATE_POST", "nothing": "DO_NOTHING"}


def rng_from(seed_text: str):
    """Seeded PRNG (FNV-1a seed, mulberry32 steps): the same draft and audience give the same run."""
    h = 2166136261
    for c in utf16_units(str(seed_text)):
        h = imul(h ^ c, 16777619)
    s = [u32(h)]

    def nxt() -> float:
        s[0] = u32(s[0] + 0x6D2B79F5)
        t = s[0]
        t = imul(t ^ (u32(t) >> 15), t | 1)
        t ^= t + imul(t ^ (u32(t) >> 7), t | 61)
        t = u32(t)
        return u32(t ^ (t >> 14)) / 4294967296

    return nxt


class World:
    def __init__(self, handle, draft, personas, platform):
        author = {"id": 0, "name": handle, "segment": "author", "bio": "The author. Posted the draft.", "interests": [], "stance": "supportive", "activity": 0, "follows_author": True}
        self.agents = [author, *personas]
        self.posts = []
        self.actions = []
        self.memory = {}  # agent id -> their last few actions, in words; used for the next round and for interviews
        self.acted = set()  # "agent:type:post" already done, so nobody likes the same post twice
        self.round = 0
        self.draft = draft
        self.platform = platform

    def agent(self, agent_id):
        return self.agents[agent_id] if 0 <= agent_id < len(self.agents) else None


def add_post(world, user_id, content, original_post_id=None, kind="post"):
    post = {
        "post_id": len(world.posts) + 1, "user_id": user_id, "original_post_id": original_post_id, "kind": kind,
        "content": content, "quote_content": None, "round": world.round,
        "num_likes": 0, "num_shares": 0, "num_dislikes": 0, "num_replies": 0, "num_quotes": 0,
    }
    if kind == "quote":
        post["quote_content"] = content
        post["content"] = ""
    world.posts.append(post)
    return post


def record(world, agent, type_, args, note):
    world.actions.append({"round_num": world.round, "agent_id": agent["id"], "agent_name": agent["name"], "action_type": type_, "action_args": args})
    log = world.memory.get(agent["id"], [])
    log.append(f"round {world.round}: {note}")
    world.memory[agent["id"]] = log[-4:]


def seed_draft(world):
    p = add_post(world, 0, world.draft)
    record(world, world.agents[0], "CREATE_POST", {"post_id": p["post_id"], "content": p["content"]}, "posted the draft")
    return p


def feed_for(world, agent):
    """Followers see the author; everyone else sees the draft only once it is reposted or argued about."""
    interests = words(" ".join([agent["bio"], *(agent.get("interests") or [])]))

    def overlap(ws):
        return sum(1 for w in ws if w in interests)

    scored = []
    for p in world.posts:
        if p["user_id"] == agent["id"]:
            continue
        if not (p["user_id"] != 0 or agent["follows_author"] or p["num_shares"] + p["num_quotes"] > 0 or p["num_replies"] > 1):
            continue
        engagement = math.log1p(p["num_likes"] + 2 * (p["num_shares"] + p["num_quotes"]) + 1.5 * p["num_replies"])
        fresh = -0.35 * (world.round - p["round"])
        from_author = 1.5 if p["user_id"] == 0 and agent["follows_author"] else 0
        scored.append((engagement + fresh + from_author + 0.3 * overlap(words(p["content"] or p["quote_content"])), p))
    scored.sort(key=lambda x: -x[0])  # stable, like Array.sort
    return [p for _, p in scored[:FEED_SIZE]]


def _post_id(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def apply(world, agent, decision, visible) -> bool:
    """Applies one decision if it is valid for what this person can see; model output is never trusted as-is."""
    type_ = ACTION_TYPES.get(str(decision.get("action") or "").lower())
    if not type_ or type_ == "DO_NOTHING":
        return False
    pid = decision.get("post_id")
    target = None if pid is None else next((p for p in visible if p["post_id"] == _post_id(pid)), None)
    text = re.sub(r"\s+", " ", str(decision.get("text") or "")).strip()[: world.platform["replyChars"]]
    if type_ != "CREATE_POST" and not target:
        return False
    if type_ in ("REPLY", "QUOTE_POST", "CREATE_POST") and not text:
        return False
    key = f"{agent['id']}:{type_}:{target['post_id'] if target else text}"
    if key in world.acted:
        return False
    world.acted.add(key)

    v = world.platform["verbs"]
    if type_ == "LIKE_POST":
        target["num_likes"] += 1
        record(world, agent, type_, {"post_id": target["post_id"]}, f"{v['like']}d post {target['post_id']}")
    elif type_ == "REPOST":
        target["num_shares"] += 1
        record(world, agent, type_, {"post_id": target["post_id"]}, f"{v['repost']}ed post {target['post_id']}")
    elif type_ in ("REPLY", "QUOTE_POST"):
        reply = type_ == "REPLY"
        add_post(world, agent["id"], text, target["post_id"], "reply" if reply else "quote")
        if reply:
            target["num_replies"] += 1
        else:
            target["num_quotes"] += 1
        args = {"post_id": target["post_id"], "content": text} if reply else {"post_id": target["post_id"], "quote_content": text}
        did = f"wrote a {v['reply']} on" if reply else f"{v['quote']}d"
        record(world, agent, type_, args, f'{did} post {target["post_id"]}: "{text[:80]}"')
    else:
        p = add_post(world, agent["id"], text)
        record(world, agent, type_, {"post_id": p["post_id"], "content": text}, f'posted: "{text[:80]}"')
    return True


def _author_of(world, p):
    if p["user_id"] == 0:
        return f"@{world.agents[0]['name']}"
    a = world.agent(p["user_id"])
    return a["name"] if a else f"person {p['user_id']}"


def _show(world, p):
    to = f" ({p['kind']} to post {p['original_post_id']})" if p["original_post_id"] else ""
    return f"[post {p['post_id']}] {_author_of(world, p)}{to} · {p['num_likes']} likes, {p['num_shares']} reposts, {p['num_replies']} replies\n{p['content'] or p['quote_content']}"


def llm_round(llm, world, active):
    platform = world.platform
    blocks = []
    for agent, visible in active:
        interests = f" Interests: {', '.join(agent['interests'])}." if agent.get("interests") else ""
        blocks.append("\n".join([
            f"## Person #{agent['id']}: {agent['name']} ({agent['segment']}, {agent['stance']})",
            agent["bio"] + interests,
            f"Their recent activity: {'; '.join(world.memory.get(agent['id']) or ['nothing yet'])}",
            "Their feed right now:",
            *[_show(world, p) for p in visible],
        ]))
    ids = {a["id"] for a, _ in active}
    v = platform["verbs"]

    def validate(o):
        lst = o.get("actions") if isinstance(o, dict) else None
        if not isinstance(lst, list):
            raise ValueError("expected {actions: [..]}")
        return [a for a in lst if isinstance(a, dict) and _post_id(a.get("agent_id")) in ids]

    return llm.json(
        system=" ".join([
            f"You simulate how specific people behave on {platform['name']} during one hour. {platform['culture']} Stay in each person's character and voice.",
            f'Most people mostly scroll: "nothing" and "like" ({v["like"]}) are the most common actions. {v["reply"][0].upper() + v["reply"][1:]}s are short and specific to the post.',
            "Skeptical people question claims that sound unsupported; supportive people add their own experience. Never invent facts about the author.",
            "Reply with JSON only.",
        ]),
        user="\n\n".join([
            f"Round {world.round}. For each person below, decide 0 to 2 actions on posts in THEIR feed.",
            f"Actions: like ({v['like']}), repost ({v['repost']}), reply ({v['reply']}), quote ({v['quote']}), post (a new post of their own), nothing.",
            *blocks,
            f'JSON shape: {{"actions":[{{"agent_id":1,"action":"like|repost|reply|quote|post|nothing","post_id":12,"text":"only for reply, quote, post (max {platform["replyChars"]} chars)"}}]}}',
        ]),
        validate=validate,
    )


CLAIMY = re.compile(r"\d|%|\b(percent|half|twice|double|triple|ten|twenty|thirty|forty|fifty|hundred|thousand|million|billion|always|never|every|nobody|everyone|all|most|proven|fact|guaranteed|best|only)\b", re.I)


def clip(t: str, n: int) -> str:
    """Shortens on a word boundary so quoted snippets never end mid-word."""
    return t if len(t) <= n else re.sub(r"\s+\S*$", "", t[:n]) + "…"


SKEPTIC_LINES = [
    lambda c: f'Where does "{c}" come from? Is there a source?',
    lambda c: f'"{c}" sounds too neat. What\'s the evidence?',
    lambda c: f'Not sure I buy "{c}". Says who?',
]


def offline_round(world, active, rng):
    """Offline rule policy. Deterministic given the rng; few, plain-worded reactions."""
    out = []
    for agent, visible in active:
        p = next((x for x in visible if f"{agent['id']}:LIKE_POST:{x['post_id']}" not in world.acted and f"{agent['id']}:REPLY:{x['post_id']}" not in world.acted), None)
        if not p:
            continue
        text = p["content"] or p["quote_content"] or ""
        # each skeptic picks one claim, so several skeptics don't all ask about the same sentence
        claims = [s for s in sentences_of(text) if CLAIMY.search(s)]
        r = rng()
        claim = claims[math.floor(r * len(claims))] if claims else None
        aid, pid = agent["id"], p["post_id"]
        if agent["stance"] == "skeptical" and claim and p["user_id"] == 0:
            out.append({"agent_id": aid, "action": "reply", "post_id": pid, "text": SKEPTIC_LINES[aid % len(SKEPTIC_LINES)](clip(claim, 70))})
        elif agent["stance"] == "skeptical":
            out.append({"agent_id": aid, "action": "like" if r < 0.25 else "nothing", "post_id": pid})
        elif agent["stance"] == "supportive":
            if r < 0.15:
                first = (sentences_of(text) or [""])[0]
                out.append({"agent_id": aid, "action": "reply", "post_id": pid, "text": f'Agree with "{clip(first, 100)}" Matches what I\'ve seen.'})
            else:
                out.append({"agent_id": aid, "action": "repost" if r < 0.4 else "like", "post_id": pid})
        else:
            out.append({"agent_id": aid, "action": "like" if r < 0.35 else "repost" if r < 0.43 else "nothing", "post_id": pid})
    return out


def simulate(llm, world, rounds, rng, on_round=None) -> int:
    seed_draft(world)
    for r in range(1, rounds + 1):
        world.round = r
        active = []
        for a in world.agents:
            # the rng is drawn for everyone in order, exactly as before, so runs stay reproducible
            if a["id"] != 0 and rng() < a["activity"]:
                active.append(a)
        active = [(a, feed_for(world, a)) for a in active[:MAX_ACTIVE]]
        active = [(a, vis) for a, vis in active if vis]
        if active:
            decisions = llm_round(llm, world, active) if llm else offline_round(world, active, rng)
            per_agent = {}
            for d in decisions:
                found = next(((a, vis) for a, vis in active if a["id"] == _post_id(d.get("agent_id"))), None)
                if not found or per_agent.get(found[0]["id"], 0) >= MAX_ACTIONS_PER_ROUND:
                    continue
                if apply(world, found[0], d, found[1]):
                    per_agent[found[0]["id"]] = per_agent.get(found[0]["id"], 0) + 1
        if on_round:
            on_round(r, rounds)
    return rounds

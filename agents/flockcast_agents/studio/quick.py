"""
Wren, the quick read: one model call imagines a handful of specific readers and how each reacts.
A published calibration test found a single call catches objections about as well as a small swarm, so
this is the cheap first pass. It builds the same feed shape as the crowd, so the rest of the report,
the editing crew and follower questions all work on it.
"""
from ..text import clean
from ..swarm.personas import STANCES

ACTIONS = {"like": "LIKE_POST", "repost": "REPOST", "reply": "REPLY", "quote": "QUOTE_POST", "nothing": None}


def quick_read(llm, draft, settings, platform, audience, critic):
    n = settings["personas"]
    v = platform["verbs"]

    def validate(o):
        lst = o.get("readers") if isinstance(o, dict) else None
        if not isinstance(lst, list) or len(lst) < 2:
            raise ValueError("expected {readers: [..]} with at least 2 people")
        out = []
        for i, r in enumerate(lst[:n]):
            r = r if isinstance(r, dict) else {}
            name = clean(r.get("name"), 40)
            if not name:
                raise ValueError(f"readers[{i}] needs a name")
            action = str(r.get("reaction") or "nothing").lower()
            text = clean(r.get("text"), platform["replyChars"])
            if action in ("reply", "quote") and not text:
                action = "like"
            out.append({
                "persona": {"id": i + 1, "name": name, "segment": clean(r.get("segment"), 40, "Reader"), "bio": clean(r.get("bio"), 300), "interests": [], "stance": r.get("stance") if r.get("stance") in STANCES else "neutral", "activity": 1, "follows_author": True},
                "action": action if action in ACTIONS else "nothing",
                "text": text if action in ("reply", "quote") else "",
            })
        return out

    readers = llm.json(
        system=f"You simulate how specific, different people on {platform['name']} react to a post in the first hour. {platform['culture']} Most people only scroll or {v['like']}; a few reply. Skeptical people question unsupported claims. Reply with JSON only.",
        user="\n\n".join([
            f'{settings["handle"]} is about to post:\n"""{draft}"""',
            f"Who reads it (spread people across these groups):\n{audience}",
            "Include one harsh critic who looks for the weakest claim." if critic else "",
            f"Imagine {n} distinct readers. For each: name, group, one-sentence bio, stance (supportive, skeptical or neutral), reaction (like, repost, reply, quote or nothing) and, for reply or quote, what they write (max {platform['replyChars']} characters, specific to a sentence of the post).",
            'JSON shape: {"readers":[{"name":"","segment":"","bio":"","stance":"skeptical","reaction":"reply","text":"..."}]}',
        ]),
        validate=validate,
        temperature=0.8,
    )
    posts = [{"post_id": 1, "user_id": 0, "original_post_id": None, "kind": "post", "content": draft, "quote_content": None, "round": 0, "num_likes": 0, "num_shares": 0, "num_dislikes": 0, "num_replies": 0, "num_quotes": 0}]
    actions = [{"round_num": 0, "agent_id": 0, "agent_name": settings["handle"], "action_type": "CREATE_POST", "action_args": {"post_id": 1, "content": draft}}]
    memory = {0: ["round 0: posted the draft"]}
    for r in readers:
        p, kind = r["persona"], ACTIONS[r["action"]]
        if not kind:
            memory[p["id"]] = ["read the post and scrolled on"]
            continue
        args = {"post_id": 1}
        if kind == "REPLY":
            args["content"] = r["text"]
            posts[0]["num_replies"] += 1
            posts.append({**posts[0], "post_id": len(posts) + 1, "user_id": p["id"], "original_post_id": 1, "kind": "reply", "content": r["text"], "round": 1, "num_likes": 0, "num_shares": 0, "num_replies": 0, "num_quotes": 0})
        elif kind == "QUOTE_POST":
            args["quote_content"] = r["text"]
            posts[0]["num_quotes"] += 1
        elif kind == "LIKE_POST":
            posts[0]["num_likes"] += 1
        elif kind == "REPOST":
            posts[0]["num_shares"] += 1
        actions.append({"round_num": 1, "agent_id": p["id"], "agent_name": p["name"], "action_type": kind, "action_args": args})
        memory[p["id"]] = [f"round 1: {r['action']}" + (f': "{r["text"][:80]}"' if r["text"] else "")]
    return [r["persona"] for r in readers], posts, actions, memory

"""
Turns a simulated feed (posts plus the actions people took) into what a person reads: counts on the
post, the replies, and which sentences drew them. Pure. engine/summarize.ts does the same for the
MiroFish backend; the two are checked against each other in the tests.
"""
from .jsnum import to_fixed
from .text import jaccard, stance_of, words

MATCH = 0.5


def _as_number(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return float("nan")


def find_draft_post(posts, draft):
    """The simulated post that is the author's draft. External engines may paraphrase it; callers surface that."""
    target = words(draft)
    best, best_score = None, 0.0
    for p in posts:
        if p.get("original_post_id"):
            continue
        s = jaccard(words(p.get("content")), target)
        if s > best_score:
            best, best_score = p, s
    return (best, best_score) if best_score >= MATCH else (None, best_score)


def summarize(draft, sentences=None, posts=(), actions=(), rounds=None):
    draft_post, similarity = find_draft_post(posts, draft)
    did = draft_post["post_id"] if draft_post else None

    def on_draft(a):
        args = a.get("action_args") or {}
        ref = args.get("post_id") if args.get("post_id") is not None else args.get("original_post_id")
        return did is not None and _as_number(ref) == _as_number(did)

    counts = {"likes": 0, "reposts": 0, "quotes": 0, "replies": 0, "dislikes": 0}
    replies = []
    for a in actions:
        if not on_draft(a):
            continue
        t = a["action_type"]
        if t == "LIKE_POST":
            counts["likes"] += 1
        elif t == "DISLIKE_POST":
            counts["dislikes"] += 1
        elif t == "REPOST":
            counts["reposts"] += 1
        elif t in ("QUOTE_POST", "REPLY"):
            kind = "reply" if t == "REPLY" else "quote"
            counts["replies" if kind == "reply" else "quotes"] += 1
            args = a.get("action_args") or {}
            text = args.get("quote_content") or args.get("content") or ""
            if text:
                replies.append({"agent_id": a["agent_id"], "agent_name": a.get("agent_name") or f"person {a['agent_id']}", "round": a.get("round_num"), "kind": kind, "text": text, "stance": stance_of(text)})
    if draft_post:
        counts["likes"] = max(counts["likes"], draft_post.get("num_likes") or 0)
        counts["reposts"] = max(counts["reposts"], draft_post.get("num_shares") or 0)
        counts["dislikes"] = max(counts["dislikes"], draft_post.get("num_dislikes") or 0)

    # conversation the draft sparked elsewhere in the feed: on-topic posts by others
    draft_words = words(draft)
    related = [
        {"agent_id": p["user_id"], "text": p["content"], "stance": stance_of(p["content"])}
        for p in posts
        if p is not draft_post and not p.get("original_post_id") and jaccard(words(p.get("content")), draft_words) >= 0.12
    ][:20]

    # which sentences the reactions are about: content-word overlap, best match wins
    reactions = replies + related
    per_sentence = [{"id": s.get("id"), "text": s["text"], "mentions": 0, "pushback": 0, "examples": []} for s in (sentences or [{"id": None, "text": draft}])]
    for r in reactions:
        rw = words(r["text"])
        numbers = [w for w in rw if any(c.isdigit() for c in w)]
        best, best_score = None, 0.0
        for s in per_sentence:
            sw = words(s["text"])
            # a reply that repeats a sentence's number ("where is the 40% from?") is about that sentence
            sc = jaccard(rw, sw) + (0.3 if any(n in sw for n in numbers) else 0)
            if sc > best_score:
                best, best_score = s, sc
        if not best or best_score < 0.08:
            continue
        best["mentions"] += 1
        if r["stance"] == "pushback":
            best["pushback"] += 1
        if len(best["examples"]) < 3:
            best["examples"].append(r["text"])

    pushback = sum(1 for r in reactions if r["stance"] == "pushback")
    return {
        "draft_seeded": draft_post is not None,
        "draft_match": to_fixed(similarity, 2),
        "agents": len({a["agent_id"] for a in actions}),
        "rounds": rounds,
        "total_actions": len(actions),
        "counts": counts,
        "replies": replies,
        "related": related,
        "sentences": per_sentence,
        "pushback_share": to_fixed(pushback / len(reactions), 2) if reactions else 0,
    }

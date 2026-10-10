"""
Echo the Herald: the first replies decide how a post does, so this drafts answers to the replies the
rehearsal produced, pushback first, in the author's voice. Answers never invent facts; where the author
needs a source or a number, the draft leaves a [placeholder]. Needs a model.
"""
from ..text import clean

MAX_REPLIES = 5


def pick(replies):
    """Pushback first, one per person."""
    out, seen = [], set()
    for r in sorted(replies, key=lambda r: r["stance"] != "pushback"):
        if r["agent_id"] in seen:
            continue
        seen.add(r["agent_id"])
        out.append(r)
    return out[:MAX_REPLIES]


def reply_prep(llm, draft, summary, platform, handle):
    chosen = pick(summary["replies"])
    if not llm or not chosen:
        return []
    listed = "\n".join(f'{i + 1}. {r["agent_name"]}: "{r["text"]}"' for i, r in enumerate(chosen))

    def validate(o):
        lst = o.get("answers") if isinstance(o, dict) else None
        if not isinstance(lst, list):
            raise ValueError("expected {answers: [..]}")
        out = {}
        for a in lst:
            if not isinstance(a, dict):
                continue
            try:
                i = int(a.get("reply")) - 1
            except (TypeError, ValueError):
                continue
            text = clean(a.get("answer"), platform["replyChars"])
            if 0 <= i < len(chosen) and text:
                out[i] = text
        return out

    got = llm.json(
        system=f"You help {handle} answer the first replies to their {platform['name']} post. Answers are short, warm and direct, in the author's voice, and concede a fair point. Never invent facts, numbers, links or sources: write [link] or [number] where the author must fill one in. Reply with JSON only.",
        user="\n\n".join([
            f'The post:\n"""{draft}"""',
            f"Replies to answer:\n{listed}",
            f"Write one answer for each (max {platform['replyChars']} characters).",
            'JSON shape: {"answers":[{"reply":1,"answer":"..."}]}',
        ]),
        validate=validate,
        temperature=0.5,
    )
    return [{"from": r["agent_name"], "agent_id": r["agent_id"], "reply": r["text"], "stance": r["stance"], "answer": got[i]} for i, r in enumerate(chosen) if i in got]

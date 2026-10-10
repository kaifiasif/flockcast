"""
Platform checks: plain rules about how each network treats a post (length limits, links, the LinkedIn
"see more" fold, hashtags, engagement bait). No model, so they work offline and cost nothing. They are
worded as tendencies, because no platform publishes its ranking.
"""
import re

LIMITS = {"x": 280, "threads": 500, "bluesky": 300, "linkedin": 3000}
HASHTAGS = {"x": 2, "linkedin": 5, "threads": 1, "bluesky": 3}
# LinkedIn shows roughly this many characters on desktop before "see more"
FOLD = 210

_LINK = re.compile(r"https?://\S+|\bwww\.\S+", re.I)
_TAG = re.compile(r"(?<!\w)#\w+")
_BAIT = re.compile(
    r"\b(comment|reply|type|drop)\s+[\"'“]?\w+[\"'”]?\s+(below|if|to|for)\b|\b(like|share|repost)\s+(this\s+)?if\b|\btag\s+(a|someone|\d+|three|two)\b|\bwho\s+agrees\b|\bagree\s*\?\s*$",
    re.I | re.M,
)
_PROMO = re.compile(r"\b(my|our)\s+(new\s+)?(app|product|startup|tool|saas|course|newsletter)\b|\bcheck (it|this) out\b|\bsign up\b|\blink in (bio|comments)\b", re.I)
_CAPS = re.compile(r"\b[A-Z]{3,}\b")
_EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")


def _check(id_, level, title, detail, excerpt=None):
    out = {"id": id_, "level": level, "title": title, "detail": detail}
    if excerpt is not None:
        out["excerpt"] = excerpt
    return out


def platform_checks(posts, platform):
    pid, name = platform["id"], platform["name"]
    text = "\n\n".join(posts)
    out = []

    limit = LIMITS.get(pid)
    if limit:
        long = [i + 1 for i, p in enumerate(posts) if len(p) > limit]
        if long:
            where = "This post is" if len(posts) == 1 else f"Part {', '.join(map(str, long))} of the thread {'is' if len(long) == 1 else 'are'}"
            out.append(_check("length", "warn", f"Too long for {name}", f"{where} over {name}'s {limit}-character limit, so it will be cut or refused."))

    if _LINK.search(text) and pid in ("x", "linkedin", "threads"):
        out.append(_check("link", "tip", "Link in the post", f"Posts with outside links often get less reach on {name}. Many people put the link in the first reply instead."))

    tags = _TAG.findall(text)
    most = HASHTAGS.get(pid)
    if most is not None and len(tags) > most:
        out.append(_check("hashtags", "tip", "Many hashtags", f"{len(tags)} hashtags. On {name}, more than {most} tends to read as spam."))

    if pid == "linkedin" and len(posts[0]) > FOLD:
        cut = re.sub(r"\s+\S*$", "", posts[0][:FOLD])
        out.append(_check("fold", "tip", "What shows before “see more”", "Most readers decide from these first lines. Make sure they carry the hook.", cut + "…"))

    if _BAIT.search(text):
        out.append(_check("bait", "warn", "Engagement bait", "Asking people to comment a word, tag friends or share \"if you agree\" is shown to fewer people on most networks, and readers notice it."))

    if pid == "reddit" and (_PROMO.search(text) or _LINK.search(text)):
        out.append(_check("promo", "warn", "Reads as self-promotion", "Many subreddits remove posts that promote your own product or link out. Lead with the useful part and check the subreddit's rules."))

    caps = [w for w in _CAPS.findall(text) if w not in ("AI", "API", "CEO", "CTO", "CFO", "USA", "SaaS", "FAQ", "URL", "PDF")]
    if len(caps) >= 3:
        out.append(_check("caps", "tip", "Shouting", f"{len(caps)} words in capitals. A few read as emphasis; more read as shouting."))

    emojis = len(_EMOJI.findall(text))
    if emojis > 6:
        out.append(_check("emoji", "tip", "Lots of emoji", f"{emojis} emoji. Heavy emoji use is one of the things readers associate with AI-written posts."))
    return out

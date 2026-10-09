"""
Canned findings for demos and tests, where the real sources cannot be reached. Every finding is
labelled as a sample and links nowhere real, so a report built on it cannot pass for research.
"""
_SAMPLES = [
    ("Ask: how do you test a post before it goes out?", "I rewrite every LinkedIn post five times and still have no idea how it will land. I would pay for something that tells me which line people will argue with."),
    ("Show: I built a tool that scores tweets", "Virality scores feel like horoscopes. A number out of 100 tells me nothing about what to change."),
    ("Ghostwriters, what do you charge?", "Most of my clients pay $1,500 a month for four posts a week. Anything that saves me a round of edits is worth $20 a month to me."),
    ("Taplio vs Hypefury vs Typefully", "Taplio is $39 a month and most of it is scheduling I already have. I only stayed for the post ideas."),
    ("Are AI writing tools making everything sound the same?", "Everything sounds the same now. My readers can tell when a post was written by a tool and they scroll right past."),
    ("What would make you trust an AI feedback tool?", "Show me why it thinks a line will flop. If it cannot point at the sentence, I will not trust the score."),
    ("Cheapest way to get feedback on drafts?", "I post drafts in a small group chat first. Free, but slow, and my friends are too nice."),
    ("Paying for creator tools in 2026", "I cancel anything over $15 a month unless it saves me an hour a week. Free trials without a card are the only ones I try."),
]
SAMPLES = [{"title": t, "text": x, "source": "Sample (demo)", "url": f"https://example.com/sample/{i + 1}", "date": None, "score": 100 - i * 10} for i, (t, x) in enumerate(_SAMPLES)]


class _Sample:
    name = "sample"

    def search(self, query, limit):
        return [dict(s) for s in SAMPLES[:limit]]


def sample_search():
    return _Sample()

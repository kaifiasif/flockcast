"""
Moderator Maple runs a simulated focus group: a small panel from each group hears the material, answers
the moderator's questions one at a time while hearing what the others said, and Maple writes up the
themes, where people agreed and split, and what each group took away. A rehearsal of the conversation,
not research data; the result says so.
"""
from ..text import clean
from .panel import build_panel, roster, segments_of
from .signals import signals

SENTIMENTS = ("positive", "mixed", "negative")
MAX_QUESTIONS = 5


def _validate_answers(o, people):
    raw = o.get("answers") if isinstance(o, dict) else None
    if not isinstance(raw, list):
        raise ValueError("expected {answers: [..]}")
    ids = {p["id"] for p in people}
    out, seen = [], set()
    for a in raw:
        if not isinstance(a, dict):
            continue
        try:
            pid = int(a.get("person"))
        except (TypeError, ValueError):
            continue
        text = clean(a.get("text"), 400)
        if pid in ids and pid not in seen and text:
            seen.add(pid)
            out.append({"person": pid, "text": text, "sentiment": a.get("sentiment") if a.get("sentiment") in SENTIMENTS else "mixed"})
    if len(out) < max(1, len(people) // 2):
        raise ValueError("fewer than half the panel answered")
    return out


def _offline_answers(people, question, sig):
    out = []
    for p in people:
        if p["stance"] == "supportive":
            text, mood = f"I'd go along with it. \"{sig['opener']}\" is the part that works for me.", "positive"
        elif p["stance"] == "skeptical":
            text = f"I'm not convinced. \"{sig['claim']}\" needs something behind it." if sig["claim"] and not sig["sourced"] else "I'd need a reason to care before I'd act on this."
            mood = "negative"
        else:
            text, mood = f"It's fine, but I'd want to know what it changes for me as one of the {p['segment'].lower()}.", "mixed"
        out.append({"person": p["id"], "text": text, "sentiment": mood})
    return out


def _ask(llm, inp, people, question, transcript):
    earlier = "\n".join(f"Q: {t['question']}\n" + "\n".join(f"  #{a['person']}: {a['text']}" for a in t["answers"][:12]) for t in transcript[-2:])
    return llm.json(
        system="You play every participant in a simulated focus group. Each answers in their own voice, from their own life, in 1-3 spoken sentences. They react to each other, disagree when they would, and never sound like marketing. Reply with JSON only.",
        user="\n\n".join(x for x in [
            f"Topic: {inp['topic']}",
            f"What the group was shown:\n{inp['material']}",
            f"Participants:\n{roster(people)}",
            f"Discussion so far:\n{earlier}" if earlier else "",
            f"The moderator asks: {question}",
            'JSON shape: {"answers":[{"person":1,"text":"...","sentiment":"positive|mixed|negative"}]} with one answer per participant.',
        ] if x),
        validate=lambda o: _validate_answers(o, people),
        temperature=0.9,
        max_tokens=5000,
    )


def _sentiment(answers, people):
    by_id = {p["id"]: p for p in people}

    def share(items):
        n = len(items) or 1
        return {s: round(sum(1 for a in items if a["sentiment"] == s) / n, 2) for s in SENTIMENTS}

    groups = []
    for seg in dict.fromkeys(p["segment"] for p in people):
        groups.append({"segment": seg, **share([a for a in answers if by_id[a["person"]]["segment"] == seg])})
    return {"overall": share(answers), "by_segment": groups}


def _validate_summary(o, people, segments):
    if not isinstance(o, dict):
        raise ValueError("expected an object")
    ids = {p["id"] for p in people}
    themes = []
    for t in o.get("themes") or []:
        if isinstance(t, dict) and clean(t.get("title"), 80):
            who = [int(x) for x in (t.get("people") or []) if isinstance(x, (int, float)) and int(x) in ids][:8]
            themes.append({"title": clean(t.get("title"), 80), "detail": clean(t.get("detail"), 400), "people": who})
    if not themes:
        raise ValueError("no themes")
    names = {s["name"].lower(): s["name"] for s in segments}
    by_segment = [
        {"segment": names[clean(g.get("segment"), 40).lower()], "takeaway": clean(g.get("takeaway"), 300)}
        for g in o.get("by_segment") or [] if isinstance(g, dict) and clean(g.get("segment"), 40).lower() in names and clean(g.get("takeaway"), 300)
    ]
    return {
        "themes": themes[:6],
        "agreement": clean(o.get("agreement"), 400) or None,
        "disagreement": clean(o.get("disagreement"), 400) or None,
        "by_segment": by_segment,
        "recommendations": [clean(r, 240) for r in o.get("recommendations") or [] if clean(r, 240)][:5],
    }


def _offline_summary(sentiment, sig):
    themes = []
    if sig["claim"] and not sig["sourced"]:
        themes.append({"title": "Claims need backing", "detail": f"Skeptical members questioned \"{sig['claim']}\" because nothing supports it.", "people": []})
    if not sig["ask"]:
        themes.append({"title": "No clear next step", "detail": "Nothing tells people what to do after reading.", "people": []})
    if sig["avg_sentence"] > 25:
        themes.append({"title": "Hard to follow", "detail": "Sentences run long, so the point arrives late.", "people": []})
    if not themes:
        themes.append({"title": "Reactions follow each person's starting stance", "detail": "Offline, the panel cannot react to the meaning of the material; add a model key for real discussion.", "people": []})
    worst = min(sentiment["by_segment"], key=lambda g: g["positive"] - g["negative"])
    return {
        "themes": themes,
        "agreement": None,
        "disagreement": f"{worst['segment']} was the coolest group.",
        "by_segment": [],
        "recommendations": [t["detail"] for t in themes[:3]],
    }


def run_focus_group(llm, inp, on_stage):
    segments = segments_of(inp.get("segments"), 4)
    questions = [clean(q, 300) for q in inp.get("questions") or [] if clean(q, 300)][:MAX_QUESTIONS]
    if not questions:
        raise ValueError("a focus group needs at least one question")
    per = max(2, -(-int(inp.get("panelists") or 8) // len(segments)))
    sig = signals(inp["material"])
    on_stage("preparing", 5)
    people = build_panel(llm, segments, per, f"{inp['topic']}: {inp['material']}")
    transcript = []
    for i, q in enumerate(questions):
        on_stage("running", 15 + round(70 * i / len(questions)))
        answers = _ask(llm, inp, people, q, transcript) if llm else _offline_answers(people, q, sig)
        transcript.append({"question": q, "answers": answers})
    on_stage("reporting", 88)
    every = [a for t in transcript for a in t["answers"]]
    sentiment = _sentiment(every, people)
    if llm:
        summary = llm.json(
            system="You are an experienced focus group moderator writing up a session for the client. Be specific and honest; quote nobody you did not hear. Reply with JSON only.",
            user="\n\n".join([
                f"Topic: {inp['topic']}\nMaterial:\n{inp['material']}",
                f"Participants:\n{roster(people)}",
                "Transcript:\n" + "\n".join(f"Q: {t['question']}\n" + "\n".join(f"  #{a['person']}: {a['text']}" for a in t["answers"]) for t in transcript),
                'JSON shape: {"themes":[{"title":"short","detail":"1-2 sentences","people":[ids who said it]}],"agreement":"where most agreed","disagreement":"where they split, and who","by_segment":[{"segment":"group name","takeaway":"1 sentence"}],"recommendations":["what to change, up to 5"]}',
            ]),
            validate=lambda o: _validate_summary(o, people, segments),
            temperature=0.4,
        )
    else:
        summary = _offline_summary(sentiment, sig)
    return {"panel": people, "transcript": transcript, "sentiment": sentiment, "summary": summary}

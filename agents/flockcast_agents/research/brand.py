"""
Ivy the Guardian checks a draft against the project's brand rules: words never to use, lines that must
appear (a disclaimer, a hashtag) and, with a model, whether it sounds like the brand's voice. Rule checks
are exact and free; the voice check only ever points at real sentences of the draft.
"""
import re

from ..text import clean, sentences_of


def rules_of(raw):
    if not isinstance(raw, dict):
        return None
    rules = {
        "voice": clean(raw.get("voice"), 600),
        "banned": [clean(w, 60) for w in raw.get("banned") or [] if clean(w, 60)][:50],
        "required": [clean(w, 120) for w in raw.get("required") or [] if clean(w, 120)][:10],
        "notes": clean(raw.get("notes"), 1000),
    }
    return rules if any(rules.values()) else None


def _sentence_with(sentences, rx):
    return next((s for s in sentences if rx.search(s)), None)


def rule_issues(text, rules):
    sentences = sentences_of(text) or [text]
    issues = []
    for w in rules.get("banned") or []:
        rx = re.compile(rf"(?<!\w){re.escape(w)}(?!\w)", re.I)
        hit = _sentence_with(sentences, rx)
        if hit:
            issues.append({"rule": f"Never say “{w}”", "level": "risk", "detail": f"“{w}” is on the brand's banned list.", "excerpt": hit[:240]})
    for w in rules.get("required") or []:
        if w.lower() not in text.lower():
            issues.append({"rule": f"Always include “{w}”", "level": "warn", "detail": f"The brand rules ask for “{w}” and it is missing.", "excerpt": None})
    return issues


def brand_check(llm, text, raw_rules):
    rules = rules_of(raw_rules)
    if not rules:
        return None
    issues = rule_issues(text, rules)
    voice = None
    if llm and (rules["voice"] or rules["notes"]):
        sentences = sentences_of(text) or [text]

        def validate(o):
            if not isinstance(o, dict) or not isinstance(o.get("fits"), bool):
                raise ValueError("expected {fits: true|false}")
            found = []
            for f in o.get("issues") or []:
                try:
                    s = sentences[int(f.get("sentence")) - 1]
                except (TypeError, ValueError, IndexError, AttributeError):
                    continue
                why = clean(f.get("why"), 240)
                if why:
                    found.append({"rule": clean(f.get("rule"), 80) or "Brand voice", "level": "warn", "detail": why, "excerpt": s[:240]})
            return {"fits": o["fits"], "why": clean(o.get("why"), 300)}, found[:5]

        voice, found = llm.json(
            system="You are a brand editor. Judge only against the rules given; do not add your own taste. Reply with JSON only.",
            user="\n\n".join(x for x in [
                f"Brand voice: {rules['voice']}" if rules["voice"] else "",
                f"Other rules: {rules['notes']}" if rules["notes"] else "",
                "Draft, one sentence per line:\n" + "\n".join(f"{i + 1}. {s}" for i, s in enumerate(sentences)),
                'JSON shape: {"fits":true,"why":"1 sentence","issues":[{"sentence":1,"rule":"which rule","why":"what breaks it"}]}',
            ] if x),
            validate=validate,
            temperature=0.2,
        )
        issues += found
    ok = not any(i["level"] == "risk" for i in issues) and (voice is None or voice["fits"])
    return {"ok": ok, "issues": issues, "voice": voice}

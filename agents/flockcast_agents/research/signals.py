"""
What offline studies can read from the text itself: claims without a source, long sentences, a clear
ask, talking to the reader. These drive the labelled offline estimates and nothing else.
"""
import re

from ..text import sentences_of

_CLAIM = re.compile(r"\d|%|\b(always|never|every|nobody|everyone|proven|guaranteed|best|only|fastest|#1|first)\b", re.I)
_SOURCE = re.compile(r"\b(according to|source|study|survey|report|data from|research by)\b|https?://", re.I)
_ASK = re.compile(r"\b(try|sign up|join|book|download|read|learn more|reply|start|get|buy|subscribe|register)\b", re.I)
_YOU = re.compile(r"\byou(r|rs)?\b", re.I)


def signals(text):
    sentences = sentences_of(text) or [str(text).strip()]
    words = len(str(text).split())
    claims = [s for s in sentences if _CLAIM.search(s)]
    return {
        "words": words,
        "avg_sentence": words / max(len(sentences), 1),
        "claim": claims[0] if claims else None,
        "sourced": bool(_SOURCE.search(text)),
        "ask": bool(_ASK.search(text)),
        "you": len(_YOU.findall(text)),
        "opener": sentences[0][:140] if sentences else "",
    }


def clamp(x, lo, hi):
    return min(max(x, lo), hi)

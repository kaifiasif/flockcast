"""Word and sentence helpers shared by the crowd and the summary. Mirrors engine/summarize.ts."""
import re

STOP = set(
    "a an the and or but if then so of to in on at for with by from as is are was were be been it its this that these those i you we they he she my your our their me us them not no do does did have has had just very really can will would should could about into than too also more most".split()
)
# letters and digits in any script, plus apostrophes (JS: /[\p{L}\p{N}']+/gu)
_WORD = re.compile(r"(?:[^\W_]|')+")
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def words(text) -> list:
    out = []
    for w in _WORD.findall(str(text or "").lower()):
        if (len(w) > 2 or any(c.isdigit() for c in w)) and w not in STOP:
            out.append(w)
    return out


def sentences_of(text) -> list:
    return [s.strip() for s in _SENTENCE_END.split(str(text)) if s.strip()]


def jaccard(a: list, b: list) -> float:
    A, B = set(a), set(b)
    if not A or not B:
        return 0.0
    n = len(A & B)
    return n / (len(A) + len(B) - n)


# a lexical cue only, and labelled as such in the UI; the report carries the nuance
_PUSHBACK = re.compile(
    r"\b(disagree|wrong|not true|sources?|citation|evidence|doubt|overstat\w*|misleading|actually|nope|hard to believe|cherry.?pick\w*|oversimplif\w*|depends|says who|made up|not sure|study|proof)\b"
    r"|\bwhere (is|are|does|did|do)\b[^.?!]*\bfrom\b|\?\s*$",
    re.IGNORECASE,
)


def stance_of(text: str) -> str:
    return "pushback" if _PUSHBACK.search(text) else "other"


def clean(v, max_len: int, fallback: str = "") -> str:
    """A model string, trimmed, whitespace collapsed and clipped; anything else gives the fallback."""
    if isinstance(v, str) and v.strip():
        return re.sub(r"\s+", " ", v.strip())[:max_len]
    return fallback


def trimmed(v, max_len: int, fallback: str = "") -> str:
    """Like clean() but keeps inner whitespace (persona fields)."""
    if isinstance(v, str) and v.strip():
        return v.strip()[:max_len]
    return fallback


def as_list(v, n: int) -> list:
    return list(v)[:n] if isinstance(v, list) else []


def num(v) -> float:
    """Number(v), with NaN read as 0 and negatives as 0."""
    try:
        x = float(v)
    except (TypeError, ValueError):
        return 0.0
    if x != x or x in (float("inf"), float("-inf")):
        return 0.0
    return max(0.0, x)

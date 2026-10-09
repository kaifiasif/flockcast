"""
Free web research. Hacker News (Algolia) and Reddit need no key; Tavily is optional and has a free
tier. Each adapter calls one fixed host, so no user input ever picks what the server fetches.
"""
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from .sample import sample_search

MAX_BODY = 2_000_000
TEXT = 600
SEARCH_SOURCES = ("hackernews", "reddit", "web", "sample")

ENTITIES = {"amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'", "nbsp": " ", "#x27": "'", "#39": "'", "#x2F": "/"}
_BREAK = re.compile(r"<(br|p|/p|li)[^>]*>", re.I)
_TAG = re.compile(r"<[^>]+>")
_ENTITY = re.compile(r"&(#x?[0-9a-f]+|\w+);", re.I)


def _entity(m):
    e = m.group(1)
    if e in ENTITIES:
        return ENTITIES[e]
    try:
        if e[:2].lower() == "#x":
            return chr(int(e[2:], 16))
        if e.startswith("#"):
            return chr(int(e[1:]))
    except (ValueError, OverflowError):
        pass
    return m.group(0)


def plain_text(html) -> str:
    """Search APIs return snippets of HTML; findings are plain text."""
    s = _BREAK.sub(" ", str(html))
    s = _TAG.sub("", s)
    s = _ENTITY.sub(_entity, s)
    return re.sub(r"\s+", " ", s).strip()


def iso_or_null(v):
    if not isinstance(v, str) or not v.strip():
        return None
    dt = None
    try:
        dt = datetime.fromisoformat(v.strip().replace("Z", "+00:00"))
    except ValueError:
        try:
            dt = parsedate_to_datetime(v)
        except (TypeError, ValueError):
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return _iso(dt)


def _iso(dt):
    """Date.toISOString(): UTC with milliseconds."""
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


class _Adapter:
    def __init__(self, user_agent="flockcast-agents/1.1", timeout=10):
        self.user_agent = user_agent
        self.timeout = timeout

    def _get_json(self, url, headers, data=None):
        req = urllib.request.Request(url, data=data, method="POST" if data is not None else "GET")
        for k, v in headers.items():
            req.add_header(k, v)
        # an explicit agent: some hosts block the default Python-urllib one
        req.add_header("user-agent", self.user_agent)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                raw = res.read(MAX_BODY + 1)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"HTTP {e.code}") from None
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise RuntimeError(str(getattr(e, "reason", e))) from None
        if len(raw) > MAX_BODY:
            raise RuntimeError("response too large")
        return json.loads(raw)


class HackerNews(_Adapter):
    """Stories and comments on Hacker News, through the public Algolia API."""
    name = "hackernews"

    def search(self, query, limit):
        qs = urllib.parse.urlencode({"query": query, "tags": "(story,comment)", "hitsPerPage": str(min(limit, 50))})
        body = self._get_json(f"https://hn.algolia.com/api/v1/search?{qs}", {"accept": "application/json"})
        out = []
        for h in (body.get("hits") if isinstance(body, dict) else None) or []:
            text = plain_text(h.get("comment_text") or h.get("story_text") or "")
            title = plain_text(h.get("title") or h.get("story_title") or "")
            if not text and not title:
                continue
            points = h.get("points")
            out.append({
                "source": "Hacker News", "title": title[:200], "text": (text or title)[:TEXT],
                "url": f"https://news.ycombinator.com/item?id={urllib.parse.quote(str(h.get('objectID')), safe='')}",
                "date": iso_or_null(h.get("created_at")),
                "score": points if isinstance(points, (int, float)) and not isinstance(points, bool) else None,
            })
        return out


class Reddit(_Adapter):
    """Posts across Reddit, through its public JSON search. Some hosts block it; the advisor carries on without."""
    name = "reddit"

    def search(self, query, limit):
        qs = urllib.parse.urlencode({"q": query, "limit": str(min(limit, 50)), "sort": "relevance", "t": "year", "raw_json": "1"})
        body = self._get_json(f"https://www.reddit.com/search.json?{qs}", {"accept": "application/json"})
        children = ((body.get("data") or {}).get("children") if isinstance(body, dict) else None) or []
        out = []
        for c in children:
            d = c.get("data") if isinstance(c, dict) else None
            if not isinstance(d, dict) or not isinstance(d.get("permalink"), str) or not d["permalink"].startswith("/r/"):
                continue
            title = plain_text(d.get("title") or "")
            text = plain_text(d.get("selftext") or "")
            created, score = d.get("created_utc"), d.get("score")
            out.append({
                "source": f"Reddit r/{str(d.get('subreddit') or '')[:40]}", "title": title[:200], "text": (text or title)[:TEXT],
                "url": f"https://www.reddit.com{d['permalink']}",
                "date": _iso(datetime.fromtimestamp(created, timezone.utc)) if isinstance(created, (int, float)) and not isinstance(created, bool) else None,
                "score": score if isinstance(score, (int, float)) and not isinstance(score, bool) else None,
            })
        return out


class Tavily(_Adapter):
    """The open web through Tavily (free tier, needs TAVILY_API_KEY)."""
    name = "web"

    def __init__(self, api_key, **kw):
        super().__init__(**{"timeout": 15, **kw})
        self.api_key = api_key

    def search(self, query, limit):
        data = json.dumps({"query": query, "max_results": min(limit, 20), "search_depth": "basic"}).encode()
        body = self._get_json("https://api.tavily.com/search", {"content-type": "application/json", "authorization": f"Bearer {self.api_key}"}, data)
        out = []
        for r in (body.get("results") if isinstance(body, dict) else None) or []:
            url = str(r.get("url") or "")
            if not re.match(r"^https?://", url):
                continue
            host = (urllib.parse.urlsplit(url).hostname or "")
            if not host:
                continue
            out.append({"source": re.sub(r"^www\.", "", host), "title": plain_text(r.get("title") or "")[:200], "text": plain_text(r.get("content") or "")[:TEXT], "url": url, "date": iso_or_null(r.get("published_date")), "score": None})
        return out


def adapters(names, env, user_agent="flockcast-agents/1.1"):
    """The sources the server already validated, by name."""
    out = []
    for name in names:
        if name == "hackernews":
            out.append(HackerNews(user_agent=user_agent))
        elif name == "reddit":
            out.append(Reddit(user_agent=f"{user_agent} (launch research)"))
        elif name == "web":
            key = env.get("TAVILY_API_KEY")
            if not key:
                raise ValueError('The "web" source needs TAVILY_API_KEY (free at tavily.com).')
            out.append(Tavily(key, user_agent=user_agent))
        elif name == "sample":
            out.append(sample_search())
        else:
            raise ValueError(f'Unknown advisor source "{name}". Use {", ".join(SEARCH_SOURCES)}.')
    return out

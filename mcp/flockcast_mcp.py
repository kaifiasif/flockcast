"""
Flockcast as an MCP server, so an AI assistant (Claude Desktop, Claude Code, Cursor and others) can
rehearse a post, compare drafts, run a focus group or test a crisis statement while it writes.

It speaks MCP over stdio and calls a Flockcast server's /api/v1 with one project key, so it can only
reach that project. Standard library only; Python 3.10+.

    FLOCKCAST_URL=https://your-flockcast.example FLOCKCAST_KEY=flk_... python3 mcp/flockcast_mcp.py
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

VERSION = "1.1.0"
PROTOCOL = "2025-06-18"
USER_AGENT = f"flockcast-mcp/{VERSION} (+https://github.com/kaifiasif/flockcast)"
# most assistants give a tool call a few minutes at most; longer runs hand back an id to check later
MAX_WAIT = 150
OUTPUT_LIMIT = 60_000

PLATFORMS = ["x", "linkedin", "threads", "bluesky", "reddit", "generic"]
STAKEHOLDERS = ["customers", "press", "critics", "employees", "investors", "regulators"]


class ApiError(Exception):
    pass


class Api:
    def __init__(self, url: str, key: str, timeout: float = 30):
        self.base = url.rstrip("/") + "/api/v1"
        self.key = key
        self.timeout = timeout

    def call(self, method: str, path: str, body: dict | None = None) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.key}")
        req.add_header("user-agent", USER_AGENT)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return json.loads(res.read())
        except urllib.error.HTTPError as e:
            try:
                message = json.loads(e.read())["error"]["message"]
            except Exception:
                message = f"Flockcast answered {e.code}"
            raise ApiError(message) from None
        except urllib.error.URLError as e:
            raise ApiError(f"Could not reach Flockcast at {self.base}: {e.reason}") from None


def _str(desc, **extra):
    return {"type": "string", "description": desc, **extra}


def _int(desc, lo, hi):
    return {"type": "integer", "description": desc, "minimum": lo, "maximum": hi}


WAIT = {"type": "boolean", "description": "Wait for the result (default true). Long runs still return an id to check with the matching get tool."}
SEGMENTS = {
    "type": "array",
    "description": "Groups of people, such as hard-to-reach buyers. Each has a name and a short description.",
    "items": {"type": "object", "properties": {"name": _str("Group name", maxLength=40), "about": _str("Who they are", maxLength=300)}, "required": ["name"]},
    "minItems": 1,
}
CROWD = {
    "audience": _str("Who reads this, one group per line, overriding the project's setup", maxLength=2000),
    "platform": _str("Where it will be posted", enum=PLATFORMS),
    "personas": _int("Crowd size (the plan sets the cap)", 2, 50),
    "rounds": _int("Simulation rounds", 1, 40),
    "critic": {"type": "boolean", "description": "Seat a harsh critic in the crowd (default true)"},
}

TOOLS = [
    {
        "name": "rehearse_post",
        "description": "Rehearse a social post on a simulated crowd before publishing. Returns how people reacted, who pushed back and why, sentence-level fixes and platform checks. A rehearsal, not a forecast.",
        "inputSchema": {"type": "object", "properties": {
            "text": _str("The post. Separate thread parts with a line holding only ---", maxLength=10000),
            "title": _str("A short name for it", maxLength=120),
            "subject": _str("Your id for the draft, so reruns form one history", maxLength=200),
            "mode": _str("'quick' is one fast read; 'crowd' (default) runs the full simulation", enum=["crowd", "quick"]),
            **CROWD,
            "force": {"type": "boolean", "description": "Run again even if this exact draft was rehearsed"},
            "wait": WAIT,
        }, "required": ["text"]},
    },
    {
        "name": "get_rehearsal",
        "description": "Read a rehearsal by id, with its result once done.",
        "inputSchema": {"type": "object", "properties": {"id": _str("Rehearsal id")}, "required": ["id"]},
    },
    {
        "name": "ask_follower",
        "description": "Ask one simulated follower from a finished rehearsal a question, such as why they pushed back. agent_id is a persona id from the rehearsal.",
        "inputSchema": {"type": "object", "properties": {
            "rehearsal_id": _str("Rehearsal id"),
            "agent_id": _int("Persona id", 1, 10000),
            "prompt": _str("The question", maxLength=1000),
        }, "required": ["rehearsal_id", "agent_id", "prompt"]},
    },
    {
        "name": "compare_drafts",
        "description": "Rehearse two or three versions of a post on the same crowd, so differences come from the text. Returns each result and which one the crowd preferred.",
        "inputSchema": {"type": "object", "properties": {
            "drafts": {"type": "array", "minItems": 2, "maxItems": 3, "items": {"type": "object", "properties": {"text": _str("Draft text", maxLength=10000), "title": _str("Label", maxLength=120)}, "required": ["text"]}},
            **CROWD,
            "wait": WAIT,
        }, "required": ["drafts"]},
    },
    {
        "name": "record_outcome",
        "description": "After posting for real, record the actual likes, reposts, replies and quotes on a rehearsal so the project keeps score of how close rehearsals come.",
        "inputSchema": {"type": "object", "properties": {
            "rehearsal_id": _str("Rehearsal id"),
            "likes": _int("Likes", 0, 1_000_000_000), "reposts": _int("Reposts", 0, 1_000_000_000),
            "replies": _int("Replies", 0, 1_000_000_000), "quotes": _int("Quotes", 0, 1_000_000_000),
            "impressions": _int("Impressions, if known", 0, 1_000_000_000),
            "note": _str("Anything worth remembering", maxLength=500),
        }, "required": ["rehearsal_id", "likes", "reposts", "replies"]},
    },
    {
        "name": "calibration",
        "description": "How closely this project's rehearsals have matched real results so far.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "focus_group",
        "description": "Run a simulated focus group: a panel from the groups you name answers up to five questions about your material. Returns themes with quotes, agreement, splits by group and what to change.",
        "inputSchema": {"type": "object", "properties": {
            "topic": _str("What the session is about", maxLength=120),
            "material": _str("What the group sees: a post, page copy, a pitch", maxLength=4000),
            "questions": {"type": "array", "items": _str("A question", maxLength=300), "minItems": 1, "maxItems": 5},
            "segments": {**SEGMENTS, "maxItems": 4},
            "panelists": _int("Panel size", 4, 12),
            "wait": WAIT,
        }, "required": ["topic", "material", "questions", "segments"]},
    },
    {
        "name": "message_test",
        "description": "Test two to four versions of a message across audience groups. Every group counts the same; returns scores by group, the winner and any split.",
        "inputSchema": {"type": "object", "properties": {
            "messages": {"type": "array", "minItems": 2, "maxItems": 4, "items": {"type": "object", "properties": {"label": _str("Label", maxLength=40), "text": _str("Version text", maxLength=2000)}, "required": ["text"]}},
            "segments": {**SEGMENTS, "maxItems": 5},
            "per_segment": _int("People per group", 2, 10),
            "goal": _str("What the message should do", maxLength=300),
            "wait": WAIT,
        }, "required": ["messages", "segments"]},
    },
    {
        "name": "crisis_rehearsal",
        "description": "Rehearse a holding statement with stakeholders such as customers, press and critics. Returns heat per group, the line each would quote, statement checks and a revision that adds no new facts.",
        "inputSchema": {"type": "object", "properties": {
            "situation": _str("What happened", maxLength=2000),
            "statement": _str("The statement you plan to put out", maxLength=3000),
            "stakeholders": {"type": "array", "items": {"type": "string", "enum": STAKEHOLDERS}, "minItems": 1},
            "rounds": _int("1, or 2 to see how it spreads", 1, 2),
            "wait": WAIT,
        }, "required": ["situation", "statement"]},
    },
    {
        "name": "get_study",
        "description": "Read a focus group, message test or crisis rehearsal by id, with its result once done.",
        "inputSchema": {"type": "object", "properties": {"id": _str("Study id")}, "required": ["id"]},
    },
    {
        "name": "launch_advice",
        "description": "Ask the launch crew for market research, simulated buyer reactions, a price and a launch plan for a product.",
        "inputSchema": {"type": "object", "properties": {
            "product": _str("Product name", maxLength=120),
            "pitch": _str("What it does and for whom, at least 20 characters", maxLength=2000),
            "audience": _str("Who buys it", maxLength=1000),
            "price_idea": _str("A price you have in mind", maxLength=200),
            "competitors": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
            "wait": WAIT,
        }, "required": ["product", "pitch"]},
    },
    {
        "name": "get_advice",
        "description": "Read a launch advisor run by id, with its report once done.",
        "inputSchema": {"type": "object", "properties": {"id": _str("Advice id")}, "required": ["id"]},
    },
]

for t in TOOLS:
    t["annotations"] = {"readOnlyHint": t["name"].startswith("get_") or t["name"] == "calibration", "openWorldHint": False}


def _pick(args: dict, *keys) -> dict:
    return {k: args[k] for k in keys if args.get(k) is not None}


def _brief_rehearsal(r: dict) -> dict:
    """Drops the bulk an assistant does not need (the full timeline), keeping ids for follow-up questions."""
    res = r.get("result")
    if not isinstance(res, dict):
        return r
    keep = {k: v for k, v in res.items() if k not in ("related", "replies", "personas")}
    keep["personas"] = [{k: p.get(k) for k in ("id", "name", "segment", "stance")} for p in res.get("personas", [])]
    keep["replies"] = res.get("replies", [])[:12]
    return {**r, "result": keep}


class Server:
    def __init__(self, api: Api, sleep=time.sleep, clock=time.monotonic, every: float = 2):
        self.api = api
        self.sleep = sleep
        self.clock = clock
        self.every = every

    def _wait(self, read, item: dict, wait) -> dict:
        if wait is False:
            return item
        until = self.clock() + MAX_WAIT
        while item.get("status") not in ("done", "failed") and self.clock() < until:
            self.sleep(self.every)
            item = read()
        if item.get("status") not in ("done", "failed"):
            item = {**item, "note": "Still running. Check again with the matching get tool and this id."}
        return item

    def call(self, name: str, a: dict):
        api = self.api
        if name == "rehearse_post":
            body = _pick(a, "text", "title", "subject", "mode", "audience", "platform", "personas", "rounds", "critic", "force")
            r = api.call("POST", "/rehearsals", body)["rehearsal"]
            return _brief_rehearsal(self._wait(lambda: api.call("GET", f"/rehearsals/{r['id']}")["rehearsal"], r, a.get("wait")))
        if name == "get_rehearsal":
            return _brief_rehearsal(api.call("GET", f"/rehearsals/{_id(a, 'id')}")["rehearsal"])
        if name == "ask_follower":
            return api.call("POST", f"/rehearsals/{_id(a, 'rehearsal_id')}/interview", _pick(a, "agent_id", "prompt"))["interview"]
        if name == "compare_drafts":
            started = api.call("POST", "/comparisons", _pick(a, "drafts", "audience", "platform", "personas", "rounds", "critic"))
            gid = started["group_id"]
            with_status = lambda g: {**g, "status": _group_status(g.get("rehearsals", []))}
            group = self._wait(lambda: with_status(api.call("GET", f"/comparisons/{gid}")), with_status(started), a.get("wait"))
            pick = _pick_of(group.get("rehearsals", []))
            return {**group, "crowd_pick": pick and pick.get("variant"), "rehearsals": [_brief_rehearsal(r) for r in group.get("rehearsals", [])]}
        if name == "record_outcome":
            return api.call("PUT", f"/rehearsals/{_id(a, 'rehearsal_id')}/outcome", _pick(a, "likes", "reposts", "replies", "quotes", "impressions", "note"))
        if name == "calibration":
            return api.call("GET", "/calibration")["calibration"]
        if name in ("focus_group", "message_test", "crisis_rehearsal"):
            kind = "crisis" if name == "crisis_rehearsal" else name
            fields = {
                "focus_group": ("topic", "material", "questions", "segments", "panelists"),
                "message_test": ("messages", "segments", "per_segment", "goal"),
                "crisis": ("situation", "statement", "stakeholders", "rounds"),
            }[kind]
            s = api.call("POST", "/studies", {"kind": kind, **_pick(a, *fields)})["study"]
            return self._wait(lambda: api.call("GET", f"/studies/{s['id']}")["study"], s, a.get("wait"))
        if name == "get_study":
            return api.call("GET", f"/studies/{_id(a, 'id')}")["study"]
        if name == "launch_advice":
            adv = api.call("POST", "/advice", _pick(a, "product", "pitch", "audience", "price_idea", "competitors"))["advice"]
            return self._wait(lambda: api.call("GET", f"/advice/{adv['id']}")["advice"], adv, a.get("wait"))
        if name == "get_advice":
            return api.call("GET", f"/advice/{_id(a, 'id')}")["advice"]
        raise KeyError(name)

    def handle(self, msg: dict):
        """One JSON-RPC message in, one response out (None for notifications)."""
        method, mid, params = msg.get("method"), msg.get("id"), msg.get("params") or {}
        if mid is None:
            return None
        if method == "initialize":
            asked = params.get("protocolVersion")
            return _ok(mid, {
                "protocolVersion": asked if isinstance(asked, str) else PROTOCOL,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "flockcast", "version": VERSION},
                "instructions": "Flockcast rehearses posts and messages on simulated people. Results are a rehearsal, not a prediction; say so when you report them.",
            })
        if method == "ping":
            return _ok(mid, {})
        if method == "tools/list":
            return _ok(mid, {"tools": TOOLS})
        if method == "tools/call":
            name, args = params.get("name"), params.get("arguments") or {}
            if not any(t["name"] == name for t in TOOLS):
                return _err(mid, -32602, f"Unknown tool: {name}")
            if not isinstance(args, dict):
                return _err(mid, -32602, "arguments must be an object")
            try:
                out = self.call(name, args)
            except (ApiError, ValueError) as e:
                return _ok(mid, {"content": [{"type": "text", "text": str(e)}], "isError": True})
            text = json.dumps(out, ensure_ascii=False, indent=1)
            if len(text) > OUTPUT_LIMIT:
                text = text[:OUTPUT_LIMIT] + "\n... (cut short; read the full result in the Flockcast app)"
            return _ok(mid, {"content": [{"type": "text", "text": text}]})
        return _err(mid, -32601, f"Method not found: {method}")


def _id(a: dict, key: str) -> str:
    v = a.get(key)
    # ids are uuids; anything else could steer the request path
    if not isinstance(v, str) or not all(c in "0123456789abcdefABCDEF-" for c in v) or not 1 <= len(v) <= 64:
        raise ValueError(f"{key} must be an id from an earlier result")
    return v


def _group_status(rehearsals: list) -> str:
    states = {r.get("status") for r in rehearsals}
    return "done" if rehearsals and states <= {"done", "failed"} else "running"


def _score(r: dict) -> float:
    """Engagement per follower, weighting shares over likes. Mirrors engine/calibration.ts."""
    x = r.get("result") or {}
    c = x.get("counts") or {}
    return (c.get("likes", 0) + 2 * c.get("reposts", 0) + 2 * c.get("quotes", 0) + c.get("replies", 0)) / max(1, x.get("agents") or 1)


def _pick_of(rehearsals: list):
    """The draft this crowd engaged with most, once every draft is done; fewer pushbacks break a tie."""
    done = [r for r in rehearsals if r.get("status") == "done" and r.get("result")]
    if len(done) < 2 or len(done) < len(rehearsals):
        return None
    return min(done, key=lambda r: (-_score(r), r["result"].get("pushback_share", 1)))


def _ok(mid, result):
    return {"jsonrpc": "2.0", "id": mid, "result": result}


def _err(mid, code, message):
    return {"jsonrpc": "2.0", "id": mid, "error": {"code": code, "message": message}}


def main():
    url, key = os.environ.get("FLOCKCAST_URL", "").strip(), os.environ.get("FLOCKCAST_KEY", "").strip()
    if not url or not key:
        print("Set FLOCKCAST_URL and FLOCKCAST_KEY (a project key from API and webhooks).", file=sys.stderr)
        sys.exit(2)
    server = Server(Api(url, key), every=float(os.environ.get("FLOCKCAST_POLL_SECONDS") or 2))
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            reply = _err(None, -32700, "Parse error")
        else:
            reply = server.handle(msg) if isinstance(msg, dict) else _err(None, -32600, "Invalid request")
        if reply is not None:
            sys.stdout.write(json.dumps(reply) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()

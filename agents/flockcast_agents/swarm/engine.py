"""
The built-in audience simulator ("swarm"): personas, feed rounds, report. Written from MiroFish's
documented workflow, not its code. The Node server hands over the post, the settings and the platform;
this returns the result and the state interviews need later.
"""
from ..jsnum import js_round, to_fixed
from ..studio.editor import fixes
from ..studio.norms import platform_checks
from ..studio.quick import quick_read
from ..studio.replies import reply_prep
from ..studio.slop import ai_check
from ..summarize import summarize
from .personas import DEFAULT_AUDIENCE, generate_personas, tough_crowd
from .report import interview_persona, write_report
from .simulate import World, rng_from, simulate


class JobError(Exception):
    """A failure the person should see as-is, with an HTTP-like status for the server."""

    def __init__(self, message, status=500):
        super().__init__(message)
        self.status = status


def draft_of(posts):
    """Joins thread parts as "1/3 ...", so the simulation sees one post, as followers would see the opener."""
    return "\n\n".join(f"{i + 1}/{len(posts)} {p}" if len(posts) > 1 else p for i, p in enumerate(posts))


def crowd_mood(summary, personas):
    """How friendly the crowd was. Simulated crowds lean agreeable, so a very friendly one gets a warning."""
    c = summary["counts"]
    total = c["likes"] + c["reposts"] + c["quotes"] + c["replies"]
    pushback = sum(1 for r in summary["replies"] if r["stance"] == "pushback")
    friendliness = to_fixed((total - pushback) / total, 2) if total else None
    stances = {s: sum(1 for p in personas if p["stance"] == s) for s in ("supportive", "skeptical", "neutral")}
    warning = None
    if total >= 3 and friendliness is not None and friendliness >= 0.85 and summary["pushback_share"] < 0.1:
        warning = "This crowd agreed with almost everything. Real readers are rarely this kind, so treat it as the best case."
    return {"friendliness": friendliness, "stances": stances, "warning": warning}


def _studio(llm, posts, draft, summary, settings, platform, on_stage):
    """The editing crew. Each part is useful but not essential: a failure is noted and the rest carry on."""
    out, errors = {"checks": platform_checks(posts, platform)}, {}

    def attempt(key, fn, fallback):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001
            errors[key] = str(e)[:300]
            return fallback

    on_stage("reporting", 92)
    out["ai_check"] = attempt("ai_check", lambda: ai_check(llm, posts, platform), None)
    out["fixes"] = attempt("fixes", lambda: fixes(llm, summary, out["ai_check"] or {"flags": []}, platform, settings["handle"]), [])
    on_stage("reporting", 96)
    out["reply_prep"] = attempt("reply_prep", lambda: reply_prep(llm, draft, summary, platform, settings["handle"]), [])
    if errors:
        out["studio_errors"] = errors
    return out


def rehearse(llm, payload, on_stage):
    inp, settings, platform = payload["input"], payload["settings"], payload["platform"]
    posts = inp.get("posts") or []
    if not posts or any(not str(p).strip() for p in posts):
        raise JobError("Nothing to rehearse: the post is empty.", 400)
    draft = draft_of(posts)
    critic = settings.get("critic") is True
    quick = settings.get("mode") == "quick" and llm is not None
    # studio extras are opt-in, so callers from before them get exactly the old result
    studio = settings.get("studio") is True

    on_stage("preparing", 5)
    if quick:
        personas, feed_posts, actions, memory = quick_read(llm, draft, settings, platform, (settings.get("audience") or DEFAULT_AUDIENCE).strip(), critic)
        on_stage("running", 60)
        rounds = 1
    else:
        rng = rng_from(f"{draft}|{settings.get('audience') or ''}|{platform['id']}|{settings['personas']}")
        n = settings["personas"]
        personas = generate_personas(llm, settings.get("audience"), inp.get("examples") or [], settings["handle"], platform, n - 1 if critic else n, rng)
        if critic:
            personas = tough_crowd(personas, n)

        on_stage("running", 20)
        world = World(settings["handle"], draft, personas, platform)
        rounds = simulate(llm, world, settings["rounds"], rng, on_round=lambda r, n: on_stage("running", 20 + js_round(65 * r / n)))
        feed_posts, actions, memory = world.posts, world.actions, world.memory

    on_stage("reporting", 88)
    summary = summarize(draft, inp.get("sentences"), feed_posts, actions, rounds)
    report, report_error = None, None
    # the report is useful but not essential: keep the simulation if it fails
    try:
        report = {"markdown": write_report(llm, settings["handle"], draft, summary, _Feed(actions, platform), len(personas))}
    except Exception as e:  # noqa: BLE001
        report_error = str(e)
    result = {
        **summary,
        "agents": len(personas),
        "engine": "swarm" if llm else "swarm-offline",
        "model": llm.model if llm else None,
        "model_calls": 0,
        "platform": platform["id"],
        "personas": [{k: p[k] for k in ("id", "name", "segment", "stance", "bio")} for p in personas],
        "report": report,
    }
    if report_error:
        result["report_error"] = report_error
    if studio:
        result["mode"] = "quick" if quick else "crowd"
        result["critic"] = personas[-1]["id"] if critic and not quick else None
        result["crowd"] = crowd_mood(summary, personas)
        result.update(_studio(llm, posts, draft, summary, settings, platform, on_stage))
    result["model_calls"] = llm.calls if llm else 0
    state = {"draft": draft, "handle": settings["handle"], "platform": platform["id"], "personas": personas, "memory": {str(k): v for k, v in memory.items()}}
    return {"result": result, "state": state}


class _Feed:
    """What the report reads: the actions and the platform, from either the crowd or the quick read."""

    def __init__(self, actions, platform):
        self.actions = actions
        self.platform = platform


def interview(llm, payload):
    if not llm:
        raise JobError("Interviews need a model key.", 409)
    state, agent_id = payload.get("state") or {}, payload["agent_id"]
    persona = next((p for p in state.get("personas") or [] if p.get("id") == agent_id), None)
    if not persona:
        raise JobError(f"There is no simulated person #{agent_id}.", 404)
    history = (state.get("memory") or {}).get(str(agent_id)) or []
    return {"answer": interview_persona(llm, state["handle"], state["draft"], persona, history, payload["question"], payload["platform"])}

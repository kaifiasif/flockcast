"""
The built-in audience simulator ("swarm"): personas, feed rounds, report. Written from MiroFish's
documented workflow, not its code. The Node server hands over the post, the settings and the platform;
this returns the result and the state interviews need later.
"""
from ..jsnum import js_round
from ..summarize import summarize
from .personas import generate_personas
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


def rehearse(llm, payload, on_stage):
    inp, settings, platform = payload["input"], payload["settings"], payload["platform"]
    posts = inp.get("posts") or []
    if not posts or any(not str(p).strip() for p in posts):
        raise JobError("Nothing to rehearse: the post is empty.", 400)
    draft = draft_of(posts)
    rng = rng_from(f"{draft}|{settings.get('audience') or ''}|{platform['id']}|{settings['personas']}")

    on_stage("preparing", 5)
    personas = generate_personas(llm, settings.get("audience"), inp.get("examples") or [], settings["handle"], platform, settings["personas"], rng)

    on_stage("running", 20)
    world = World(settings["handle"], draft, personas, platform)
    rounds = simulate(llm, world, settings["rounds"], rng, on_round=lambda r, n: on_stage("running", 20 + js_round(65 * r / n)))

    on_stage("reporting", 88)
    summary = summarize(draft, inp.get("sentences"), world.posts, world.actions, rounds)
    report, report_error = None, None
    # the report is useful but not essential: keep the simulation if it fails
    try:
        report = {"markdown": write_report(llm, settings["handle"], draft, summary, world, len(personas))}
    except Exception as e:  # noqa: BLE001
        report_error = str(e)
    result = {
        **summary,
        "agents": len(personas),
        "engine": "swarm" if llm else "swarm-offline",
        "model": llm.model if llm else None,
        "model_calls": llm.calls if llm else 0,
        "platform": platform["id"],
        "personas": [{k: p[k] for k in ("id", "name", "segment", "stance", "bio")} for p in personas],
        "report": report,
    }
    if report_error:
        result["report_error"] = report_error
    state = {"draft": draft, "handle": settings["handle"], "platform": platform["id"], "personas": personas, "memory": {str(k): v for k, v in world.memory.items()}}
    return {"result": result, "state": state}


def interview(llm, payload):
    if not llm:
        raise JobError("Interviews need a model key.", 409)
    state, agent_id = payload.get("state") or {}, payload["agent_id"]
    persona = next((p for p in state.get("personas") or [] if p.get("id") == agent_id), None)
    if not persona:
        raise JobError(f"There is no simulated person #{agent_id}.", 404)
    history = (state.get("memory") or {}).get(str(agent_id)) or []
    return {"answer": interview_persona(llm, state["handle"], state["draft"], persona, history, payload["question"], payload["platform"])}

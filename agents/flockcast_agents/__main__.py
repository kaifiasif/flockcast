"""
Runs one job for the Node server and exits:

    python3 -m flockcast_agents rehearse|interview|advise|summarize  < payload.json

The payload comes in on stdin as JSON. Progress and the answer go out on stdout as JSON lines:
{"type":"stage","status":"running","progress":40}, then one {"type":"result",...} or
{"type":"error","message":"...","status":500}. Nothing listens on a port; the server owns storage.
"""
import json
import os
import sys

from .advisor.pipeline import run_advice
from .advisor.search import adapters
from .llm import Llm, LlmError
from .summarize import summarize
from .swarm.engine import JobError, interview, rehearse

JOBS = ("rehearse", "interview", "advise", "summarize")


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def run(job, payload, env):
    llm = Llm.from_env(env)
    on_stage = lambda status, progress: emit({"type": "stage", "status": status, "progress": progress})  # noqa: E731
    if job == "rehearse":
        return rehearse(llm, payload, on_stage)
    if job == "interview":
        return interview(llm, payload)
    if job == "summarize":
        # for the MiroFish backend, whose feed has the same shape as the crowd's
        return {"summary": summarize(payload["draft"], payload.get("sentences"), payload.get("posts") or [], payload.get("actions") or [], payload.get("rounds"))}
    sources = adapters(payload.get("sources") or [], env, user_agent=env.get("FLOCKCAST_USER_AGENT", "flockcast-agents/1.1"))
    return {"result": run_advice(llm, payload["input"], sources, on_stage)}


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 1 or argv[0] not in JOBS:
        emit({"type": "error", "message": f"usage: python3 -m flockcast_agents {'|'.join(JOBS)} < payload.json", "status": 400})
        return 2
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        emit({"type": "result", **run(argv[0], payload, os.environ)})
        return 0
    except JobError as e:
        emit({"type": "error", "message": str(e), "status": e.status})
    except (LlmError, ValueError) as e:
        emit({"type": "error", "message": str(e)[:500], "status": 502 if isinstance(e, LlmError) else 400})
    except Exception as e:  # noqa: BLE001 - the server shows a clean message; details stay out of it
        emit({"type": "error", "message": f"The agent failed ({type(e).__name__}).", "status": 500})
        print(repr(e), file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())

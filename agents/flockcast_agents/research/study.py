"""One entry point for the study job, so Node starts every kind the same way."""
from .crisis import run_crisis
from .focus_group import run_focus_group
from .message_test import run_message_test

KINDS = ("focus_group", "message_test", "crisis")


def run_study(llm, payload, on_stage):
    kind, inp = payload.get("kind"), payload.get("input") or {}
    if kind not in KINDS:
        raise ValueError(f"kind must be one of {', '.join(KINDS)}")
    if kind == "focus_group":
        body = run_focus_group(llm, inp, on_stage)
    elif kind == "message_test":
        body = run_message_test(llm, inp, payload.get("brand"), on_stage)
    else:
        body = run_crisis(llm, inp, on_stage)
    return {"kind": kind, "engine": "swarm" if llm else "swarm-offline", "model": llm.model if llm else None, "model_calls": llm.calls if llm else 0, **body}

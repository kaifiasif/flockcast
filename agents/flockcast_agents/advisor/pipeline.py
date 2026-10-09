"""
One advisor run, start to finish. With a model: plan searches, search, read the market, ask the
buyers, price, decide (four model calls). Without one: the searches still run on the founder's own
words and the report shows what was found, labelled as research only.
"""
from ..jsnum import js_round
from .buyers import ask_buyers, reception_of
from .planner import decide, pricing_of
from .pricing import price_points, price_range
from .research import offline_queries, plan_queries, read_market, search_all


def run_advice(llm, inp, sources, on_step=lambda status, progress: None):
    def step(status, share):
        on_step(status, js_round(share * 100))

    step("researching", 0.05)
    queries = plan_queries(llm, inp) if llm else offline_queries(inp)
    findings, searched = search_all(sources, queries)
    step("researching", 0.3)

    base = {"mode": "full" if llm else "offline", "model": llm.model if llm else None, "model_calls": 0, "queries": queries, "searched": searched, "findings": findings, "market": None, "buyers": [], "reception": None, "pricing": None, "plan": None}
    if not llm:
        return base

    market = read_market(llm, inp, findings)
    step("simulating", 0.45)
    buyers = ask_buyers(llm, inp, market)
    reception = reception_of(buyers)
    rng = price_range([b["prices"] for b in buyers])
    step("deciding", 0.75)
    decision = decide(llm, inp, market, reception, rng, price_points(rng, inp["billing"], inp["currency"]) if rng else None, findings)
    return {**base, "model_calls": llm.calls, "market": market, "buyers": buyers, "reception": reception, "pricing": pricing_of(inp, rng, decision) if rng else None, "plan": decision["plan"]}

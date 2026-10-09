"""
Lord Ledger: price sensitivity from the simulated buyers' four answers (Van Westendorp), and the prices
people are used to seeing. Pure functions: the numbers come from the answers, never from the model's say-so.
"""
import math

from ..jsnum import js_round, round2

KEYS = ("too_cheap", "bargain", "expensive", "too_expensive")


def ordered(a):
    """Each buyer's answers sorted into order, so a muddled answer still reads as a range."""
    return dict(zip(KEYS, sorted(max(0, a[k]) for k in KEYS)))


def _share(xs, test):
    return sum(1 for x in xs if test(x)) / len(xs)


def _crossing(grid, a, b):
    """The price where two curves cross: the grid point with the smallest gap."""
    best, gap = grid[0], math.inf
    for p in grid:
        g = abs(a(p) - b(p))
        if g < gap - 1e-9:
            gap, best = g, p
    return best


def price_range(answers):
    every = [x for x in (ordered(a) for a in answers) if x["too_expensive"] > 0]
    if len(every) < 3:
        return None
    tc, ch, ex, te = ([a[k] for a in every] for k in KEYS)
    top = max(te)
    grid = [top * 1.2 * i / 400 for i in range(401)]
    too_cheap = lambda p: _share(tc, lambda x: x >= p)  # noqa: E731
    cheap = lambda p: _share(ch, lambda x: x >= p)  # noqa: E731
    expensive = lambda p: _share(ex, lambda x: x <= p)  # noqa: E731
    too_expensive = lambda p: _share(te, lambda x: x <= p)  # noqa: E731
    low = _crossing(grid, too_cheap, lambda p: 1 - cheap(p))
    high = _crossing(grid, too_expensive, lambda p: 1 - expensive(p))
    optimal = _crossing(grid, too_cheap, too_expensive)
    indifferent = _crossing(grid, cheap, expensive)
    return {"low": round2(min(low, high)), "high": round2(max(low, high)), "optimal": round2(optimal), "indifferent": round2(indifferent)}


def _anchors():
    """Prices people are used to: 9, 19, 49, 99, 149, 499, 999... and 0.99 to 8.99 below that."""
    out = [0.99, 1.99, 2.99, 3.99, 4.99, 5.99, 6.99, 7.99, 8.99]
    out += range(9, 100, 10)
    out += range(149, 1000, 50)
    out += range(1499, 10000, 500)
    out += range(14999, 100000, 5000)
    return out


ANCHORS = _anchors()
# rupee prices end in 9 at whole hundreds: 99, 199, 499, 999, 1,499
INR_ANCHORS = [9, 19, 29, 49, 79, 99, *range(149, 1000, 50), *range(1499, 100000, 500)]


def friendly_price(v, currency):
    if v <= 0:
        return 0
    anchors = INR_ANCHORS if currency == "INR" else ANCHORS
    best = anchors[0]
    for a in anchors:
        if abs(math.log(a / v)) < abs(math.log(best / v)):
            best = a
    return best


def price_points(rng, billing, currency):
    """The hero sits between the optimal and the indifference price, kept inside the acceptable range; the top plan is about 2.5x that."""
    mid = (rng["optimal"] + rng["indifferent"]) / 2
    hero = friendly_price(min(max(mid, rng["low"]), rng["high"]) or rng["optimal"], currency)
    top = friendly_price(hero * 2.5, currency)
    yearly = (lambda m: js_round(m * 12 * 0.8)) if billing == "subscription" else (lambda m: None)
    return {"hero": hero, "top": top, "heroYearly": yearly(hero), "topYearly": yearly(top)}

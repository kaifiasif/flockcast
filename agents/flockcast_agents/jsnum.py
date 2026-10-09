"""
JavaScript number behaviour where results must match the TypeScript engine they replaced: the
seeded random generator works on 32-bit integers, and rounding helpers follow Math.round/toFixed.
"""
import math
from decimal import ROUND_HALF_UP, Decimal

MASK = 0xFFFFFFFF


def imul(a: int, b: int) -> int:
    """Math.imul: 32-bit multiply, as a signed result."""
    r = ((a & MASK) * (b & MASK)) & MASK
    return r - 0x100000000 if r & 0x80000000 else r


def u32(x: int) -> int:
    return x & MASK


def i32(x: int) -> int:
    x &= MASK
    return x - 0x100000000 if x & 0x80000000 else x


def js_round(x: float) -> int:
    """Math.round: halves go up, toward +infinity."""
    return math.floor(x + 0.5)


def to_fixed(x: float, digits: int) -> float:
    """Number(x.toFixed(digits)). Exact ties round away from zero, as toFixed does (0.125 -> 0.13)."""
    return float(Decimal(x).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP))


def round2(x: float) -> float:
    """Math.round(x * 100) / 100."""
    return js_round(x * 100) / 100


def utf16_units(s: str):
    """charCodeAt(0) of each code point, as `for (const c of s)` sees them."""
    for ch in s:
        cp = ord(ch)
        yield cp if cp < 0x10000 else 0xD800 + ((cp - 0x10000) >> 10)

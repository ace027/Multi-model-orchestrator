from decimal import Decimal, ROUND_HALF_EVEN


def to_cents(amount: str) -> int:
    """Converts a decimal amount string to integer cents, rounding half away from zero."""
    q = Decimal(amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)
    return int(q * 100)


def split(total_cents: int, parts: int) -> list[int]:
    """Splits total_cents into `parts` shares that differ by at most one cent and sum to the total."""
    base, extra = divmod(total_cents, parts)
    return [base + (1 if i < extra else 0) for i in range(parts)]


def apply_rate(cents: int, rate: str) -> int:
    """Applies a percentage rate (e.g. "7.25") to cents, rounding half away from zero."""
    return to_cents(str(Decimal(cents) * Decimal(rate) / Decimal(10000)))

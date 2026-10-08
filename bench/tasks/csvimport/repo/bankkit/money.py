from decimal import Decimal


def to_cents(amount: Decimal) -> int:
    """Converts an exact decimal amount to integer cents. More than two decimal places is a ValueError."""
    if amount.as_tuple().exponent < -2 and amount != amount.quantize(Decimal("0.01")):
        raise ValueError(f"{amount} has more than two decimal places")
    return int(amount * 100)

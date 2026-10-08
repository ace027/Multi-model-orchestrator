from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Transaction:
    date: date
    amount_cents: int  # negative for money out
    description: str
    currency: str  # ISO 4217 code, e.g. "USD"

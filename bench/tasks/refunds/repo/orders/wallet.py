class Wallet:
    """Store credit. Refunds are paid out as credit."""

    def __init__(self):
        self.entries: list[tuple[str, int, str]] = []  # (customer, cents, reference)

    def credit(self, customer: str, cents: int, ref: str) -> None:
        if cents <= 0:
            raise ValueError("credit must be positive")
        self.entries.append((customer, cents, ref))

    def balance(self, customer: str) -> int:
        return sum(c for who, c, _ in self.entries if who == customer)

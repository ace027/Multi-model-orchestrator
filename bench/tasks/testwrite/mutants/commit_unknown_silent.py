class OutOfStock(Exception):
    pass


class Inventory:
    """Tracks on-hand and reserved units per SKU.

    - restock(sku, n): adds n units (n must be > 0, else ValueError).
    - reserve(sku, n, order_id): holds n units for an order. Raises OutOfStock if fewer than n
      units are available (on hand minus reserved). Reserving again for the same order adds to it.
    - release(order_id): drops all of an order's holds. Unknown orders are ignored.
    - commit(order_id): ships an order's holds: removes the units from on-hand and drops the holds.
      Raises KeyError for an unknown order.
    - available(sku): on hand minus reserved, never negative.
    """

    def __init__(self):
        self.on_hand: dict[str, int] = {}
        self.holds: dict[str, dict[str, int]] = {}

    def restock(self, sku: str, n: int) -> None:
        if n <= 0:
            raise ValueError("restock amount must be positive")
        self.on_hand[sku] = self.on_hand.get(sku, 0) + n

    def reserved(self, sku: str) -> int:
        return sum(h.get(sku, 0) for h in self.holds.values())

    def available(self, sku: str) -> int:
        return max(0, self.on_hand.get(sku, 0) - self.reserved(sku))

    def reserve(self, sku: str, n: int, order_id: str) -> None:
        if n > self.available(sku):
            raise OutOfStock(f"{sku}: wanted {n}, {self.available(sku)} available")
        order = self.holds.setdefault(order_id, {})
        order[sku] = order.get(sku, 0) + n

    def release(self, order_id: str) -> None:
        self.holds.pop(order_id, None)

    def commit(self, order_id: str) -> None:
        order = self.holds.pop(order_id, {})
        for sku, n in order.items():
            self.on_hand[sku] -= n

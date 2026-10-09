from orders.models import Order, Refund


class Store:
    def __init__(self):
        self.orders: dict[str, Order] = {}
        self.refunds: dict[str, Refund] = {}  # refund id -> refund
        self.by_key: dict[tuple[str, str], str] = {}  # (customer, idempotency key) -> refund id
        self.pending_notifications: list[str] = []  # refund ids whose notification must be retried
        self._seq = 0

    def next_refund_id(self) -> str:
        self._seq += 1
        return f"R{self._seq}"

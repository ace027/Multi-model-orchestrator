from orders.models import Refund
from orders.notify import Notifier
from orders.pricing import line_charge
from orders.store import Store
from orders.wallet import Wallet


class UnknownOrder(Exception):
    pass


class RefundError(Exception):
    """The request cannot be honoured as asked."""


class OverRefund(RefundError):
    """The request asks for more units than can be refunded."""


class RefundService:
    def __init__(self, store: Store, wallet: Wallet, notifier: Notifier):
        self.store = store
        self.wallet = wallet
        self.notifier = notifier

    def refund(self, order_id: str, units: dict[str, int] | None, key: str) -> Refund:
        """Refunds units (sku -> count) of an order, or everything refundable when units is None.
        See docs/refunds.md."""
        order = self.store.orders.get(order_id)
        if order is None:
            raise UnknownOrder(order_id)
        done = self.store.by_key.get((order.customer, key))
        if done is not None:
            return self.store.refunds[done]

        if units is None:
            units = {line.sku: line.qty for line in order.lines}
        if not units:
            raise RefundError("nothing to refund")
        amounts = {}
        for sku, n in units.items():
            try:
                line = order.line(sku)
            except KeyError:
                raise RefundError(f"order {order.id} has no {sku}") from None
            if n <= 0:
                raise RefundError(f"{sku}: units must be positive")
            if n > order.shipped.get(sku, 0):
                raise OverRefund(f"{sku}: {n} requested, {order.shipped.get(sku, 0)} shipped")
            amounts[sku] = line_charge(line, n)

        refund = Refund(self.store.next_refund_id(), order.id, dict(units), sum(amounts.values()))
        self.wallet.credit(order.customer, refund.cents, refund.id)
        self.notifier.refund_issued(order.customer, refund.id)
        for sku, n in units.items():
            order.refunded[sku] = order.refunded.get(sku, 0) + n
            order.refunded_cents[sku] = order.refunded_cents.get(sku, 0) + amounts[sku]
        self.store.refunds[refund.id] = refund
        self.store.by_key[(order.customer, key)] = refund.id
        return refund

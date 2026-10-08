from orders.models import Line, Order
from orders.notify import Notifier
from orders.refunds import RefundService
from orders.store import Store
from orders.wallet import Wallet


def setup(*orders: Order):
    store, wallet, notifier = Store(), Wallet(), Notifier()
    for o in orders:
        store.orders[o.id] = o
    return store, wallet, notifier, RefundService(store, wallet, notifier)


def mugs(shipped: int = 2) -> Order:
    """Two mugs at $10.00 plus 10% tax, and a $5.00 untaxed card."""
    return Order("O1", "C1", [Line("mug", 2, 1000, 1000), Line("card", 1, 500)], shipped={"mug": shipped, "card": 1})

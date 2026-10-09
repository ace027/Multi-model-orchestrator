"""Hidden check for the refunds task: 18 cases from docs/refunds.md and the tickets, pass at 80%.
Usage: check.py <work dir>. Exit 0 = success."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from grade import check  # noqa: E402

HIDDEN = r'''
import unittest

from orders.api import handle_refund
from orders.models import Line, Order
from orders.notify import Notifier, NotifyError
from orders.pricing import line_charge
from orders.refunds import RefundService
from orders.store import Store
from orders.wallet import Wallet


class FlakyNotifier(Notifier):
    """Fails the first `failures` calls, like the mail outage in T-102."""

    def __init__(self, failures=1):
        super().__init__()
        self.failures = failures

    def refund_issued(self, customer, refund_id):
        if self.failures:
            self.failures -= 1
            raise NotifyError("mail provider down")
        super().refund_issued(customer, refund_id)


def lamps(shipped=1):
    return Order("O-17", "C-17", [Line("lamp", 3, 4000, 825)], shipped={"lamp": shipped})


def widgets():
    return Order("O-301", "C-3", [Line("widget", 3, 110, 500)], shipped={"widget": 3})


def mugs():
    return Order("O1", "C1", [Line("mug", 2, 1000, 1000), Line("card", 1, 500)], shipped={"mug": 2, "card": 1})


class Hidden(unittest.TestCase):
    def setUp(self):
        self.store, self.wallet = Store(), Wallet()
        self.notifier = Notifier()

    def svc(self, *orders):
        for o in orders:
            self.store.orders[o.id] = o
        return RefundService(self.store, self.wallet, self.notifier)

    def post(self, svc, order_id, key, units=None):
        payload = {"order_id": order_id, "key": key}
        if units is not None:
            payload["units"] = units
        return handle_refund(svc, payload)

    # T-101 / policy 1
    def test_refund_all_pays_only_shipped_units(self):
        o = lamps(shipped=1)
        status, body = self.post(self.svc(o), "O-17", "k")
        self.assertEqual((status, body["cents"], body["units"]), (200, line_charge(o.lines[0], 1), {"lamp": 1}))

    def test_refund_all_with_nothing_shipped_is_400(self):
        self.assertEqual(self.post(self.svc(lamps(shipped=0)), "O-17", "k")[0], 400)
        self.assertEqual(self.wallet.balance("C-17"), 0)

    def test_refund_all_after_partial_refund_pays_the_rest(self):
        svc = self.svc(mugs())
        self.post(svc, "O1", "k1", {"mug": 1})
        status, body = self.post(svc, "O1", "k2")
        self.assertEqual((status, body["units"], body["cents"]), (200, {"mug": 1, "card": 1}, 1100 + 500))

    def test_refund_all_when_everything_refunded_is_400(self):
        svc = self.svc(mugs())
        self.post(svc, "O1", "k1")
        self.assertEqual(self.post(svc, "O1", "k2")[0], 400)
        self.assertEqual(self.wallet.balance("C1"), 2700)

    # T-102 / policies 4 and 5
    def test_notification_failure_still_succeeds(self):
        self.notifier = FlakyNotifier()
        status, body = self.post(self.svc(mugs()), "O1", "k", {"mug": 1})
        self.assertEqual((status, body["cents"]), (200, 1100))

    def test_notification_failure_is_queued(self):
        self.notifier = FlakyNotifier()
        status, body = self.post(self.svc(mugs()), "O1", "k", {"mug": 1})
        self.assertEqual(self.store.pending_notifications, [body.get("refund_id")])

    def test_retry_after_failure_pays_once(self):
        self.notifier = FlakyNotifier()
        svc = self.svc(mugs())
        self.post(svc, "O1", "rk", {"mug": 1})
        self.post(svc, "O1", "rk", {"mug": 1})
        self.assertEqual(self.wallet.balance("C1"), 1100)
        self.assertEqual(len(self.wallet.entries), 1)

    def test_retry_returns_the_same_refund(self):
        self.notifier = FlakyNotifier()
        svc = self.svc(mugs())
        first = self.post(svc, "O1", "rk", {"mug": 1})
        again = self.post(svc, "O1", "rk", {"mug": 1})
        self.assertEqual(again[0], 200)
        if first[0] == 200:
            self.assertEqual(again, first)

    def test_failed_notification_does_not_lose_refunded_units(self):
        self.notifier = FlakyNotifier()
        svc = self.svc(mugs())
        self.post(svc, "O1", "k1", {"mug": 2})
        self.assertEqual(self.post(svc, "O1", "k2", {"mug": 1})[0], 409)

    # policy 2 (not in a ticket)
    def test_second_request_cannot_exceed_shipped(self):
        svc = self.svc(mugs())
        self.assertEqual(self.post(svc, "O1", "k1", {"mug": 2})[0], 200)
        self.assertEqual(self.post(svc, "O1", "k2", {"mug": 1})[0], 409)
        self.assertEqual(self.wallet.balance("C1"), 2200)

    def test_over_refund_is_rejected_whole(self):
        svc = self.svc(mugs())
        self.post(svc, "O1", "k1", {"mug": 1})
        self.assertEqual(self.post(svc, "O1", "k2", {"mug": 2, "card": 1})[0], 409)
        self.assertEqual((self.wallet.balance("C1"), self.store.orders["O1"].refunded.get("card", 0)), (1100, 0))

    def test_refunds_within_shipped_across_requests(self):
        svc = self.svc(mugs())
        self.assertEqual([self.post(svc, "O1", k, {"mug": 1})[0] for k in ("k1", "k2")], [200, 200])

    # T-103 / policy 3
    def test_unit_refunds_add_up_to_the_charge(self):
        svc = self.svc(widgets())
        paid = [self.post(svc, "O-301", f"k{i}", {"widget": 1})[1]["cents"] for i in range(3)]
        self.assertEqual(sum(paid), line_charge(widgets().lines[0], 3))

    def test_two_then_one_add_up_to_the_charge(self):
        o = Order("O-5", "C-5", [Line("gadget", 3, 115, 500)], shipped={"gadget": 3})  # 2 units 242, 3 units 362
        svc = self.svc(o)
        a = self.post(svc, "O-5", "k1", {"gadget": 2})[1]["cents"]
        b = self.post(svc, "O-5", "k2", {"gadget": 1})[1]["cents"]
        self.assertEqual((a, a + b), (242, 362))

    def test_full_refund_pays_the_charge(self):
        o = lamps(shipped=3)
        self.assertEqual(self.post(self.svc(o), "O-17", "k")[1]["cents"], line_charge(o.lines[0], 3))

    # policy 6 and unchanged behaviour
    def test_rejected_key_can_be_reused(self):
        svc = self.svc(mugs())
        self.assertEqual(self.post(svc, "O1", "k", {"mug": 3})[0], 409)
        status, body = self.post(svc, "O1", "k", {"mug": 1})
        self.assertEqual((status, body.get("cents")), (200, 1100))

    def test_bad_requests(self):
        svc = self.svc(mugs())
        self.assertEqual([self.post(svc, "nope", "k")[0], self.post(svc, "O1", "k", {"lamp": 1})[0], self.post(svc, "O1", "k", {"mug": 0})[0]], [404, 400, 400])
        self.assertEqual(self.wallet.entries, [])

    def test_same_key_other_customer_is_separate(self):
        o2 = mugs()
        o2.id, o2.customer = "O2", "C2"
        svc = self.svc(mugs(), o2)
        self.post(svc, "O1", "k", {"mug": 1})
        self.assertEqual(self.post(svc, "O2", "k", {"card": 1})[1]["cents"], 500)
'''

sys.exit(check(sys.argv[1], HIDDEN))

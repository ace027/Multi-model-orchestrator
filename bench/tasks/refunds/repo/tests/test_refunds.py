import unittest

from orders.api import handle_refund
from tests.helpers import mugs, setup


class RefundTest(unittest.TestCase):
    def test_full_refund_of_shipped_order(self):
        store, wallet, notifier, svc = setup(mugs())
        status, body = handle_refund(svc, {"order_id": "O1", "key": "k1"})
        self.assertEqual((status, body["cents"]), (200, 2200 + 500))
        self.assertEqual(wallet.balance("C1"), 2700)
        self.assertEqual(notifier.sent, [("C1", body["refund_id"])])

    def test_partial_refund(self):
        store, wallet, notifier, svc = setup(mugs())
        status, body = handle_refund(svc, {"order_id": "O1", "key": "k1", "units": {"mug": 1}})
        self.assertEqual((status, body["cents"]), (200, 1100))

    def test_same_key_is_replayed(self):
        store, wallet, notifier, svc = setup(mugs())
        first = handle_refund(svc, {"order_id": "O1", "key": "k1", "units": {"mug": 1}})
        again = handle_refund(svc, {"order_id": "O1", "key": "k1", "units": {"mug": 1}})
        self.assertEqual(first, again)
        self.assertEqual(wallet.balance("C1"), 1100)

    def test_unknown_order(self):
        self.assertEqual(handle_refund(setup()[3], {"order_id": "nope", "key": "k"})[0], 404)

    def test_unknown_sku(self):
        self.assertEqual(handle_refund(setup(mugs())[3], {"order_id": "O1", "key": "k", "units": {"lamp": 1}})[0], 400)

    def test_more_than_shipped(self):
        store, wallet, notifier, svc = setup(mugs(shipped=1))
        self.assertEqual(handle_refund(svc, {"order_id": "O1", "key": "k", "units": {"mug": 2}})[0], 409)
        self.assertEqual(wallet.balance("C1"), 0)

    def test_missing_key(self):
        self.assertEqual(handle_refund(setup(mugs())[3], {"order_id": "O1"})[0], 400)

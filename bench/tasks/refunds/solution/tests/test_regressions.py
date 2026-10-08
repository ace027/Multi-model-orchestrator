import unittest

from orders.api import handle_refund
from tests.helpers import mugs, setup


class RegressionTest(unittest.TestCase):
    def test_refund_all_only_shipped(self):
        store, wallet, notifier, svc = setup(mugs(shipped=1))
        self.assertEqual(handle_refund(svc, {"order_id": "O1", "key": "k"})[1]["cents"], 1100 + 500)

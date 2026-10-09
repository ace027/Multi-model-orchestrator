import tempfile
import unittest
from datetime import date
from pathlib import Path

from bankkit.models import Transaction
from bankkit.store import Store


class StoreTest(unittest.TestCase):
    def test_add_and_list(self):
        s = Store({"chk": "USD"})
        t = Transaction(date(2026, 9, 1), -350, "Coffee", "USD")
        s.add("chk", t)
        self.assertEqual(s.transactions("chk"), [t])

    def test_currency_mismatch(self):
        with self.assertRaises(ValueError):
            Store({"chk": "USD"}).add("chk", Transaction(date(2026, 9, 1), 1, "x", "EUR"))

    def test_unknown_account(self):
        with self.assertRaises(KeyError):
            Store().transactions("nope")

    def test_round_trip(self):
        s = Store({"chk": "USD", "sav": "EUR"})
        s.add("chk", Transaction(date(2026, 9, 1), -350, "Coffee", "USD"))
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "s.json"
            s.save(p)
            t = Store.load(p)
        self.assertEqual(t.transactions("chk"), s.transactions("chk"))
        self.assertEqual(t.currency("sav"), "EUR")

import unittest
from invlib.stock import Stock, StockError


class StockTest(unittest.TestCase):
    def test_add_remove(self):
        s = Stock()
        s.add("A", 5)
        s.remove("A", 2)
        self.assertEqual(s.level("A"), 3)

    def test_over_remove(self):
        with self.assertRaises(StockError):
            Stock({"A": 1}).remove("A", 2)

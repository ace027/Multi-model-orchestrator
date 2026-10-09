import unittest

from bankkit.importers.csv import import_csv
from bankkit.store import Store


class CsvTest(unittest.TestCase):
    def test_basic(self):
        r = import_csv(Store({"chk": "USD"}), "chk", "Date,Description,Amount\n2026-09-01,Coffee,-3.50\n")
        self.assertEqual(r.added[0].amount_cents, -350)

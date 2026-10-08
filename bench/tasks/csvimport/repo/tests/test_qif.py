import unittest
from datetime import date

from bankkit.importers.qif import import_qif
from bankkit.models import Transaction
from bankkit.store import Store

QIF = """!Type:Bank
D09/01/2026
T-3.50
PCoffee   shop
^
D09/02/2026
T1,200.00
PSalary
^
"""


class QifTest(unittest.TestCase):
    def test_import(self):
        s = Store({"chk": "USD"})
        r = import_qif(s, "chk", QIF)
        self.assertEqual(r.added, [Transaction(date(2026, 9, 1), -350, "Coffee shop", "USD"),
                                   Transaction(date(2026, 9, 2), 120000, "Salary", "USD")])
        self.assertEqual(s.transactions("chk"), r.added)

    def test_reimport_skips(self):
        s = Store({"chk": "USD"})
        import_qif(s, "chk", QIF)
        r = import_qif(s, "chk", QIF)
        self.assertEqual((r.added, r.duplicates), ([], 2))

    def test_bad_record(self):
        r = import_qif(Store({"chk": "USD"}), "chk", "D13/45/2026\nT1\nPx\n^\n")
        self.assertEqual([e.line for e in r.errors], [1])

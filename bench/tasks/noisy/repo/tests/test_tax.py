import unittest

from ledgerlib.journal import Journal
from ledgerlib.money import apply_rate, to_cents


class TaxTest(unittest.TestCase):
    def test_half_cent_rounds_up(self):
        # 0.125 -> 0.13: half away from zero, as the docstring says
        self.assertEqual(to_cents("0.125"), 13)

    def test_tax_half_cent(self):
        # 250 cents at 7.0% = 17.5 cents -> 18
        j = Journal()
        self.assertEqual(j.post_tax("tax", 250, "7.0"), 18)
        self.assertEqual(j.balance("tax"), 18)

    def test_tax_plain(self):
        self.assertEqual(apply_rate(1000, "8.25"), 83)

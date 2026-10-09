"""Hidden check for the csvimport task: 30 cases from docs/csv-format.md, pass at 80%.
Usage: check.py <work dir>. Exit 0 = success."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from grade import check  # noqa: E402

HIDDEN = r'''
import json, subprocess, sys, tempfile, unittest
from datetime import date
from pathlib import Path

from bankkit.importers.csv import import_csv
from bankkit.models import Transaction
from bankkit.store import Store

H = "Date,Description,Amount\n"
HS = "Date;Description;Amount\n"


def imp(text, existing=(), cur="USD"):
    s = Store({"chk": cur})
    for t in existing:
        s.add("chk", t)
    return s, import_csv(s, "chk", text)


def T(y, m, d, cents, desc, cur="USD"):
    return Transaction(date(y, m, d), cents, desc, cur)


class Hidden(unittest.TestCase):
    def amount(self, text, header=H):
        s, r = imp(header + "2026-09-01" + header[4] + "X" + header[4] + text + "\n")
        self.assertEqual(r.errors, [])
        return r.added[0].amount_cents

    def error_lines(self, text):
        return [e.line for e in imp(text)[1].errors]

    def test_basic(self):
        s, r = imp(H + "2026-09-01,Coffee,-3.50\n")
        self.assertEqual((r.added, r.duplicates, r.errors), ([T(2026, 9, 1, -350, "Coffee")], 0, []))
        self.assertEqual(s.transactions("chk"), r.added)

    def test_bom_and_crlf(self):
        s, r = imp("﻿Date,Description,Amount\r\n2026-09-01,Coffee,-3.50\r\n")
        self.assertEqual(r.added, [T(2026, 9, 1, -350, "Coffee")])

    def test_semicolon_file(self):
        s, r = imp(HS + "01/09/2026;Café;-1.234,56\n")
        self.assertEqual(r.added, [T(2026, 9, 1, -123456, "Café")])

    def test_comma_file_slash_dates_are_month_first(self):
        self.assertEqual(imp(H + "09/01/2026,X,1.00\n")[1].added[0].date, date(2026, 9, 1))

    def test_comma_file_rejects_day_first_date(self):
        self.assertEqual(self.error_lines(H + "13/01/2026,X,1.00\n"), [2])

    def test_quoted_field(self):
        s, r = imp(H + '2026-09-01,"Smith, John ""JJ""",5\n')
        self.assertEqual(r.added[0].description, 'Smith, John "JJ"')

    def test_thousands_separator(self):
        self.assertEqual(self.amount('"1,234.56"'), 123456)

    def test_parentheses_negative(self):
        self.assertEqual(self.amount("(12.00)"), -1200)

    def test_trailing_minus(self):
        self.assertEqual(self.amount("12.00-"), -1200)

    def test_currency_symbols(self):
        self.assertEqual(self.amount("$12.00"), 1200)
        self.assertEqual(self.amount("€1.234,56", HS), 123456)

    def test_no_float_rounding(self):
        self.assertEqual([self.amount(a) for a in ("0.29", "1.15", "4.35", "-0.57")], [29, 115, 435, -57])

    def test_short_decimals(self):
        self.assertEqual([self.amount(a) for a in ("12", "12.5")], [1200, 1250])

    def test_three_decimals_is_row_error(self):
        s, r = imp(H + "2026-09-01,A,1.00\n2026-09-02,B,12.345\n2026-09-03,C,2.00\n")
        self.assertEqual([e.line for e in r.errors], [3])
        self.assertEqual([t.description for t in r.added], ["A", "C"])

    def test_impossible_date(self):
        self.assertEqual(self.error_lines(H + "2026-02-30,X,1\n"), [2])

    def test_debit_credit(self):
        s, r = imp("Date,Description,Debit,Credit\n2026-09-01,A,12.00,\n2026-09-02,B,,3.00\n")
        self.assertEqual([t.amount_cents for t in r.added], [-1200, 300])

    def test_debit_credit_both_or_neither(self):
        self.assertEqual(self.error_lines("Date,Description,Debit,Credit\n2026-09-01,A,1,2\n2026-09-02,B,,\n"), [2, 3])

    def test_signed_debit_is_error(self):
        self.assertEqual(self.error_lines("Date,Description,Debit,Credit\n2026-09-01,A,-12.00,\n"), [2])

    def test_missing_amount_column_is_file_error(self):
        s, r = imp("Date,Description\n2026-09-01,A\n")
        self.assertEqual((r.added, [e.line for e in r.errors], s.transactions("chk")), ([], [1], []))

    def test_header_matching(self):
        s, r = imp(" transaction date ,MEMO, Amount ,Ref\n2026-09-01,Lunch,-9.99,abc\n")
        self.assertEqual(r.added, [T(2026, 9, 1, -999, "Lunch")])

    def test_description_precedence(self):
        self.assertEqual(imp("Date,Memo,Payee,Description,Amount\n2026-09-01,m,p,d,1\n")[1].added[0].description, "d")
        self.assertEqual(imp("Date,Memo,Payee,Amount\n2026-09-01,m,p,1\n")[1].added[0].description, "p")

    def test_description_whitespace(self):
        self.assertEqual(imp(H + "2026-09-01,  Coffee   shop ,1\n")[1].added[0].description, "Coffee shop")

    def test_total_line_ends_data(self):
        s, r = imp(H + "2026-09-01,A,1\nTOTAL,,99.00\n2026-09-05,After,1\n")
        self.assertEqual(([t.description for t in r.added], r.errors), (["A"], []))

    def test_blank_lines_and_line_numbers(self):
        s, r = imp("\n" + H + "\n2026-09-01,A,1\n  \n2026-13-01,B,1\n")
        self.assertEqual(([t.description for t in r.added], [e.line for e in r.errors]), (["A"], [6]))

    def test_currency_column(self):
        s, r = imp("Date,Description,Amount,Currency\n2026-09-01,A,1,USD\n2026-09-01,B,1,\n2026-09-01,C,1,EUR\n")
        self.assertEqual(([t.description for t in r.added], [e.line for e in r.errors]), (["A", "B"], [4]))

    def test_reimport_adds_nothing(self):
        text = H + "2026-09-01,A,1\n2026-09-02,B,2\n"
        s, _ = imp(text)
        r = import_csv(s, "chk", text)
        self.assertEqual((r.added, r.duplicates, len(s.transactions("chk"))), ([], 2, 2))

    def test_duplicates_matched_by_count(self):
        s, r = imp(H + "2026-09-01,Coffee,-3.50\n2026-09-01,Coffee,-3.50\n", existing=[T(2026, 9, 1, -350, "Coffee")])
        self.assertEqual((len(r.added), r.duplicates, len(s.transactions("chk"))), (1, 1, 2))

    def test_identical_rows_in_one_file_are_kept(self):
        s, r = imp(H + "2026-09-01,Coffee,-3.50\n2026-09-01,Coffee,-3.50\n")
        self.assertEqual((len(r.added), r.duplicates), (2, 0))

    def test_duplicates_compare_normalised_descriptions(self):
        s, r = imp(H + "2026-09-01,Coffee   shop,1\n", existing=[T(2026, 9, 1, 100, "Coffee shop")])
        self.assertEqual((r.added, r.duplicates), ([], 1))

    def test_file_order(self):
        s, r = imp(H + "2026-09-03,C,1\n2026-09-01,A,1\n2026-09-02,B,1\n")
        self.assertEqual([t.description for t in s.transactions("chk")], ["C", "A", "B"])

    def test_cli(self):
        with tempfile.TemporaryDirectory() as d:
            st = Path(d) / "s.json"
            st.write_text(json.dumps({"accounts": {"chk": {"currency": "USD", "transactions": []}}}))
            f = Path(d) / "st.csv"
            run = lambda: subprocess.run([sys.executable, "-m", "bankkit.cli", "import", str(f), "--account", "chk", "--store", str(st)],
                                         capture_output=True, text=True)
            f.write_text(H + "2026-09-01,A,1\n2026-09-02,B,2\n")
            p = run()
            self.assertEqual((p.returncode, p.stdout), (0, "added 2, duplicates 0, errors 0\n"))
            f.write_text(H + "2026-09-01,A,1\n2026-09-03,C,x\n")
            p = run()
            self.assertEqual((p.returncode, p.stdout), (1, "added 0, duplicates 1, errors 1\n"))
            self.assertTrue(p.stderr.startswith("line 3:"))
'''

sys.exit(check(sys.argv[1], HIDDEN))

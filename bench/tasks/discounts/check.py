"""Hidden check for the discounts task. Usage: check.py <work dir>. Exit 0 = success."""
import json
import subprocess
import sys
import textwrap

W = sys.argv[1]
TEST = textwrap.dedent('''
    import unittest
    from shop.cart import Cart
    from shop import discounts

    class Hidden(unittest.TestCase):
        def cart(self, *prices):
            c = Cart()
            for p in prices:
                c.add("x", p)
            return c

        def test_percent_rounds_down(self):
            c = self.cart(999)
            c.apply_code("save10")
            self.assertEqual(c.total_cents(), 900)

        def test_fixed_floor_zero(self):
            c = self.cart(300)
            c.apply_code("FIVEOFF")
            self.assertEqual(c.total_cents(), 0)

        def test_second_code_replaces(self):
            c = self.cart(1000)
            c.apply_code("FIVEOFF")
            c.apply_code("SAVE10")
            self.assertEqual(c.total_cents(), 900)

        def test_unknown_code(self):
            with self.assertRaises(KeyError):
                self.cart(100).apply_code("NOPE")

        def test_codes_file(self):
            self.assertTrue(hasattr(discounts, "Discount"))
''')
open(f"{W}/tests/test_zz_hidden_check.py", "w").write(TEST)
try:
    r = subprocess.run([sys.executable, "-m", "unittest", "-q"], cwd=W, capture_output=True, text=True, timeout=300)
    ok = r.returncode == 0
    cli = subprocess.run([sys.executable, "-m", "shop.cli", "total", json.dumps([{"sku": "a", "price_cents": 1000}]), "--code", "SAVE10"], cwd=W, capture_output=True, text=True)
    bad = subprocess.run([sys.executable, "-m", "shop.cli", "total", "[]", "--code", "NOPE"], cwd=W, capture_output=True, text=True)
    ok = ok and cli.stdout.strip() == "900" and bad.returncode == 2
    print("tests", r.returncode, "cli", cli.stdout.strip(), "unknown-code exit", bad.returncode)
finally:
    import os
    os.remove(f"{W}/tests/test_zz_hidden_check.py")
sys.exit(0 if ok else 1)

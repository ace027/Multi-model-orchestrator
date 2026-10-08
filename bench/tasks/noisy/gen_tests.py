"""Writes the noisy generated test suite into <repo dir>/tests. Usage: gen_tests.py <repo dir>."""
import random
import sys

R = sys.argv[1]
rnd = random.Random(11)
head = '''import logging
import sys
import unittest

from ledgerlib.journal import Journal
from ledgerlib.money import split, to_cents

logging.basicConfig(level=logging.DEBUG, stream=sys.stderr, format="%(asctime)s %(levelname)s %(name)s %(message)s")
'''
for f in range(8):
    body = [head, f"class Generated{f}(unittest.TestCase):"]
    for i in range(50):
        n = f * 50 + i
        kind = n % 3
        if kind == 0:
            total, parts = rnd.randint(1, 100000), rnd.randint(1, 9)
            body.append(f"    def test_split_{n}(self):\n        print('split case {n}: total={total} parts={parts}')\n        shares = split({total}, {parts})\n        self.assertEqual(sum(shares), {total})\n        self.assertLessEqual(max(shares) - min(shares), 1)\n")
        elif kind == 1:
            cents = rnd.randint(0, 99999)
            amount = f"{cents // 100}.{cents % 100:02d}"
            body.append(f"    def test_to_cents_{n}(self):\n        print('to_cents case {n}: {amount}')\n        self.assertEqual(to_cents('{amount}'), {cents})\n")
        else:
            accts = [f"acct{rnd.randint(1, 30)}" for _ in range(rnd.randint(2, 6))]
            amounts = [rnd.randint(1, 5000) for _ in accts]
            posts = "\n".join(f"        j.post('{a}', {c})" for a, c in zip(accts, amounts))
            body.append(f"    def test_journal_{n}(self):\n        print('journal case {n}')\n        j = Journal()\n{posts}\n        self.assertEqual(sum(j.balance(a) for a in set({accts!r})), {sum(amounts)})\n")
    open(f"{R}/tests/test_generated_{f}.py", "w").write("\n".join(body) + "\n")

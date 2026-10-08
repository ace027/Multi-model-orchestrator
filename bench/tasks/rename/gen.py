"""Writes 60 service modules that call legacy.http_get, plus their tests. Usage: gen.py <repo dir>."""
import random
import sys

R = sys.argv[1]
rnd = random.Random(3)
names = [f"svc_{w}{i}" for i, w in enumerate(["billing", "orders", "users", "stock", "audit", "search"] * 10)]
open(f"{R}/app/services/__init__.py", "w").write("")
test = ["import unittest", "from app import transport", ""]
for n in names:
    calls = []
    for j in range(3):
        style = rnd.randint(0, 3)
        url = f"https://api.example.com/{n}/{j}"
        if style == 0:
            calls.append(f'    return legacy.http_get("{url}")' if j == 2 else f'    legacy.http_get("{url}")')
        elif style == 1:
            calls.append(f'    resp = legacy.http_get("{url}", timeout=5)' + ("\n    return resp" if j == 2 else ""))
        elif style == 2:
            calls.append(f'    resp = legacy.http_get("{url}", 3, retries=2)' + ("\n    return resp" if j == 2 else ""))
        else:
            calls.append(f'    resp = legacy.http_get(\n        "{url}",\n        timeout=7,\n        retries=1,\n    )' + ("\n    return resp" if j == 2 else ""))
    src = f'"""Service {n}."""\nfrom app import legacy\n\n\ndef sync():\n' + "\n".join(calls) + "\n"
    open(f"{R}/app/services/{n}.py", "w").write(src)
    test += [f"from app.services import {n}"]
test += ["", "", "class ServicesTest(unittest.TestCase):"]
for n in names:
    test += [f"    def test_{n}(self):", "        transport.CALLS.clear()", f"        self.assertEqual({n}.sync()['status'], 200)", "        self.assertEqual(len(transport.CALLS), 3)", ""]
open(f"{R}/tests/test_services.py", "w").write("\n".join(test) + "\n")

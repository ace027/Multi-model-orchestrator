"""Hidden check for the tron task: rules (20 cases), the page in a browser (8), and the
computer player's tournament score (24 rounds). Passes at 80% rules, 7/8 ui, 50% ai.
Usage: check.py <work dir>. Exit 0 = success."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
from grade import check_web  # noqa: E402

sys.exit(check_web(sys.argv[1], os.path.join(HERE, "hidden.cjs"), {"rules": 0.8, "ui": 7 / 8, "ai": 0.5}))

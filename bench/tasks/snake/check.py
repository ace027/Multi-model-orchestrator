"""Hidden check for the snake task: rules (26 scripted cases), the page in a browser (7),
and 3 long bot-driven replays. Passes at 80% rules and 6/7 ui; the replays are reported
but not required (any rule difference makes a replay diverge).
Usage: check.py <work dir>. Exit 0 = success."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
from grade import check_web  # noqa: E402

sys.exit(check_web(sys.argv[1], os.path.join(HERE, "hidden.cjs"), {"rules": 0.8, "ui": 6 / 7, "replay": 0}))

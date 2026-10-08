"""Generates the oversized-job fixture: notes/ with 24 files of ~8k tokens each (~200k total).
Usage: gen.py <dir>"""
import os
import random
import sys

D = sys.argv[1]
rnd = random.Random(11)
teams = ["billing", "search", "ingest", "auth", "mobile", "infra", "growth", "support"]
verbs = ["agreed to", "deferred", "rejected", "approved", "asked for", "estimated", "blocked on", "shipped"]
things = ["the retry budget", "the schema migration", "the on-call rota", "the cache TTL", "the export job", "the rate limiter",
          "the audit log", "the SLA dashboard", "the feature flag cleanup", "the load test", "the vendor contract", "the backfill"]
people = ["Ana", "Bo", "Chidi", "Dee", "Eli", "Fei", "Gus", "Hana", "Ivo", "Jun"]
os.makedirs(f"{D}/notes", exist_ok=True)
for i in range(24):
    team = teams[i % len(teams)]
    key = f"{rnd.choice(people)} {rnd.choice(verbs)} {rnd.choice(things)}"
    lines = [f"# Week {i + 1} {team} sync", "", f"Headline decision: {key}.", ""]
    for j in range(220):
        lines.append(f"- {j + 1}. {rnd.choice(people)} {rnd.choice(verbs)} {rnd.choice(things)} for {rnd.choice(teams)}"
                     f" (ticket {team.upper()}-{rnd.randint(100, 999)}, est {rnd.randint(1, 13)}d, risk {rnd.choice(['low', 'med', 'high'])}).")
    open(f"{D}/notes/week{i + 1:02d}-{team}.md", "w").write("\n".join(lines) + "\n")

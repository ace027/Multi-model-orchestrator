"""Generates logs/ingest.log (about 1.5 MB) into the work dir. Usage: setup.py <work dir>."""
import os
import random
import sys

W = sys.argv[1]
os.makedirs(f"{W}/logs", exist_ok=True)
rnd = random.Random(7)
sources = [f"sensor-{i:03d}" for i in range(120)]
lines = []
for i in range(14000):
    h, m, s = (i // 3600) % 24, (i // 60) % 60, i % 60
    src = rnd.choice(sources)
    new_fw = src >= "sensor-080"
    at = f"2026-09-30T{h:02d}:{m:02d}:{s:02d}" + ("Z" if new_fw else rnd.choice(["+00:00", "+02:00", "-05:00"]))
    t = f"2026-10-01 02:{(i // 600) % 60:02d}:{(i // 10) % 60:02d},{i % 1000:03d}"
    if i % 97 == 0:
        lines.append(f"{t} INFO  ingest.batch  batch={i // 97} committed rows={rnd.randint(80, 120)} lag_ms={rnd.randint(5, 900)}")
    if new_fw and rnd.random() < 0.5:
        lines.append(f"{t} WARN  ingest.records  rejected record from {src}: ValueError")
        if rnd.random() < 0.05:
            lines += [
                f"{t} DEBUG ingest.records  Traceback (most recent call last):",
                f'{t} DEBUG ingest.records    File "ingest/records.py", line 16, in parse_record',
                f'{t} DEBUG ingest.records      return Record(source=data["source"], at=parse_ts(data["at"]), value=float(data["value"]))',
                f'{t} DEBUG ingest.records    File "ingest/timestamps.py", line 14, in parse_ts',
                f'{t} DEBUG ingest.records      raise ValueError(f"invalid timestamp {{text!r}}: no UTC offset")',
                f"{t} DEBUG ingest.records  ValueError: invalid timestamp '{at}': no UTC offset",
            ]
    else:
        lines.append(f"{t} INFO  ingest.records  accepted {src} at={at} value={rnd.uniform(-40, 60):.3f}")
    if i % 1500 == 0:
        lines.append(f"{t} WARN  ingest.pool  connection pool at {rnd.randint(70, 95)}% capacity")
open(f"{W}/logs/ingest.log", "w").write("\n".join(lines) + "\n")

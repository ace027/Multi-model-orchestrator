import json
from dataclasses import dataclass
from datetime import datetime

from ingest.timestamps import parse_ts


@dataclass
class Record:
    source: str
    at: datetime
    value: float


def parse_record(line: str) -> Record:
    data = json.loads(line)
    return Record(source=data["source"], at=parse_ts(data["at"]), value=float(data["value"]))


def ingest(lines):
    """Parses each line; returns (records, rejected count)."""
    out, rejected = [], 0
    for line in lines:
        try:
            out.append(parse_record(line))
        except (ValueError, KeyError):
            rejected += 1
    return out, rejected

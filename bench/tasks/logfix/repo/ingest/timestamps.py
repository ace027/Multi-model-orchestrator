from datetime import datetime, timedelta, timezone


def parse_ts(text: str) -> datetime:
    """Parses an ISO-8601 timestamp with an explicit UTC offset into an aware datetime."""
    text = text.strip()
    if "+" in text:
        stamp, offset = text.rsplit("+", 1)
        sign = 1
    elif text.count("-") > 2:
        stamp, offset = text.rsplit("-", 1)
        sign = -1
    else:
        raise ValueError(f"invalid timestamp {text!r}: no UTC offset")
    hours, minutes = offset.split(":")
    tz = timezone(sign * timedelta(hours=int(hours), minutes=int(minutes)))
    return datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=tz)

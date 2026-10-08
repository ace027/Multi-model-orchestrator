"""Service svc_stock3."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_stock3/0", timeout=5)
    resp = legacy.http_get(
        "https://api.example.com/svc_stock3/1",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get(
        "https://api.example.com/svc_stock3/2",
        timeout=7,
        retries=1,
    )
    return resp

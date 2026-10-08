"""Service svc_orders1."""
from app import legacy


def sync():
    resp = legacy.http_get(
        "https://api.example.com/svc_orders1/0",
        timeout=7,
        retries=1,
    )
    legacy.http_get("https://api.example.com/svc_orders1/1")
    return legacy.http_get("https://api.example.com/svc_orders1/2")

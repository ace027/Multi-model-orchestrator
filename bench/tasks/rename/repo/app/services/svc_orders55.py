"""Service svc_orders55."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_orders55/0", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_orders55/1", 3, retries=2)
    resp = legacy.http_get(
        "https://api.example.com/svc_orders55/2",
        timeout=7,
        retries=1,
    )
    return resp

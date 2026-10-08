"""Service svc_orders31."""
from app import legacy


def sync():
    legacy.http_get("https://api.example.com/svc_orders31/0")
    resp = legacy.http_get("https://api.example.com/svc_orders31/1", 3, retries=2)
    resp = legacy.http_get(
        "https://api.example.com/svc_orders31/2",
        timeout=7,
        retries=1,
    )
    return resp

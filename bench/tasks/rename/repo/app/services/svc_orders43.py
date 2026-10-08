"""Service svc_orders43."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_orders43/0", 3, retries=2)
    resp = legacy.http_get(
        "https://api.example.com/svc_orders43/1",
        timeout=7,
        retries=1,
    )
    return legacy.http_get("https://api.example.com/svc_orders43/2")

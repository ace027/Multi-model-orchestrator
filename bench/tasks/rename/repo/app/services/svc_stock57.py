"""Service svc_stock57."""
from app import legacy


def sync():
    resp = legacy.http_get(
        "https://api.example.com/svc_stock57/0",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get(
        "https://api.example.com/svc_stock57/1",
        timeout=7,
        retries=1,
    )
    return legacy.http_get("https://api.example.com/svc_stock57/2")

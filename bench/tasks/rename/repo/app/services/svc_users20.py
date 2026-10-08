"""Service svc_users20."""
from app import legacy


def sync():
    resp = legacy.http_get(
        "https://api.example.com/svc_users20/0",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get("https://api.example.com/svc_users20/1", timeout=5)
    return legacy.http_get("https://api.example.com/svc_users20/2")

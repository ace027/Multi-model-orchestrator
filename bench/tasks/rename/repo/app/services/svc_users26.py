"""Service svc_users26."""
from app import legacy


def sync():
    legacy.http_get("https://api.example.com/svc_users26/0")
    resp = legacy.http_get("https://api.example.com/svc_users26/1", timeout=5)
    resp = legacy.http_get(
        "https://api.example.com/svc_users26/2",
        timeout=7,
        retries=1,
    )
    return resp

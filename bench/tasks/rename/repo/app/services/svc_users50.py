"""Service svc_users50."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_users50/0", timeout=5)
    resp = legacy.http_get(
        "https://api.example.com/svc_users50/1",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get("https://api.example.com/svc_users50/2", 3, retries=2)
    return resp

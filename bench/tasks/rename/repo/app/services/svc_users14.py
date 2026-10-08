"""Service svc_users14."""
from app import legacy


def sync():
    resp = legacy.http_get(
        "https://api.example.com/svc_users14/0",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get("https://api.example.com/svc_users14/1", timeout=5)
    resp = legacy.http_get("https://api.example.com/svc_users14/2", 3, retries=2)
    return resp

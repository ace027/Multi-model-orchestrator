"""Service svc_users2."""
from app import legacy


def sync():
    resp = legacy.http_get(
        "https://api.example.com/svc_users2/0",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get("https://api.example.com/svc_users2/1", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_users2/2", timeout=5)
    return resp

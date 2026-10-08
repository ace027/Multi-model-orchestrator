"""Service svc_audit4."""
from app import legacy


def sync():
    resp = legacy.http_get(
        "https://api.example.com/svc_audit4/0",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get("https://api.example.com/svc_audit4/1", timeout=5)
    resp = legacy.http_get("https://api.example.com/svc_audit4/2", timeout=5)
    return resp

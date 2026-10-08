"""Service svc_audit46."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_audit46/0", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_audit46/1", timeout=5)
    resp = legacy.http_get(
        "https://api.example.com/svc_audit46/2",
        timeout=7,
        retries=1,
    )
    return resp

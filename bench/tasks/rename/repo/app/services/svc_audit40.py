"""Service svc_audit40."""
from app import legacy


def sync():
    resp = legacy.http_get(
        "https://api.example.com/svc_audit40/0",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get("https://api.example.com/svc_audit40/1", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_audit40/2", 3, retries=2)
    return resp

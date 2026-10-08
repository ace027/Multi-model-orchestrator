"""Service svc_billing6."""
from app import legacy


def sync():
    legacy.http_get("https://api.example.com/svc_billing6/0")
    resp = legacy.http_get("https://api.example.com/svc_billing6/1", timeout=5)
    return legacy.http_get("https://api.example.com/svc_billing6/2")

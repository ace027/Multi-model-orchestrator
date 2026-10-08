"""Service svc_billing24."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_billing24/0", timeout=5)
    legacy.http_get("https://api.example.com/svc_billing24/1")
    resp = legacy.http_get("https://api.example.com/svc_billing24/2", 3, retries=2)
    return resp

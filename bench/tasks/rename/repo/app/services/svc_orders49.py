"""Service svc_orders49."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_orders49/0", timeout=5)
    legacy.http_get("https://api.example.com/svc_orders49/1")
    resp = legacy.http_get("https://api.example.com/svc_orders49/2", 3, retries=2)
    return resp

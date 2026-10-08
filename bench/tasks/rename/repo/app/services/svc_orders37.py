"""Service svc_orders37."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_orders37/0", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_orders37/1", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_orders37/2", 3, retries=2)
    return resp

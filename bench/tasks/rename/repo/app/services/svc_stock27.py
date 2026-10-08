"""Service svc_stock27."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_stock27/0", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_stock27/1", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_stock27/2", timeout=5)
    return resp

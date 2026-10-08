"""Service svc_stock15."""
from app import legacy


def sync():
    legacy.http_get("https://api.example.com/svc_stock15/0")
    resp = legacy.http_get("https://api.example.com/svc_stock15/1", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_stock15/2", timeout=5)
    return resp

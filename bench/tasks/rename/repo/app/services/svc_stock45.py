"""Service svc_stock45."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_stock45/0", timeout=5)
    resp = legacy.http_get("https://api.example.com/svc_stock45/1", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_stock45/2", timeout=5)
    return resp

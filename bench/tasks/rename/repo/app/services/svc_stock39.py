"""Service svc_stock39."""
from app import legacy


def sync():
    legacy.http_get("https://api.example.com/svc_stock39/0")
    resp = legacy.http_get("https://api.example.com/svc_stock39/1", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_stock39/2", 3, retries=2)
    return resp

"""Service svc_stock51."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_stock51/0", timeout=5)
    legacy.http_get("https://api.example.com/svc_stock51/1")
    return legacy.http_get("https://api.example.com/svc_stock51/2")

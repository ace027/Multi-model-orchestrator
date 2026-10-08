"""Service svc_orders19."""
from app import legacy


def sync():
    legacy.http_get("https://api.example.com/svc_orders19/0")
    resp = legacy.http_get("https://api.example.com/svc_orders19/1", 3, retries=2)
    return legacy.http_get("https://api.example.com/svc_orders19/2")

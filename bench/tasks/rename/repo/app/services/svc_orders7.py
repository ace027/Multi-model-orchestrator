"""Service svc_orders7."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_orders7/0", 3, retries=2)
    legacy.http_get("https://api.example.com/svc_orders7/1")
    resp = legacy.http_get("https://api.example.com/svc_orders7/2", 3, retries=2)
    return resp

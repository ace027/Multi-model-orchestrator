"""Service svc_orders25."""
from app import legacy


def sync():
    legacy.http_get("https://api.example.com/svc_orders25/0")
    legacy.http_get("https://api.example.com/svc_orders25/1")
    return legacy.http_get("https://api.example.com/svc_orders25/2")

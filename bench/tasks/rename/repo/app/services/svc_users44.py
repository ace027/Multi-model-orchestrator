"""Service svc_users44."""
from app import legacy


def sync():
    legacy.http_get("https://api.example.com/svc_users44/0")
    resp = legacy.http_get("https://api.example.com/svc_users44/1", timeout=5)
    resp = legacy.http_get("https://api.example.com/svc_users44/2", 3, retries=2)
    return resp

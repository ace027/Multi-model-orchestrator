"""Service svc_search41."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_search41/0", timeout=5)
    resp = legacy.http_get("https://api.example.com/svc_search41/1", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_search41/2", timeout=5)
    return resp

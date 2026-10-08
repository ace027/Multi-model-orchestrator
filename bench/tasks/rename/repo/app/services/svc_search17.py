"""Service svc_search17."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_search17/0", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_search17/1", 3, retries=2)
    return legacy.http_get("https://api.example.com/svc_search17/2")

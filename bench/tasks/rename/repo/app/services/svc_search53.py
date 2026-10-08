"""Service svc_search53."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_search53/0", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_search53/1", 3, retries=2)
    return legacy.http_get("https://api.example.com/svc_search53/2")

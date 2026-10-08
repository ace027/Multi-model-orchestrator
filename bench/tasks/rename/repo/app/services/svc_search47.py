"""Service svc_search47."""
from app import legacy


def sync():
    legacy.http_get("https://api.example.com/svc_search47/0")
    legacy.http_get("https://api.example.com/svc_search47/1")
    resp = legacy.http_get("https://api.example.com/svc_search47/2", 3, retries=2)
    return resp

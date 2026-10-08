"""Service svc_audit28."""
from app import legacy


def sync():
    legacy.http_get("https://api.example.com/svc_audit28/0")
    resp = legacy.http_get("https://api.example.com/svc_audit28/1", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_audit28/2", 3, retries=2)
    return resp

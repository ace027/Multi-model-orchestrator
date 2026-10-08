"""Service svc_audit16."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_audit16/0", 3, retries=2)
    legacy.http_get("https://api.example.com/svc_audit16/1")
    resp = legacy.http_get("https://api.example.com/svc_audit16/2", timeout=5)
    return resp

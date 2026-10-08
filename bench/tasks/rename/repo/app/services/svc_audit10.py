"""Service svc_audit10."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_audit10/0", 3, retries=2)
    legacy.http_get("https://api.example.com/svc_audit10/1")
    return legacy.http_get("https://api.example.com/svc_audit10/2")

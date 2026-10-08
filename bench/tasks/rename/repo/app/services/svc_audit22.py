"""Service svc_audit22."""
from app import legacy


def sync():
    legacy.http_get("https://api.example.com/svc_audit22/0")
    legacy.http_get("https://api.example.com/svc_audit22/1")
    return legacy.http_get("https://api.example.com/svc_audit22/2")

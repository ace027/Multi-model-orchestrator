"""Service svc_billing0."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_billing0/0", timeout=5)
    resp = legacy.http_get("https://api.example.com/svc_billing0/1", timeout=5)
    resp = legacy.http_get("https://api.example.com/svc_billing0/2", 3, retries=2)
    return resp

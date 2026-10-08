"""Service svc_billing42."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_billing42/0", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_billing42/1", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_billing42/2", 3, retries=2)
    return resp

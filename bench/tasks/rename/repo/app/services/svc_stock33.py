"""Service svc_stock33."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_stock33/0", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_stock33/1", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_stock33/2", 3, retries=2)
    return resp

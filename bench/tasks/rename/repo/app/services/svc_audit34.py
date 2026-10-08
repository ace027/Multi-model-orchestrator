"""Service svc_audit34."""
from app import legacy


def sync():
    legacy.http_get("https://api.example.com/svc_audit34/0")
    resp = legacy.http_get(
        "https://api.example.com/svc_audit34/1",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get("https://api.example.com/svc_audit34/2", 3, retries=2)
    return resp

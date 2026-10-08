"""Service svc_users38."""
from app import legacy


def sync():
    resp = legacy.http_get(
        "https://api.example.com/svc_users38/0",
        timeout=7,
        retries=1,
    )
    legacy.http_get("https://api.example.com/svc_users38/1")
    return legacy.http_get("https://api.example.com/svc_users38/2")

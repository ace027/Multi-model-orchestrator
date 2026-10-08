"""Service svc_users32."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_users32/0", timeout=5)
    resp = legacy.http_get("https://api.example.com/svc_users32/1", 3, retries=2)
    resp = legacy.http_get(
        "https://api.example.com/svc_users32/2",
        timeout=7,
        retries=1,
    )
    return resp

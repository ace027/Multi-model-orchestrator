"""Service svc_billing36."""
from app import legacy


def sync():
    legacy.http_get("https://api.example.com/svc_billing36/0")
    resp = legacy.http_get("https://api.example.com/svc_billing36/1", 3, retries=2)
    resp = legacy.http_get(
        "https://api.example.com/svc_billing36/2",
        timeout=7,
        retries=1,
    )
    return resp

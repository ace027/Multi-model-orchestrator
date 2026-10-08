"""Service svc_billing54."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_billing54/0", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_billing54/1", timeout=5)
    resp = legacy.http_get(
        "https://api.example.com/svc_billing54/2",
        timeout=7,
        retries=1,
    )
    return resp

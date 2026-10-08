"""Service svc_billing18."""
from app import legacy


def sync():
    legacy.http_get("https://api.example.com/svc_billing18/0")
    resp = legacy.http_get(
        "https://api.example.com/svc_billing18/1",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get(
        "https://api.example.com/svc_billing18/2",
        timeout=7,
        retries=1,
    )
    return resp

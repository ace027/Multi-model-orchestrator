"""Service svc_billing30."""
from app import legacy


def sync():
    resp = legacy.http_get(
        "https://api.example.com/svc_billing30/0",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get(
        "https://api.example.com/svc_billing30/1",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get(
        "https://api.example.com/svc_billing30/2",
        timeout=7,
        retries=1,
    )
    return resp

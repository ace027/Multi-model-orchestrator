"""Service svc_users8."""
from app import legacy


def sync():
    resp = legacy.http_get(
        "https://api.example.com/svc_users8/0",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get(
        "https://api.example.com/svc_users8/1",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get(
        "https://api.example.com/svc_users8/2",
        timeout=7,
        retries=1,
    )
    return resp

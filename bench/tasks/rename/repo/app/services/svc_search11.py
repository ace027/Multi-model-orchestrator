"""Service svc_search11."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_search11/0", timeout=5)
    resp = legacy.http_get(
        "https://api.example.com/svc_search11/1",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get("https://api.example.com/svc_search11/2", timeout=5)
    return resp

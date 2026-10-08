"""Service svc_search23."""
from app import legacy


def sync():
    resp = legacy.http_get(
        "https://api.example.com/svc_search23/0",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get("https://api.example.com/svc_search23/1", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_search23/2", 3, retries=2)
    return resp

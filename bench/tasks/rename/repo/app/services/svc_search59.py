"""Service svc_search59."""
from app import legacy


def sync():
    legacy.http_get("https://api.example.com/svc_search59/0")
    resp = legacy.http_get(
        "https://api.example.com/svc_search59/1",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get(
        "https://api.example.com/svc_search59/2",
        timeout=7,
        retries=1,
    )
    return resp

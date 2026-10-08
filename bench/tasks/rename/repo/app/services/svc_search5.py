"""Service svc_search5."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_search5/0", timeout=5)
    resp = legacy.http_get(
        "https://api.example.com/svc_search5/1",
        timeout=7,
        retries=1,
    )
    return legacy.http_get("https://api.example.com/svc_search5/2")

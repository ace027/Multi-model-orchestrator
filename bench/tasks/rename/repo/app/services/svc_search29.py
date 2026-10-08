"""Service svc_search29."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_search29/0", 3, retries=2)
    resp = legacy.http_get("https://api.example.com/svc_search29/1", timeout=5)
    resp = legacy.http_get(
        "https://api.example.com/svc_search29/2",
        timeout=7,
        retries=1,
    )
    return resp

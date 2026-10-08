"""Service svc_search35."""
from app import legacy


def sync():
    legacy.http_get("https://api.example.com/svc_search35/0")
    resp = legacy.http_get(
        "https://api.example.com/svc_search35/1",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get("https://api.example.com/svc_search35/2", timeout=5)
    return resp

"""Service svc_users56."""
from app import legacy


def sync():
    resp = legacy.http_get("https://api.example.com/svc_users56/0", 3, retries=2)
    resp = legacy.http_get(
        "https://api.example.com/svc_users56/1",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get("https://api.example.com/svc_users56/2", 3, retries=2)
    return resp

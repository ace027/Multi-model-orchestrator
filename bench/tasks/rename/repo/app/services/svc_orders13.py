"""Service svc_orders13."""
from app import legacy


def sync():
    resp = legacy.http_get(
        "https://api.example.com/svc_orders13/0",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get(
        "https://api.example.com/svc_orders13/1",
        timeout=7,
        retries=1,
    )
    resp = legacy.http_get("https://api.example.com/svc_orders13/2", 3, retries=2)
    return resp

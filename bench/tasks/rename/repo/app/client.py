from app import transport


def get(url, *, timeout_s=10.0, max_retries=0, headers=None):
    """The replacement for legacy.http_get. Note the keyword names: timeout_s and max_retries."""
    return transport.request("GET", url, timeout=timeout_s, retries=max_retries, headers=headers)

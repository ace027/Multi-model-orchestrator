CALLS = []


def request(method, url, timeout=10, retries=0, headers=None):
    """Records the call and returns a fake response (the test double for the network)."""
    CALLS.append((method, url, timeout, retries, headers or {}))
    return {"status": 200, "url": url}

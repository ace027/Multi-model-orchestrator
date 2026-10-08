"""Deprecated HTTP helper. Use app.client.get instead."""
from app import transport


def http_get(url, timeout=10, retries=0):
    return transport.request("GET", url, timeout=timeout, retries=retries)

`app/legacy.py` is deprecated. Migrate every caller of `legacy.http_get` to `app.client.get` (mind its keyword names: `timeout` becomes `timeout_s`, `retries` becomes `max_retries`, and positional timeouts must become keywords), then delete `app/legacy.py`. Behaviour must not change: each call must keep its timeout and retry values. Existing tests must keep passing.

Verify with `python3 -m unittest -q`.

Since the upstream sensor firmware update on 2026-09-30, the nightly ingest job has been rejecting a large share of records. The job's log from last night is in `logs/ingest.log` (it is large). Find out why records are rejected, fix the cause in the `ingest` package, and add a regression test. Existing tests must keep passing.

Verify with `python3 -m unittest -q`.

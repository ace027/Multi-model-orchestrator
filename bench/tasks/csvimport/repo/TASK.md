Add a CSV statement importer to bankkit.

1. `bankkit/importers/csv.py` with `import_csv(store, account, text) -> ImportResult`, implementing the format in `docs/csv-format.md` exactly.
2. `python -m bankkit.cli import FILE.csv --account NAME` uses it (the CLI already handles `.qif`).
3. Tests for the importer and the CLI. Existing tests must keep passing.

Verify with `python3 -m unittest -q`.

# Phase 3: Restock Orders -- Context

## Phase Goal
Turn the low-stock report into restock orders with per-SKU reorder targets

## Requirements Covered
- ORDER-01: Reorder targets per SKU from a JSON file, default 20
- ORDER-02: Order quantity is target minus level, only for SKUs at or below the threshold; never zero or negative
- ORDER-03: `python -m invlib.cli order FILE --targets TARGETS --threshold N` prints one `SKU QTY` line per order line sorted by SKU; exit 2 on a bad file

## What Already Exists (from prior phases)
- invlib/stock.py: StockError(ValueError); Stock(levels=None) with add/remove/level and classmethod load(path); levels is a plain dict
- invlib/report.py: low_stock(stock, threshold) -> list[(sku, level)] sorted by level then SKU; raises ValueError unless threshold is an int >= 0 (bool rejected); format_report(rows, threshold) -> str ending in newline
- invlib/cli.py: argparse subparsers (dest='command', required=True); `report FILE --threshold` (default 5); main(argv=None) calls sys.exit(_run_report(args)); the CLI loads stock JSON itself with json.load and rejects non-object JSON; errors go to stderr as `error: <reason>` and return 2
- tests/test_cli.py calls cli.main(argv) in-process, redirects stdout/stderr, asserts SystemExit code, uses tempfile.TemporaryDirectory for fixtures
- sample.json: {"BOLT":120,"NUT":4,"WASHER":0,"GEAR":9}
- Test command: python3 -m unittest discover -s tests -t . (11 tests pass)

## Key Design Decisions
- New module invlib/order.py holds DEFAULT_TARGET = 20, load_targets(path), restock_orders(stock, targets, threshold, default=DEFAULT_TARGET) and format_orders(lines); the CLI only wires it up
- restock_orders reuses report.low_stock for SKU selection, so threshold validation (ValueError) is identical to the report
- Order lines with target - level <= 0 are dropped, never emitted as zero or negative
- Target values must be int >= 0 and not bool; anything else raises ValueError naming the SKU
- load_targets lets OSError and json.JSONDecodeError (a ValueError) propagate; the CLI maps OSError and ValueError to `error: <reason>` on stderr and exit 2
- Empty order list prints nothing and exits 0
- A top-level targets.json {"NUT": 50, "BOLT": 200} is added so the roadmap command works: expected output is `NUT 46` then `WASHER 20` (WASHER uses the default)
- Architecture proposals: skipped

## Plan Structure
- **Plan 03-01 (Wave 1)**: Restock order core -- Add invlib/order.py: load reorder targets from JSON and compute restock order lines from a Stock and a threshold.
- **Plan 03-02 (Wave 2)**: Order CLI subcommand -- Add `python -m invlib.cli order FILE --targets TARGETS --threshold N` printing one `SKU QTY` line per order line, exit 2 on a bad file.

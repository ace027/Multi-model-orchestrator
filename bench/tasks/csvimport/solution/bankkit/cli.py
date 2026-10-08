"""Usage: python -m bankkit.cli import FILE --account NAME [--store PATH]

Imports a bank statement into an account. The importer is chosen by the file's extension.
Prints a summary to stdout and one line per rejected row to stderr; exits 1 if any row
was rejected, 2 if the file cannot be imported at all.
"""
import argparse
import sys
from pathlib import Path

from bankkit.importers.base import ImportResult
from bankkit.importers.csv import import_csv
from bankkit.importers.qif import import_qif
from bankkit.store import Store

IMPORTERS = {".qif": import_qif, ".csv": import_csv}


def report(result: ImportResult) -> None:
    print(f"added {len(result.added)}, duplicates {result.duplicates}, errors {len(result.errors)}")
    for e in result.errors:
        print(f"line {e.line}: {e.message}", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="bankkit")
    sub = parser.add_subparsers(dest="cmd", required=True)
    imp = sub.add_parser("import", help="import a statement file")
    imp.add_argument("file")
    imp.add_argument("--account", required=True)
    imp.add_argument("--store", default="bankkit.json")
    args = parser.parse_args(argv)

    importer = IMPORTERS.get(Path(args.file).suffix.lower())
    if importer is None:
        print(f"bankkit: no importer for {args.file}", file=sys.stderr)
        return 2
    store = Store.load(args.store)
    try:
        result = importer(store, args.account, Path(args.file).read_text(encoding="utf-8"))
    except KeyError as e:
        print(f"bankkit: {e.args[0]}", file=sys.stderr)
        return 2
    store.save(args.store)
    report(result)
    return 1 if result.errors else 0


if __name__ == "__main__":
    sys.exit(main())

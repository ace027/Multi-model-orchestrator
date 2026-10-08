"""Quicken Interchange Format: one field per line (D date, T amount, P payee), records end with ^."""
from datetime import datetime
from decimal import Decimal, InvalidOperation

from bankkit.importers.base import ImportResult, RowError, normalize_description
from bankkit.models import Transaction
from bankkit.money import to_cents
from bankkit.store import Store


def import_qif(store: Store, account: str, text: str) -> ImportResult:
    currency = store.currency(account)
    result = ImportResult()
    seen = {(t.date, t.amount_cents, t.description) for t in store.transactions(account)}
    record: dict[str, str] = {}
    start = 0
    for n, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("!"):
            continue
        if not record:
            start = n
        if line != "^":
            record[line[0]] = line[1:].strip()
            continue
        try:
            when = datetime.strptime(record["D"], "%m/%d/%Y").date()
            cents = to_cents(Decimal(record["T"].replace(",", "")))
            txn = Transaction(when, cents, normalize_description(record.get("P", "")), currency)
        except (KeyError, ValueError, InvalidOperation) as e:
            result.errors.append(RowError(start, f"bad record: {e}"))
        else:
            key = (txn.date, txn.amount_cents, txn.description)
            if key in seen:
                result.duplicates += 1
            else:
                seen.add(key)
                store.add(account, txn)
                result.added.append(txn)
        record = {}
    return result

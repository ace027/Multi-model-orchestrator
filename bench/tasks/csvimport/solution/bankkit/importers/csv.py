"""CSV statements, as described in docs/csv-format.md."""
import csv as _csv
import re
from collections import Counter
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from bankkit.importers.base import ImportResult, RowError, normalize_description
from bankkit.models import Transaction
from bankkit.money import to_cents
from bankkit.store import Store

COLUMNS = {
    "date": ["date", "posted", "transaction date"],
    "description": ["description", "payee", "memo"],
    "amount": ["amount"],
    "debit": ["debit"],
    "credit": ["credit"],
    "currency": ["currency"],
}
SYMBOLS = "$€£"


class RowProblem(ValueError):
    pass


def parse_date(text: str, semicolon: bool) -> date:
    text = text.strip()
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
            return date.fromisoformat(text)
        if re.fullmatch(r"\d{1,2}/\d{1,2}/\d{4}", text):
            return datetime.strptime(text, "%d/%m/%Y" if semicolon else "%m/%d/%Y").date()
    except ValueError:
        pass
    raise RowProblem(f"invalid date {text!r}")


def parse_amount(text: str, semicolon: bool, signed: bool = True) -> int:
    raw = s = text.strip()
    negative = False
    if s.startswith("(") and s.endswith(")"):
        negative, s = True, s[1:-1].strip()
    elif s.startswith("-"):
        negative, s = True, s[1:].strip()
    elif s.endswith("-"):
        negative, s = True, s[:-1].strip()
    if negative and not signed:
        raise RowProblem(f"debit and credit amounts are unsigned, got {raw!r}")
    if s[:1] in SYMBOLS:
        s = s[1:]
    group, point = (".", ",") if semicolon else (",", ".")
    if not re.fullmatch(rf"\d{{1,3}}(\{group}\d{{3}})*(\{point}\d{{1,2}})?|\d+(\{point}\d{{1,2}})?", s):
        raise RowProblem(f"invalid amount {raw!r}")
    try:
        cents = to_cents(Decimal(s.replace(group, "").replace(point, ".")))
    except (InvalidOperation, ValueError):
        raise RowProblem(f"invalid amount {raw!r}") from None
    return -cents if negative else cents


def import_csv(store: Store, account: str, text: str) -> ImportResult:
    currency = store.currency(account)
    result = ImportResult()
    lines = text.removeprefix("﻿").splitlines()
    rows = [(n, line) for n, line in enumerate(lines, 1) if line.strip()]
    if not rows:
        return result
    header_line, header = rows[0]
    delim = ";" if ";" in header else ","
    semicolon = delim == ";"
    parse = lambda line: next(_csv.reader([line], delimiter=delim))
    names = [h.strip().lower() for h in parse(header)]
    col = {}
    for key, aliases in COLUMNS.items():
        for alias in aliases:
            if alias in names:
                col[key] = names.index(alias)
                break
    missing = [k for k in ("date", "description") if k not in col]
    if "amount" not in col and not ("debit" in col and "credit" in col):
        missing.append("amount")
    if missing:
        result.errors.append(RowError(header_line, f"header has no {', '.join(missing)} column"))
        return result

    parsed: list[Transaction] = []
    for n, line in rows[1:]:
        fields = parse(line)
        if fields and fields[0].strip().lower().startswith("total"):
            break
        get = lambda k: fields[col[k]] if col[k] < len(fields) else ""
        try:
            when = parse_date(get("date"), semicolon)
            if "amount" in col:
                cents = parse_amount(get("amount"), semicolon)
            else:
                debit, credit = get("debit").strip(), get("credit").strip()
                if bool(debit) == bool(credit):
                    raise RowProblem("exactly one of debit and credit must be filled")
                cents = -parse_amount(debit, semicolon, False) if debit else parse_amount(credit, semicolon, False)
            cur = get("currency").strip().upper() if "currency" in col else ""
            if cur and cur != currency:
                raise RowProblem(f"currency {cur} is not the account's {currency}")
        except RowProblem as e:
            result.errors.append(RowError(n, str(e)))
            continue
        parsed.append(Transaction(when, cents, normalize_description(get("description")), currency))

    held = Counter((t.date, t.amount_cents, t.description) for t in store.transactions(account))
    for t in parsed:
        key = (t.date, t.amount_cents, t.description)
        if held[key]:
            held[key] -= 1
            result.duplicates += 1
        else:
            store.add(account, t)
            result.added.append(t)
    return result

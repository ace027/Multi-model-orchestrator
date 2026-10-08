"""Accounts and their transactions, kept in a JSON file between CLI runs."""
import json
from datetime import date
from pathlib import Path

from bankkit.models import Transaction


class Store:
    def __init__(self, accounts: dict[str, str] | None = None):
        """accounts maps account name to its currency."""
        self.currencies: dict[str, str] = dict(accounts or {})
        self.txns: dict[str, list[Transaction]] = {a: [] for a in self.currencies}

    def currency(self, account: str) -> str:
        try:
            return self.currencies[account]
        except KeyError:
            raise KeyError(f"unknown account {account!r}") from None

    def transactions(self, account: str) -> list[Transaction]:
        self.currency(account)
        return list(self.txns[account])

    def add(self, account: str, txn: Transaction) -> None:
        if txn.currency != self.currency(account):
            raise ValueError(f"{account} is in {self.currency(account)}, not {txn.currency}")
        self.txns[account].append(txn)

    @classmethod
    def load(cls, path: str | Path) -> "Store":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        store = cls({name: a["currency"] for name, a in data["accounts"].items()})
        for name, a in data["accounts"].items():
            for t in a["transactions"]:
                store.add(name, Transaction(date.fromisoformat(t["date"]), t["amount_cents"], t["description"], t["currency"]))
        return store

    def save(self, path: str | Path) -> None:
        data = {"accounts": {
            name: {"currency": cur, "transactions": [
                {"date": t.date.isoformat(), "amount_cents": t.amount_cents, "description": t.description, "currency": t.currency}
                for t in self.txns[name]]}
            for name, cur in self.currencies.items()}}
        Path(path).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

import logging

from ledgerlib.money import apply_rate, split

log = logging.getLogger("ledgerlib.journal")


class Journal:
    def __init__(self):
        self.entries: list[tuple[str, int]] = []

    def post(self, account: str, cents: int) -> None:
        log.debug("posting %s %d (entries=%d)", account, cents, len(self.entries))
        self.entries.append((account, cents))

    def balance(self, account: str) -> int:
        return sum(c for a, c in self.entries if a == account)

    def post_split(self, accounts: list[str], cents: int) -> None:
        for account, share in zip(accounts, split(cents, len(accounts))):
            self.post(account, share)

    def post_tax(self, account: str, cents: int, rate: str) -> int:
        tax = apply_rate(cents, rate)
        self.post(account, tax)
        return tax

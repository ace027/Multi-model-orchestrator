class NotifyError(Exception):
    """The mail provider could not be reached. Transient."""


class Notifier:
    def __init__(self):
        self.sent: list[tuple[str, str]] = []  # (customer, refund id)

    def refund_issued(self, customer: str, refund_id: str) -> None:
        self.sent.append((customer, refund_id))

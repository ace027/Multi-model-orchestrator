from dataclasses import dataclass, field


@dataclass
class Line:
    sku: str
    qty: int  # units ordered
    unit_cents: int  # price per unit before tax
    tax_bp: int = 0  # tax rate in basis points (825 = 8.25%)


@dataclass
class Order:
    id: str
    customer: str
    lines: list[Line]
    shipped: dict[str, int] = field(default_factory=dict)  # sku -> units shipped
    refunded: dict[str, int] = field(default_factory=dict)  # sku -> units refunded so far
    refunded_cents: dict[str, int] = field(default_factory=dict)  # sku -> cents refunded so far

    def line(self, sku: str) -> Line:
        for line in self.lines:
            if line.sku == sku:
                return line
        raise KeyError(sku)


@dataclass(frozen=True)
class Refund:
    id: str
    order_id: str
    units: dict[str, int]
    cents: int

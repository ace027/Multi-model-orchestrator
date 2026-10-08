from dataclasses import dataclass, field


@dataclass
class Item:
    sku: str
    price_cents: int
    quantity: int = 1


@dataclass
class Cart:
    items: list[Item] = field(default_factory=list)

    def add(self, sku: str, price_cents: int, quantity: int = 1) -> None:
        if price_cents < 0 or quantity < 1:
            raise ValueError("price must be >= 0 and quantity >= 1")
        self.items.append(Item(sku, price_cents, quantity))

    def subtotal_cents(self) -> int:
        return sum(i.price_cents * i.quantity for i in self.items)

    def total_cents(self) -> int:
        return self.subtotal_cents()

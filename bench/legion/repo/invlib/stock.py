"""Stock levels per SKU."""
import json


class StockError(ValueError):
    pass


class Stock:
    def __init__(self, levels=None):
        self.levels = dict(levels or {})

    def add(self, sku, qty):
        if qty <= 0:
            raise StockError("qty must be positive")
        self.levels[sku] = self.levels.get(sku, 0) + qty

    def remove(self, sku, qty):
        if qty <= 0:
            raise StockError("qty must be positive")
        have = self.levels.get(sku, 0)
        if qty > have:
            raise StockError(f"only {have} of {sku} in stock")
        self.levels[sku] = have - qty

    def level(self, sku):
        return self.levels.get(sku, 0)

    @classmethod
    def load(cls, path):
        with open(path) as f:
            return cls(json.load(f))

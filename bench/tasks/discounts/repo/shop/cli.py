"""Usage: python -m shop.cli total ITEMS_JSON

ITEMS_JSON is a list of {"sku", "price_cents", "quantity"} objects.
"""
import argparse
import json
import sys

from shop.cart import Cart


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="shop")
    sub = parser.add_subparsers(dest="cmd", required=True)
    total = sub.add_parser("total", help="print the cart total in cents")
    total.add_argument("items_json")
    args = parser.parse_args(argv)

    cart = Cart()
    for item in json.loads(args.items_json):
        cart.add(item["sku"], item["price_cents"], item.get("quantity", 1))
    print(cart.total_cents())
    return 0


if __name__ == "__main__":
    sys.exit(main())

Add discount codes to the shop.

1. New module `shop/discounts.py`: a `Discount` with a code, a kind (`percent` or `fixed`) and an amount; a registry of known codes loaded from `shop/codes.json` (create it with SAVE10 = 10 percent and FIVEOFF = 500 cents fixed); a lookup that raises `KeyError` for an unknown code (case-insensitive codes).
2. `Cart.apply_code(code)` in `shop/cart.py`. `total_cents()` applies the discount to the subtotal, rounding percent discounts down to whole cents, and never goes below 0. One code per cart; applying a second replaces the first.
3. `shop/cli.py`: `total` takes an optional `--code CODE`; an unknown code prints an error to stderr and exits 2.
4. Tests: `tests/test_discounts.py` for the registry and discount math, and `tests/test_cli.py` for the CLI (including the unknown-code exit status). Existing tests must keep passing.

Verify with `python3 -m unittest -q`.

Support and finance have reported problems with refunds; the tickets are in `docs/tickets.md`. Find the causes in the `orders` package and fix them, along with anything else in the refund code that breaks the refund policy (`docs/refunds.md`). Add regression tests.

Do not change `orders.api.handle_refund`'s signature or responses for valid requests, and do not change the existing tests.

Verify with `python3 -m unittest -q`.

# Refund policy

Refunds are paid as store credit through `POST /refunds` (`orders.api.handle_refund`).

1. **Only shipped units are refundable.** A request names units per SKU. A request without `units` refunds every shipped unit that has not been refunded yet; if there is none, the request is rejected (400).
2. **No over-refunds.** Across all of an order's refunds, the units refunded for a SKU never exceed the units shipped. A request that would go over is rejected whole (409).
3. **Exact money.** The customer paid `line_charge(line, line.qty)` for each line. Refunding `n` more units of a line pays `line_charge(line, already + n) - cents_already_refunded_for_the_line`, where `already` is the units refunded before. Partial refunds therefore add up to exactly what full refunds would pay, never a cent more.
4. **Idempotency.** The `key` identifies a request per customer. A request repeating a key that already produced a refund returns that refund (200, same body) and pays nothing.
5. **Notifications are best-effort.** A refund is done once the credit is paid and the refund recorded. If the customer notification then fails (`NotifyError`), the refund id is appended to `store.pending_notifications` for a later retry, and the request still succeeds (200).
6. **Rejected requests change nothing.** A 400, 404 or 409 pays nothing, records nothing, and does not use up its key: a corrected request may reuse it.

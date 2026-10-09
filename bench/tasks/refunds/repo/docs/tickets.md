# Open tickets: refunds

## T-101 Refunded for items that never shipped

Customer C-17 ordered 3 lamps; 1 shipped and 2 were cancelled from the backorder. The support agent pressed "Refund all" (a request without units) and the customer was credited for 3 lamps.

## T-102 Double refund after a timeout

Order O-88 was refunded twice for one request. Gateway log:

    12:01:03 POST /refunds key=rk-88-1 -> 503
    12:01:09 POST /refunds key=rk-88-1 -> 200

The mail provider had an outage between 12:00 and 12:05. The customer's wallet shows two credits for the order.

## T-103 Refunds exceed the charge

Finance: order O-301 charged $3.47 for 3 widgets ($1.10 each plus 5% tax). The customer returned them one at a time, in three requests, and was refunded $1.16 each: $3.48 in total, a cent more than was paid.

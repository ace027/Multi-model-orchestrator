from orders.models import Line, Order


def line_charge(line: Line, qty: int) -> int:
    """What qty units of a line cost, tax included. Tax is rounded half up to a whole cent."""
    net = line.unit_cents * qty
    return net + (net * line.tax_bp + 5000) // 10000


def order_total(order: Order) -> int:
    """What the customer was charged at checkout: each line's full charge."""
    return sum(line_charge(line, line.qty) for line in order.lines)

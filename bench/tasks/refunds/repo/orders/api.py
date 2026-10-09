"""HTTP handler for POST /refunds. Clients retry a request with the same key after a 5xx or a timeout."""
from orders.notify import NotifyError
from orders.refunds import OverRefund, RefundError, RefundService, UnknownOrder


def handle_refund(service: RefundService, payload: dict) -> tuple[int, dict]:
    """payload: {"order_id": str, "key": str, "units": {sku: n}} ("units" optional). Returns (status, body)."""
    if not isinstance(payload.get("order_id"), str) or not isinstance(payload.get("key"), str):
        return 400, {"error": "order_id and key are required"}
    try:
        refund = service.refund(payload["order_id"], payload.get("units"), payload["key"])
    except UnknownOrder:
        return 404, {"error": "unknown order"}
    except OverRefund as e:
        return 409, {"error": str(e)}
    except RefundError as e:
        return 400, {"error": str(e)}
    except NotifyError:
        return 503, {"error": "temporarily unavailable, retry"}
    return 200, {"refund_id": refund.id, "cents": refund.cents, "units": refund.units}

"""Reconcile bot fill cash flow from a signed public monitor snapshot.

This does not calculate net P&L. Alpaca may post crypto fee activities later,
and an open BTC position makes the cash difference unsuitable as a result.
"""

from __future__ import annotations

import argparse
import json
from decimal import Decimal, InvalidOperation
from pathlib import Path


def positive_decimal(value: object, field: str) -> Decimal:
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError) as error:
        raise ValueError(f"invalid {field}") from error
    if not number.is_finite() or number <= 0:
        raise ValueError(f"invalid {field}")
    return number


def reconcile(document: dict) -> dict:
    telemetry = document.get("telemetry", document)
    if not telemetry.get("ordersComplete") or not telemetry.get("fillsComplete"):
        raise ValueError("broker order/fill history is incomplete")
    orders = telemetry.get("orders")
    fills = telemetry.get("fills")
    positions = telemetry.get("positions")
    if not all(isinstance(value, list) for value in (orders, fills, positions)):
        raise ValueError("broker orders, fills or positions are absent")

    # SOURCE: the OCaml paper adapter prefixes every bot client order ID.
    bot_orders = [order for order in orders if str(order.get("clientOrderId", "")).startswith("jsbotbtc")]
    bot_ids = {order["id"] for order in bot_orders
               if isinstance(order.get("id"), str) and order["id"]}
    bot_fills = [fill for fill in fills if fill.get("orderId") in bot_ids]
    buy_value = Decimal("0")
    sell_value = Decimal("0")
    buy_count = sell_count = 0
    for fill in bot_fills:
        if fill.get("symbol") not in ("BTCUSD", "BTC/USD"):
            raise ValueError("bot fill has unexpected symbol")
        qty = positive_decimal(fill.get("qty"), "fill quantity")
        price = positive_decimal(fill.get("price"), "fill price")
        if fill.get("side") == "buy":
            buy_value += qty * price
            buy_count += 1
        elif fill.get("side") == "sell":
            sell_value += qty * price
            sell_count += 1
        else:
            raise ValueError("bot fill has unexpected side")
    btc_positions = [position for position in positions
                     if position.get("symbol") in ("BTCUSD", "BTC/USD")]
    if len(btc_positions) > 1:
        raise ValueError("multiple BTC positions returned")
    flat = not btc_positions or Decimal(str(btc_positions[0].get("qty"))) == 0
    return {
        "snapshotAt": telemetry.get("generatedAt"),
        "botOrders": len(bot_orders),
        "botBuyFills": buy_count,
        "botSellFills": sell_count,
        "filledBuyNotionalUsd": str(buy_value),
        "filledSellNotionalUsd": str(sell_value),
        "filledCashDeltaBeforeFeeActivitiesUsd": str(sell_value - buy_value),
        "btcPositionFlat": flat,
        "netResultVerified": False,
        "limitation": "Only bot BTC fills are included. CFEE/FEE activities are absent from this snapshot and may post later. When BTC is open, cash delta includes inventory cost and is not a realized result. Paper fills are simulated.",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot", type=Path)
    args = parser.parse_args()
    print(json.dumps(reconcile(json.loads(args.snapshot.read_text(encoding="utf-8"))), indent=2))

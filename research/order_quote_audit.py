"""Join paper orders to the exact Alpaca quote pair that triggered them.

The inputs are the Dublin raw market capture, OCaml event journal, and signed
monitor snapshot. This is an execution trace audit, not a profitability study.
"""

from __future__ import annotations

import argparse
import json
import re
from bisect import bisect_left
from collections import Counter
from datetime import datetime
from pathlib import Path
from statistics import median

# GUESS: # UNCALIBRATED GUESS — 1s/5s/30s are descriptive post-fill horizons,
# not optimized evaluation windows or thresholds for the trading policy.
MARKOUT_HORIZONS_SECONDS = (1, 5, 30)
# SOURCE: one second is 1,000,000,000 nanoseconds by definition.
NS_PER_SECOND = 1_000_000_000


def fields(message: str) -> dict[str, str]:
    return dict(token.split("=", 1) for token in message.split()
                if "=" in token)


def clean_time(timestamp: str) -> str:
    # SOURCE: the OCaml client_id function retains only alphanumeric chars.
    return re.sub(r"[^A-Za-z0-9]", "", timestamp)


def quote_index(capture: Path | list[Path]) -> dict[str, dict]:
    quotes: dict[str, dict] = {}
    ambiguous: set[str] = set()
    captures = [capture] if isinstance(capture, Path) else capture
    for path in captures:
        with path.open(encoding="utf-8") as stream:
            for line in stream:
                event = json.loads(line).get("event", {})
                if event.get("T") != "q" or event.get("S") != "BTC/USD":
                    continue
                timestamp = event.get("t")
                if timestamp in quotes and (quotes[timestamp]["bp"], quotes[timestamp]["ap"]) != (
                    event.get("bp"), event.get("ap")
                ):
                    ambiguous.add(timestamp)
                else:
                    quotes[timestamp] = event
    for timestamp in ambiguous:
        quotes.pop(timestamp, None)
    return quotes


def _as_epoch_ns(timestamp: str) -> int:
    match = re.fullmatch(
        r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})",
        timestamp,
    )
    if not match:
        raise ValueError("timestamp is not ISO-8601 with a timezone")
    offset = "+00:00" if match.group(3) == "Z" else match.group(3)
    parsed = datetime.fromisoformat(match.group(1) + offset)
    if parsed.tzinfo is None:
        raise ValueError("timestamp lacks a timezone")
    # SOURCE: captured Alpaca event timestamps carry nine fractional digits;
    # preserve that observed nanosecond precision in the horizon comparison.
    fraction_ns = int(((match.group(2) or "")[:9]).ljust(9, "0") or "0")
    return int(parsed.timestamp()) * NS_PER_SECOND + fraction_ns


def fill_midpoint_response(quotes: dict[str, dict], records: list[dict],
                           fills: list[dict]) -> dict:
    """Measure directional mid-price response after actual paper fills.

    This is a descriptive markout, not realized P&L: it excludes fees and
    simulates no live queue, impact or execution conditions.
    """
    hot_orders = {record["clientOrderId"]: record for record in records}
    timed_quotes = sorted((_as_epoch_ns(timestamp), event)
                          for timestamp, event in quotes.items())
    times = [item[0] for item in timed_quotes]
    per_horizon: dict[int, dict[str, list[tuple[float, float]]]] = {
        seconds: {} for seconds in MARKOUT_HORIZONS_SECONDS
    }
    total_hot_fills = 0
    missing_quote_after_horizon: Counter[int] = Counter()
    quote_delays_ms: dict[int, list[float]] = {
        seconds: [] for seconds in MARKOUT_HORIZONS_SECONDS
    }
    for fill in fills:
        client_id = fill.get("clientOrderId")
        decision = hot_orders.get(client_id)
        if decision is None:
            continue
        try:
            fill_at_ns = _as_epoch_ns(str(fill["transactionTime"]))
            fill_price = float(fill["price"])
            fill_qty = float(fill["qty"])
            if not fill_price > 0 or not fill_qty > 0:
                continue
        except (KeyError, TypeError, ValueError):
            continue
        total_hot_fills += 1
        side_sign = 1. if decision["side"] == "buy" else -1.
        for horizon in MARKOUT_HORIZONS_SECONDS:
            target = fill_at_ns + horizon * NS_PER_SECOND
            index = bisect_left(times, target)
            if index >= len(timed_quotes):
                missing_quote_after_horizon[horizon] += 1
                continue
            quote_at_ns, event = timed_quotes[index]
            try:
                bid = float(event["bp"])
                ask = float(event["ap"])
                if bid <= 0 or ask < bid:
                    missing_quote_after_horizon[horizon] += 1
                    continue
                midpoint = (bid + ask) / 2.
            except (KeyError, TypeError, ValueError):
                missing_quote_after_horizon[horizon] += 1
                continue
            # SOURCE: 10,000 basis points per unit relative-price change.
            response_bps = ((midpoint / fill_price) - 1.) * 10_000. * side_sign
            order_values = per_horizon[horizon].setdefault(client_id, [0., 0.])
            order_values[0] += response_bps * fill_qty
            order_values[1] += fill_qty
            # SOURCE: one millisecond is 1,000,000 nanoseconds by definition.
            quote_delays_ms[horizon].append((quote_at_ns - target) / 1_000_000.)

    summaries = {}
    for horizon, by_order in per_horizon.items():
        order_responses = [weighted / quantity for weighted, quantity in by_order.values()
                           if quantity > 0]
        summaries[f"{horizon}s"] = {
            "filledOrdersWithQuote": len(order_responses),
            "medianSignedMidpointResponseBps": median(order_responses)
                if order_responses else None,
            "positiveOrderShare": sum(value > 0 for value in order_responses) / len(order_responses)
                if order_responses else None,
            "fillsWithoutFutureQuote": missing_quote_after_horizon[horizon],
            "quoteDelaySampleCount": len(quote_delays_ms[horizon]),
            "medianQuoteDelayAfterHorizonMs": median(quote_delays_ms[horizon])
                if quote_delays_ms[horizon] else None,
            "maxQuoteDelayAfterHorizonMs": max(quote_delays_ms[horizon])
                if quote_delays_ms[horizon] else None,
        }
    return {"available": True, "hotOrderFills": total_hot_fills,
            "byHorizon": summaries,
            "scope": "Paper fill-to-midpoint response only; grouped by order, fee-free and not a profitability estimate."}


def audit(capture: Path | list[Path], journal: Path, snapshot: dict) -> dict:
    telemetry = snapshot.get("telemetry", snapshot)
    if not telemetry.get("ordersComplete"):
        raise ValueError("broker order pagination is incomplete")
    orders = {order["clientOrderId"]: order for order in telemetry["orders"]
              if str(order.get("clientOrderId", "")).startswith("jsbotbtc")}
    quotes = quote_index(capture)
    samples: dict[str, dict[str, str]] = {}
    sends: list[dict[str, str]] = []
    with journal.open(encoding="utf-8") as stream:
        for line in stream:
            event = json.loads(line)
            message = event["message"]
            if message.startswith("HOT_SAMPLE "):
                row = fields(message)
                if row.get("candidate") == "true":
                    samples[row["quote_time"]] = row
            elif message.startswith("SEND paper "):
                row = fields(message)
                row["at"] = event["at"]
                row["side"] = message.split()[2]
                sends.append(row)

    records = []
    unmatched = []
    for send in sends:
        client_id = send["id"]
        sample_time = next((timestamp for timestamp in samples
                            if client_id == "jsbotbtc" + send["side"] + clean_time(timestamp)), None)
        if sample_time is None:
            # The older REST loop has no HOT_SAMPLE event and is outside scope.
            continue
        sample = samples[sample_time]
        reference = quotes.get(sample["reference_quote_time"])
        current = quotes.get(sample_time)
        broker_order = orders.get(client_id)
        if reference is None or current is None or broker_order is None:
            unmatched.append(client_id)
            continue
        side = send["side"]
        if side == "buy":
            crossing = float(current["bp"]) - float(reference["ap"])
            reference_price = float(reference["ap"])
        elif side == "sell":
            crossing = float(reference["bp"]) - float(current["ap"])
            reference_price = float(reference["bp"])
        else:
            raise ValueError("unexpected order side")
        # SOURCE: 10,000 basis points per unit price return.
        crossing_bps = crossing / reference_price * 10_000
        if crossing <= 0:
            raise ValueError(f"order {client_id} lacks its claimed quote cross")
        records.append({
            "clientOrderId": client_id,
            "side": side,
            "brokerStatus": broker_order.get("status"),
            "submittedAt": broker_order.get("submittedAt"),
            "referenceQuoteTime": sample["reference_quote_time"],
            "quoteTime": sample_time,
            "referenceBid": reference["bp"],
            "referenceAsk": reference["ap"],
            "currentBid": current["bp"],
            "currentAsk": current["ap"],
            "crossingBps": crossing_bps,
            "requestedQty": broker_order.get("qty"),
            "filledQty": broker_order.get("filledQty"),
            "filledAvgPrice": broker_order.get("filledAvgPrice"),
        })
    crossing_values = [record["crossingBps"] for record in records]
    fills_complete = telemetry.get("fillsComplete") is True
    fill_response = fill_midpoint_response(quotes, records, telemetry.get("fills", [])) \
        if fills_complete else {"available": False, "reason": "broker fill history is incomplete or unavailable"}
    return {
        "snapshotAt": telemetry.get("generatedAt"),
        "matchedHotOrders": len(records),
        "unmatchedHotOrderIds": unmatched,
        "brokerStatuses": dict(Counter(record["brokerStatus"] for record in records)),
        "canceledWithPartialFill": sum(record["brokerStatus"] == "canceled" and
                                       float(record["filledQty"]) > 0 for record in records),
        "canceledWithoutFill": sum(record["brokerStatus"] == "canceled" and
                                    float(record["filledQty"]) == 0 for record in records),
        "minQuoteCrossingBps": min(crossing_values) if crossing_values else None,
        "medianQuoteCrossingBps": median(crossing_values) if crossing_values else None,
        "maxQuoteCrossingBps": max(crossing_values) if crossing_values else None,
        "fillMidpointResponse": fill_response,
        "orders": records,
        "scope": "Only HOT_SAMPLE-triggered OCaml paper orders are matched. Quotes are exact archived Alpaca US WebSocket events. Earlier REST orders, fees and net P&L are outside scope.",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("capture", type=Path, nargs="+")
    parser.add_argument("journal", type=Path)
    parser.add_argument("snapshot", type=Path)
    args = parser.parse_args()
    snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    print(json.dumps(audit(args.capture, args.journal, snapshot), indent=2))

"""Join paper orders to the exact Alpaca quote pair that triggered them.

The inputs are the Dublin raw market capture, OCaml event journal, and signed
monitor snapshot. This is an execution trace audit, not a profitability study.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from statistics import median


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

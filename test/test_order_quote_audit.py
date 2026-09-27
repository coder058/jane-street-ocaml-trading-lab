"""Verify the paper order audit joins the actual trigger quote pair."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "research"))

from order_quote_audit import audit  # noqa: E402


class OrderQuoteAuditTests(unittest.TestCase):
    def test_quote_cross_and_broker_status_are_joined(self) -> None:
        # SOURCE: synthetic quote prices and times test ID and inequality
        # matching only; they are not observed data or trading thresholds.
        prior = "2026-09-27T00:00:00Z"
        current = "2026-09-27T00:01:00Z"
        client_id = "jsbotbtcbuy20260927T000100Z"
        with tempfile.TemporaryDirectory() as temporary:
            capture = Path(temporary) / "capture.jsonl"
            journal = Path(temporary) / "events.jsonl"
            capture.write_text("\n".join(json.dumps({"event": event}) for event in [
                {"T": "q", "S": "BTC/USD", "t": prior, "bp": 99, "ap": 100},
                {"T": "q", "S": "BTC/USD", "t": current, "bp": 101, "ap": 102},
            ]), encoding="utf-8")
            journal.write_text("\n".join(json.dumps({"at": current, "message": message})
                                         for message in [
                f"HOT_SAMPLE reference_quote_time={prior} quote_time={current} candidate=true policy=quote_cross_30s_v1",
                f"SEND paper buy BTC/USD qty=1 limit=102 id={client_id}",
            ]), encoding="utf-8")
            snapshot = {"generatedAt": current, "ordersComplete": True, "orders": [
                {"id": "order", "clientOrderId": client_id, "status": "filled",
                 "qty": "1", "filledQty": "1", "filledAvgPrice": "102"},
            ]}
            result = audit(capture, journal, snapshot)
        self.assertEqual(result["matchedHotOrders"], 1)
        self.assertEqual(result["brokerStatuses"], {"filled": 1})
        self.assertEqual(result["orders"][0]["referenceAsk"], 100)
        self.assertEqual(result["orders"][0]["currentBid"], 101)

    def test_incomplete_broker_orders_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            empty = Path(temporary) / "empty.jsonl"
            empty.write_text("", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "incomplete"):
                audit(empty, empty, {"ordersComplete": False})


if __name__ == "__main__":
    unittest.main()

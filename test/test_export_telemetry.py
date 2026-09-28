"""Decision history must join a broker order by its encoded quote timestamp."""

from __future__ import annotations

import sys
import json
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "deploy"))

from export_telemetry import decision_history, market_research_state  # noqa: E402


class DecisionHistoryTests(unittest.TestCase):
    def test_market_projection_omits_private_capture_paths(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "shadow.json"
            frames = {name: {"completeBars": 1, "contiguousTailBars": 1,
                             "lastBarStart": "2026-09-27T23:00:00Z", "trend": None,
                             "candleShapes": []}
                      for name in ("1m", "5m", "30m", "60m", "240m")}
            path.write_text(json.dumps({"asOf": "2026-09-27T23:01:00Z",
                                        "captureFiles": ["/private/market.jsonl"],
                                        "orderAuthority": False,
                                        "symbols": [{"symbol": "BTC/USD", "frames": frames}]}),
                            encoding="utf-8")
            projection = market_research_state(path)
            self.assertNotIn("captureFiles", projection)
            self.assertNotIn("/private", json.dumps(projection))
            self.assertFalse(projection["orderAuthority"])

    def test_old_decision_is_joined_without_nearest_event_guess(self) -> None:
        # SOURCE: synthetic quote values chosen to encode an exact 10 bp upward cross.
        events = [
            {"at": "2026-09-27T00:00:00Z", "message":
             "HOT_SAMPLE reference_quote_time=2026-09-26T23:59:30Z "
             "quote_time=2026-09-27T00:00:00Z window_ms=30000 candidate=true "
             "policy=quote_cross_30s_v1"},
            {"at": "2026-09-27T00:00:00Z", "message":
             "HOT_DECISION quote_time=2026-09-27T00:00:00Z "
             "receive_to_decision_ms=5.3 candidate=true "
             "policy=quote_cross_30s_v1 trend=falling probability=unknown "
             "reference_bid=99.5 reference_ask=100 current_bid=100.1 "
             "current_ask=100.2 cross_direction=up trigger_move_bps=10.00000000"},
            {"at": "2026-09-27T00:00:01Z", "message":
             "HOT_DECISION quote_time=2026-09-27T00:00:01Z policy=other"},
        ]
        orders = [{"id": "one", "clientOrderId": "jsbotbtcbuy20260927T000000Z",
                   "side": "buy"},
                  {"id": "outside", "clientOrderId": "manual", "side": "buy"}]
        history = decision_history(events, orders)
        self.assertEqual(set(history), {"one"})
        self.assertEqual(history["one"]["policy"], "quote_cross_30s_v1")
        self.assertEqual(history["one"]["reference_quote_time"],
                         "2026-09-26T23:59:30Z")
        self.assertEqual(history["one"]["receive_to_decision_ms"], "5.3")
        self.assertEqual(history["one"]["reference_bid"], "99.5")
        self.assertEqual(history["one"]["current_ask"], "100.2")
        self.assertEqual(history["one"]["cross_direction"], "up")
        self.assertEqual(history["one"]["trigger_move_bps"], "10.00000000")
        self.assertNotIn("other", str(history))


if __name__ == "__main__":
    unittest.main()

"""Decision history must join a broker order by its encoded quote timestamp."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "deploy"))

from export_telemetry import decision_history  # noqa: E402


class DecisionHistoryTests(unittest.TestCase):
    def test_old_decision_is_joined_without_nearest_event_guess(self) -> None:
        events = [
            {"at": "2026-09-27T00:00:00Z", "message":
             "HOT_SAMPLE reference_quote_time=2026-09-26T23:59:30Z "
             "quote_time=2026-09-27T00:00:00Z window_ms=30000 candidate=true "
             "policy=quote_cross_30s_v1"},
            {"at": "2026-09-27T00:00:00Z", "message":
             "HOT_DECISION quote_time=2026-09-27T00:00:00Z "
             "receive_to_decision_ms=5.3 candidate=true "
             "policy=quote_cross_30s_v1 trend=falling probability=unknown"},
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
        self.assertNotIn("other", str(history))


if __name__ == "__main__":
    unittest.main()

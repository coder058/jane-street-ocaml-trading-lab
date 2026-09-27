"""Cash-flow audit must exclude other assets and refuse incomplete history."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "research"))

from paper_fill_cash_flow import reconcile  # noqa: E402


class PaperFillCashFlowTests(unittest.TestCase):
    def setUp(self) -> None:
        # SOURCE: synthetic values test arithmetic and filtering only; they
        # are not observed trades or suggested order sizes.
        self.snapshot = {
            "generatedAt": "2026-09-27T00:00:00Z",
            "ordersComplete": True, "fillsComplete": True,
            "orders": [
                {"id": "bot-buy", "clientOrderId": "jsbotbtcbuy1"},
                {"id": "bot-sell", "clientOrderId": "jsbotbtcsell2"},
                {"id": "other", "clientOrderId": "external-order"},
            ],
            "fills": [
                {"orderId": "bot-buy", "symbol": "BTCUSD", "side": "buy", "qty": "0.01", "price": "100"},
                {"orderId": "bot-sell", "symbol": "BTCUSD", "side": "sell", "qty": "0.01", "price": "105"},
                {"orderId": "other", "symbol": "AAPL", "side": "buy", "qty": "10", "price": "100"},
            ],
            "positions": [{"symbol": "AAPL", "qty": "10"}],
        }

    def test_bot_only_cash_delta_when_flat(self) -> None:
        result = reconcile(self.snapshot)
        self.assertEqual(result["filledCashDeltaBeforeFeeActivitiesUsd"], "0.05")
        self.assertTrue(result["btcPositionFlat"])
        self.assertFalse(result["netResultVerified"])

    def test_open_btc_is_not_a_closed_result(self) -> None:
        self.snapshot["positions"].append({"symbol": "BTCUSD", "qty": "0.01"})
        result = reconcile(self.snapshot)
        self.assertFalse(result["btcPositionFlat"])
        self.assertFalse(result["netResultVerified"])

    def test_incomplete_history_is_rejected(self) -> None:
        self.snapshot["fillsComplete"] = False
        with self.assertRaisesRegex(ValueError, "incomplete"):
            reconcile(self.snapshot)


if __name__ == "__main__":
    unittest.main()

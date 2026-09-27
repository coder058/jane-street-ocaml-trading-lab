# Six-hour paper trading development window

The user requested six hours of continued work toward a reliable and profitable
agent. Profitability and perfection cannot be promised or established by a
short paper sample. The Dublin VPS runs the paper service and collector between
Codex follow-ups. This file is the handoff for the scheduled follow-up loop.

## Starting evidence

- At 18:25:38 UTC on 27 September 2026, the complete signed broker snapshot
  showed 64 bot orders, 74 bot fills and zero open BTC. Executed sell notional
  minus buy notional was −$1.11455685460 before fee activities. The exact
  calculation is in `research/paper_fill_cash_flow.py`; `CFEE` and `FEE` both
  returned zero rows around 18:26 UTC. Net paper P&L is unverified.
- At 18:27 UTC, an IOC order targeting $100 was partially filled, then
  canceled. Its filled quantity was 0.000471840 BTC; the reconciled position
  was 0.000470659 BTC. No pending or open order remained at the check.
- Current order policy remains `quote_cross_30s_v1`, which uses no technical
  indicator or Markov probability. Closed-bar indicators and the 5m Markov
  audit are descriptive only. The previously examined July–September data are
  not a pristine test set.

## Next verified steps

1. Recheck service, feed, broker position, open orders and pending journal.
   If their state conflicts, halt new submissions and diagnose before restart.
2. Reconcile all bot fills with Alpaca `CFEE`/`FEE` activities when posted;
   distinguish gross filled cash flow, open inventory and actual net P&L.
3. Join each bot order to the exact archived quote pair, order timings and
   broker status. Measure cancellations, partial fills, quote age, spread and
   results by rule. Preserve all attempted policy variants in the research log.
4. Evaluate Murphy-style trend and candle shapes at a declared horizon, with
   a Markov transition model and a chronological forward test that has not
   been used for model selection. Include bid/ask and the actual fee tier.
5. Run any candidate in shadow mode first. Give it paper order authority only
   if measured evidence, broker reconciliation and safety checks support the
   change. Do not activate the user-requested $50/$500 probability tiers from
   raw, uncalibrated frequencies.
6. Update the monitor with broker-backed result and the exact policy that
   authorized each order. Test, commit, deploy and verify every change.

Keep the hardcoded paper endpoint, AAPL protection, durable pending journal,
$100 baseline and $500 BTC exposure ceiling. Paper fills do not establish a
profitable live strategy; if evidence stays negative or inconclusive, report
that rather than forcing more trades.

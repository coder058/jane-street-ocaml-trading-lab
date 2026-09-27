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

## 18:54 UTC follow-up

- Dublin paper service, capture and timers were active. The broker reported
  zero BTC, no open order and no local pending journal. The complete signed
  snapshot at 18:54:40 UTC contained 68 bot orders and 83 bot fills; BTC was
  flat. Executed buy notional was $572.85303188063 and sell notional was
  $571.41097310016, leaving **−$1.44205878047** of filled cash difference
  before posted fee activities. This is not verified net P&L.
- The read-only [order-to-quote audit](../research/order_quote_audit.py)
  matched 43 WebSocket-initiated orders to the exact archived Alpaca US quote
  pair and broker status, with zero unmatched orders. The broker marked 26
  filled and 17 canceled; four cancellations had partial fills and 13 had no
  fill. The trigger quote crossing ranged from 0.04847 to 6.63402 basis points
  (median 2.35120). This is trigger magnitude, not expected forward return.
  The earlier REST orders are outside this trace audit.
- No replacement policy was deployed. The quote-cross rule has no measured
  net edge and cannot be called profitable from these observations.

## 19:24 UTC follow-up (work through 19:32 UTC)

- Dublin's paper order service, market capture, five-minute bar timer and new
  Markov shadow timer were active; the pending-order file was absent. No order
  policy or risk limit was changed.
- The public signed broker snapshot generated at 19:30:35 UTC contained 72 bot
  orders, 92 bot fills and an open BTC position of 0.001176752 BTC with broker
  market value $99.751367. Therefore the cumulative filled cash difference of
  −$101.76139933885 is **not a realized loss**: it includes the open inventory.
  It remains before fee activities. A fresh read-only paper Activities query
  returned zero `CFEE` and zero `FEE` rows at 19:32 UTC. Alpaca says crypto
  fees can post at end of day, so net paper P&L remains unverified.
- A quantity reconciliation found that bot buy fills minus bot sell fills
  exceeded the broker BTC position by 0.000016938 BTC at the 18:54 flat
  checkpoint (0.2504027% of bot buy-filled BTC), and by 0.000022836 BTC at
  19:30 (0.2503131%). This closely matches Alpaca's published tier-one
  0.25% taker fee on the BTC credited for buys. It is a consistency check,
  not proof of every fee entry: do not subtract another 0.25% buy fee from
  the observed flat cash difference without matching actual activities.
  The cash-flow auditor now reports the unexplained BTC quantity explicitly.
- The frozen descriptive candle/Markov model uses 52,070 adjacent labels and
  73 states with both bars strictly before 1 July 2026. The older audit's
  52,071 development labels included one transition into July; this frozen
  artifact excludes it. Its historical bars were fetched in September and
  may contain later revisions. The July–September analysis has already been
  inspected and cannot serve as an independent holdout.
- A read-only shadow evaluator is installed in Dublin. It writes predictions
  only for a bar observed before the following bar closes, then logs labels
  on later retrieval. Its initial manual execution succeeded but wrote no
  prediction because the snapshot was stale for that horizon. At 19:29:44,
  the latest retrieved bar started at 19:20; it left only about 16 seconds
  until the next five-minute close. The shadow now also runs immediately after
  each successful bar refresh and records actual lead time. Verify the
  subsequent label before scoring a forward evaluation sample. Even valid
  samples measure next midpoint close, not
  executable after-cost returns.
- At 19:34:46 the refresh automatically triggered the first real shadow
  prediction for the 19:25 bar, with a recorded lead of **13.562538 seconds**
  before the next bar's close. This is much too late to claim a five-minute
  forecast horizon. The label had not arrived at this checkpoint. The
  historical state frequency for this one observation was 0.5204565408252854
  from 5,695 training labels; this is not a calibrated chance of a profitable
  trade and did not authorize an order. At 19:39:53 the following bar was
  retrieved and labeled down, with a next-close midpoint move of −0.50480
  basis points. This is one outcome, not a performance estimate. The next
  recorded prediction had only 6.515208 seconds of lead time, confirming
  the REST path cannot currently support the intended five-minute horizon.
- The captured live one-minute bar stream delivered 653 closed bars over 690
  elapsed slots, with 37 missing minute slots; 108 of 138 five-minute groups
  had all five minute bars. Among 106 complete groups also present in the
  later REST snapshot, the median and 90th percentile absolute close-price
  difference were both zero, and the maximum was 0.09129 basis points. The
  stream bar reached the VPS around 60.05 seconds after its bar *start*,
  roughly at one-minute close. These observations support investigating a
  timely stream-based five-minute aggregator with strict gap handling. The
  37 missing slots prohibit assuming a continuous feed.
- Twelve Python tests passed, including a boundary check that excludes the
  July label and a point-in-time shadow prediction/label check. The old
  descriptive audit metrics did not change after the state refactor.

## Next verified steps

1. Recheck service, feed, broker position, open orders and pending journal.
   If their state conflicts, halt new submissions and diagnose before restart.
2. Reconcile all bot fills with Alpaca `CFEE`/`FEE` activities when posted;
   distinguish gross filled cash flow, open inventory and actual net P&L.
3. Continue the order-to-quote audit with order timings, decision quote age,
   spread and subsequent fills. Measure results by rule and preserve all
   attempted policy variants in the research log. The exact quote-pair and
   status join is already implemented for the WebSocket path.
4. Evaluate Murphy-style trend and candle shapes at a declared horizon, with
   a Markov transition model and a chronological forward test that has not
   been used for model selection. Include bid/ask and the actual fee tier.
   For an actionable five-minute horizon, construct a timely as-received bar
   source and measure its gaps/revisions; current REST snapshots arrive with
   only about 14 seconds remaining until the next bar close.
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

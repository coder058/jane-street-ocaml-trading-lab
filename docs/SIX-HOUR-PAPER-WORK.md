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

## 19:24 UTC follow-up (work through 19:41 UTC)

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
  recorded prediction had only 6.515208 seconds of lead time. The interval
  timer was drifting relative to the UTC five-minute closes; later samples
  near an exact close had almost five minutes of lead. Do not attribute the
  inconsistent lead times to unavoidable REST latency.
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

## 19:54 UTC follow-up (work through 20:01 UTC)

- Dublin's paper service, capture, telemetry, bar refresh and Markov shadow
  timers were active. The broker check reported no open orders, and there was
  no local pending-order journal. The 19:53 signed snapshot still had 72 bot
  orders, 92 bot fills and 0.001176752 BTC open. Recent journal samples were
  `candidate=false` under `quote_cross_30s_v1`; no new policy was deployed.
  The account Activities query still returned zero `CFEE` and `FEE` rows.
- The bar refresher used `OnUnitActiveSec=5min`, so execution time drifted
  through the five-minute boundary. The last two pre-change executions at
  19:50:00 and 19:55:00 already produced close-to-full-horizon predictions.
  The timer is now anchored to UTC five-minute closes at +5 seconds, with a
  +30-second retry if the API is late. This 5/30-second choice is an
  **uncalibrated scheduling guess**, based on the observed availability at
  about +1 second; collect more cycles before trusting the cadence.
- At 20:00:06 the aligned refresh retrieved the 19:55 bar, and shadow
  prediction had 293.374145 seconds before the next close. The 20:00:30
  retry returned the same bar; the shadow journal wrote no duplicate event.
  The order service remained active throughout. This verifies one aligned
  cycle, not long-run feed reliability.
- The chronological shadow scorer checks pairing, duplicate events and
  prediction-before-close. At 20:00 it had 6 predictions, 5 later labels and
  1 unlabeled prediction. The 5 scored examples had lead times from 3.525722
  to 299.494861 seconds, so they should not be pooled as equal-horizon
  evidence. The model Brier was 0.283329 versus 0.249920 for its frozen
  base-rate predictor on this tiny mixed sample. None had a positive
  next-midpoint move above the 50-basis-point first-tier taker fee-only
  round-trip hurdle. No after-cost edge follows from five examples.
- A pre-July state-mean audit found 1 of 73 states with a mean next-bar
  midpoint rise over that 50-basis-point fee-only hurdle. It had only 9
  training occurrences and zero occurrences in the already-inspected
  July–September interval. It does not support a probability size tier or
  order policy. The Brier score measures direction, not executable return.
- The exact baseline and rejected fee screen are recorded in
  [POLICY-ATTEMPTS.md](POLICY-ATTEMPTS.md), including their data limitations
  and the conditions required before reconsidering order authority.
- Fifteen Python tests passed, including the scorer's time-order and
  duplicate guards. No OCaml order logic changed.

## 22:47–22:57 UTC follow-up

- Dublin reported the paper order service, market capture, five-minute bar,
  Markov shadow and telemetry timers active at 22:56:37 UTC. The durable
  `NO_PENDING` marker was absent. The public signed snapshot at 22:55:54 UTC
  contained 95 broker orders, of which 94 carried the bot's BTC prefix, and
  121 broker fills, of which 118 carried that prefix. A broker BTC position of
  0.001184993 BTC had a reported market value of $99.700583. AAPL remained a
  separate protected position. This is a point-in-time service check, not a
  continuous uptime measurement.
- The preceding flat snapshot at 22:47:24 UTC had 93 bot orders, 117 bot fills,
  filled buys of $1062.80916274819 and filled sells of $1059.938718984512.
  Their cash difference was −$2.870443763678 while the broker reported no BTC
  position. Gross filled BTC quantity differed by 0.000031415 BTC, or
  0.2502534% of bought BTC. This is consistent with a buy-side asset fee, but
  the fee activities were not newly reconciled in this follow-up. No verified
  net P&L can be stated.
- A replacement dashboard was built locally with one row per broker order,
  partial-fill status, a selected-order trace, filterable entries and exits,
  the open BTC position, and an indicative bot-only cash-plus-mark figure.
  The indicator explicitly excludes AAPL, requires complete order/fill
  histories, and hides the figure if any non-bot BTC order or missing BTC mark
  prevents attribution. It does not label paper results as live profit.
  Closed-trade net P&L is shown as unverified until broker fee activities and
  position lots can be reconciled.
  A 22:55:54 UTC snapshot produced an indicative marked figure of
  −$3.1573682976477926 (buy fills $1162.7966702821598, sell fills
  $1059.938718984512, broker BTC mark $99.700583); this is not an executable
  liquidation price or verified net P&L.
- Seven web tests, TypeScript typecheck and Next.js production build passed
  before publishing. The order policy and VPS executable were not changed.

## 23:05–23:12 UTC monitor correction

- The user correctly identified a presentation failure: the large four-decimal
  negative USD figure could be read as thousands, while actual fills were
  below several large panels and canceled orders were mixed into the default
  list. No trading policy changed in this correction.
- The public signed snapshot at 23:06:01 UTC had 98 broker orders, 127 fills
  and an incomplete 4,000-row public journal. A local join of that retained
  journal found recorded decisions for 65 of 97 bot orders; older reasons were
  dropping from the public window even though the VPS still held the full
  append-only journal. This is a data-presentation defect, not evidence that
  those older orders lacked a decision.
- The monitor code now puts the latest Alpaca paper executions first, groups
  fills by broker order, displays execution amount, BTC quantity, average
  price, time and the actual recorded quote-cross rule, and defaults the full
  history to executed orders. Canceled attempts are a separate filter. The
  indicative USD amount is rounded to cents with an explicit USD unit, and
  net closed-trade P&L remains labeled unverified.
- The telemetry exporter now derives a compact per-order decision history from
  the complete owner-controlled journal, matched by the encoded quote time
  rather than a nearby timestamp. The test covers an old decision, its prior
  quote time and a neighboring unrelated event. Seven web tests, one exporter
  test, TypeScript typecheck and production build passed locally. Deployment
  and live verification remained to be done at this checkpoint.
- Vercel deployed the execution-first UI. The exporter candidate passed a
  read-only dry run on Dublin in `PAPER_ORDER` mode with 99 orders, 130 fills,
  73 matched decision records and an 804,823-byte signed payload. It replaced
  only the read-only telemetry exporter; the OCaml order executable and its
  policy were untouched. A signed public snapshot at 23:14:22 UTC contained
  74 compact decision records. Among its 73 executed bot orders, 52 had an
  exact recorded decision; the other 21 were earlier executions, all at or
  before 10:25 UTC, for which this decision trace is unavailable. The UI must
  say so for those rows and must not invent their individual triggers.
- The live page rendered 73 executed orders, 127 individual broker fills and
  a flat BTC position at 23:13:40 UTC. Its visible approximate cash difference
  was −$3.18 USD; this remains **unverified net P&L**. The latest displayed
  exit grouped three fills into $30.09 at an average $84,176.31/BTC and showed
  the recorded quote-cross condition. A concise explanation of the actual
  OCaml decision sequence was added from the implementation, without claiming
  that the rule predicts after-cost profits. Mobile navigation and wording
  were tightened; the public UI then showed two recent executions and the
  complete history link, and filtering exits plus selecting a trade updated
  the inspector in the browser. A sub-cent open P&L display was corrected so
  rounding cannot show a misleading negative zero. The final deployment check
  for that last formatting change remained outstanding at this checkpoint.
- At 23:23 UTC, a read-only paper asset inventory found 73 active tradable
  crypto pairs, 36 against USD. DIA, XLE and XOP were active/tradable US
  equity ETF proxies, not actual Dow or energy commodity feeds. This catalog
  count is not a measured simultaneous stream capacity.
- At 23:26 UTC, the Dublin collector was changed to archive ETH/USD and
  SOL/USD quotes and closed/revised minute bars alongside BTC/USD. The local
  OCaml socket still receives only BTC events; the order executable and its
  $100/$500 paper controls did not change. The Alpaca subscription authenticated
  and both new symbols produced real quotes and a closed minute bar. The
  collector had no restart or error immediately after rollout, and the OCaml
  service logged a new BTC feed baseline. Nineteen Python tests passed before
  deployment, including the BTC-only routing and gap/revision checks.
- An as-received, as-of UTC aggregator now audits 1m/5m/30m/1h/4h bars without
  fabricating missing minutes. At 23:27:57 UTC, BTC had 867 distinct closed
  1m bars, 140 complete 5m groups, 13 complete 30m groups, five complete 1h
  groups and zero complete 4h groups in that day's capture. ETH and SOL each
  had one closed minute after joining. No new symbol or timeframe has order
  authority; no stop distance or win probability is calibrated.
- At 23:30 UTC, the read-only Alpaca US historical 5m scan found 13 of the
  36 paper-tradable USD pairs with no missing slot between their first and
  last returned bar for the UTC day. ETH had 250 bars with 32 gaps and SOL
  had 280 with two gaps. This retrieval-later scan is only a data-coverage
  screen, not a point-in-time strategy test. The authenticated stream was
  expanded at 23:31 UTC to those 13 plus ETH and SOL, 15 symbols total,
  retaining BTC-only hot fanout and order authority. Ten symbols had actual
  events in the first 30 seconds; sustained throughput and all-symbol bar
  coverage remain unmeasured.

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
   First verify that the new aligned REST timer keeps roughly five minutes of
   lead, then compare it with timely as-received stream bars and measure gaps
   and revisions. Exclude old short-lead samples from any full-horizon score.
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

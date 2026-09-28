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
- At 23:36 UTC, a manual read-only shadow run processed the 15-symbol capture
  in 0.850 seconds and wrote private 1m/5m/30m/1h/4h bar coverage plus candle
  shapes and EMA trends. BTC's latest contiguous 5m tail contained only 20
  complete groups, so its 5m EMA trend stayed unavailable. The new systemd
  timer is enabled for one run per UTC minute. Its first scheduled run at
  23:37:05 UTC completed successfully in 0.939 seconds, and the next trigger
  was scheduled for 23:38 UTC. This research process has no broker imports,
  credentials, network calls or order authority.
- The telemetry exporter was extended to publish only the shadow's timestamp,
  symbol names, per-frame coverage and descriptive labels, omitting private
  capture file paths. A read-only VPS dry run at 23:40 UTC contained 102 broker
  orders, 132 fills and 76 matched decision traces; its signed body was
  817,768 bytes, below the existing 1 MiB ingest bound. The candidate replaced
  the exporter with a backup retained. A manual telemetry service run succeeded
  but skipped upload because the prior digest was unchanged and its heartbeat
  was not yet due. Public monitor visibility remains to be verified.

## 09:31–09:35 UTC follow-up (28 September)

- Dublin's paper service, Alpaca capture and Hyperliquid read-only capture were
  active at the checks. The paper service had zero systemd restarts at 09:11;
  the pending-order journal was absent and a complete broker query shortly
  before the planned restart found zero unresolved orders.
- The complete read-only snapshot at 09:31:38 UTC contained 252 bot orders,
  180 buy fills and 227 sell fills. Buy notional was $4,136.980382580415 and
  sell notional was $4,110.776598744178, a filled cash difference of
  −$26.203783836237 before fee activities. It is not a realized or net P&L:
  the broker held 0.000186743 BTC marked at $15.460531. `CFEE` and `FEE` each
  returned zero rows. The 0.000123549 BTC gross quantity difference is about
  0.250166% of bought quantity, consistent with an asset fee but not a matched
  fee attribution. Net paper P&L remains unverified.
- Broker order and fill histories were complete, but the public decision
  journal was capped at 4,000 events. Exact trace matching found 227 bot orders
  with a decision record and 25 without one. Do not invent triggers for those
  missing records.
- Hyperliquid health read five archived sessions with 784,955 BBO updates,
  82,035 candle updates and 6,824 allMids updates; it saw 126 distinct mid
  symbols including the 14 selected contracts, zero locally archived sequence
  gaps and zero malformed lines. The live hourly gzip member correctly appears
  under `incompleteGzipFiles` until it is rotated and closed; this is not proof
  of provider-side completeness.
- The first live health scan had aborted on that open gzip trailer. The scanner
  now retains its flushed prefix and reports the partial file. A synthetic
  regression test covers that case; 21 Python tests pass.
- New OCaml decision records now include both quote pairs, cross direction and
  trigger distance in basis points. The arithmetic is a pure tested helper for
  upward, downward and absent crosses. The remote Dune 3.24.2 build and all
  OCaml tests passed. The monitor has corresponding fields and the exporter
  allowlist preserves them; eight web tests, TypeScript typecheck and a Next.js
  production build passed. The read-only exporter passed a dry run with 254
  orders, 411 fills, 228 decision records and a 976,762-byte payload. It and
  the OCaml binary were installed after complete broker queries showed zero
  unresolved orders and the durable pending journal was absent. The service
  restarted in paper mode and loaded 194 contiguous BTC bars after the
  multi-symbol warmup fix. No strategy or risk limit changed.

## 09:53 UTC follow-up (28 September)

- The signed public monitor now serves commit `85f7881`. Its GitHub `monitor`
  job passed tests, TypeScript and production build. The OCaml Actions job
  also passed opam setup, Dune build and the full OCaml suite; both workflow
  jobs completed successfully at 09:48:21 UTC.
- The live page showed a 09:53:25 UTC broker snapshot, 193 executed orders and
  417 fills. The latest BTC position was 0.000119779 BTC, marked at $9.91.
  Its displayed cash-plus-mark amount was −$10.84 USD, explicitly indicative;
  closed-trade net P&L remains not verified.
- At 09:53:50 UTC, the read-only reconciliation found 255 bot orders, 185 buy
  fills and 232 sell fills. Buy notional was $4,206.982393537615 and sell
  notional $4,186.234458128558, cash difference −$20.747935409057 before fee
  activities. `CFEE`/`FEE` each still returned zero rows, and a quantity
  difference of 0.000125670 BTC remains unattributed. Orders/fills pagination
  was complete; the 4,000-event public journal was not complete. Net P&L is
  still unverified.
- The order/quote auditor originally read only the 28 September file, which
  made 78 prior-day orders look unmatched. It now accepts multiple daily files;
  across 27–28 September it matched 230/230 HOT_SAMPLE orders to their exact
  captured quote pair and broker status, with zero unmatched. There were 101
  filled and 129 canceled orders; crossing magnitudes ranged from 0.011831 to
  12.000184 bps, median 1.529065. These are trigger movements, not forward
  returns or evidence of an edge. Twenty-five other bot orders still have no
  matched HOT_SAMPLE decision record; their reason remains unavailable.
- The public inspector has now shown two real examples with exact quotes:
  the 09:39:27 buy crossed upward by 0.230050 bps and received five partial
  fills totaling $70 before cancellation of the remainder; the 09:52:03 sell
  crossed downward by 1.184709 bps and received four partial fills totaling
  $60 before cancellation of the remainder. These broker outcomes do not
  validate the strategy.

## 10:10 UTC follow-up (28 September)

- The OCaml paper service, Alpaca capture, Hyperliquid capture, one-minute
  multi-timeframe shadow timer and Markov shadow timer were active. The paper
  service had zero systemd restarts; the durable pending-order journal was
  absent. The multi-timeframe output was current through 10:10 UTC. It is a
  read-only candle summary, not a multi-asset trading model.
- The current Alpaca read-only snapshot had complete order and fill pagination
  and an incomplete 4,000-line public journal. The bot had 257 BTC orders and
  422 fills (187 buy, 235 sell). Buy notional was $4,246.982078 and sell
  notional $4,236.121736, a gross cash-flow difference of −$10.860342 before
  any fee reconciliation. No BTC position was open. The account separately
  held 10 protected AAPL shares marked at $3,404.40 with $1,457 unrealized
  gain; those shares are not attributable to this bot. Account equity was
  $101,434.50 and cash $98,030.10, so neither whole-account change can be
  presented as bot P&L. FEE and CFEE returned zero first-page rows; that does
  not establish that every economic execution cost is zero. Bot net P&L stays
  unverified.
- A follow-up snapshot at 10:21:36 UTC had 259 bot orders and 428 fills. Gross
  FILL activity buy qty summed to 0.051141176 BTC and sell qty to 0.051013235
  BTC, a difference of 0.000127941 BTC (0.250172% of buys); the position
  endpoint reported no BTC holding. This is consistent with Alpaca's
  documented tier-one 0.25% taker
  fee being charged in the credited crypto on buys, but no fee activity has
  posted to prove that attribution. Alpaca says crypto fee activities may post
  at end of day, so today's empty `CFEE`/`FEE` result is not a final fee ledger.
  The documented 0.25% fee on sell proceeds would be about $10.68 on the
  observed $4,271.02 sells if all filled IOC orders were tier-one takers; this
  is an estimate only. The −$10.95 fill cash difference therefore cannot be
  called net P&L, and the incomplete coin quantity must be reconciled before
  presenting a closed-trade result.
- The exact-quote audit now matches 232/232 `HOT_SAMPLE` order traces, with
  102 filled and 130 canceled; 25 earlier bot orders still have no such trace.
  Crossing magnitudes ranged from 0.011831 to 12.000184 bps, with a 1.510731
  bps median. This describes the trigger, not a return.
- A new descriptive fill-to-midpoint audit aligned the 389 fills belonging
  to matched hot orders into 174 order-level responses. Median signed response
  relative to fill price was +0.020714 bps at the nominal 1s horizon,
  +0.040841 bps at 5s and +0.136072 bps at 30s; positive-order shares were
  51.15%, 52.30% and 51.15%. But the first quote after each target arrived a
  median 2.600s, 3.028s and 3.015s late, with maxima of 84.964s, 80.964s and
  75.940s. These are not exact horizon markouts, omit activity fees and are
  not an edge or a profitability estimate. The figures are too small and
  delayed to justify a rule change.
- The frozen, read-only Markov shadow had 176 predictions, 175 scored and one
  not yet labeled. Its forward Brier score was 0.250335 versus 0.249947 for
  the frozen constant base-rate baseline; it did not improve that baseline
  on this serially dependent sample. The recorded next-midpoint moves had
  zero instances above the fee-only 50 bps round-trip hurdle. Prediction lead
  time had a 293.526s median and ranged from 3.526s to 299.495s. These labels
  still ignore executable bid/ask and costs; Markov has no order authority.
- Hyperliquid's current UTC-day health scan read 5 sessions, 831,795 BBO
  updates, 86,816 candle updates and 7,282 `allMids` updates across 126
  observed mid names. All 14 selected HIP-3 contracts appeared; there were
  zero locally recorded sequence gaps and corrupt lines, plus one expected
  still-open gzip file. The event-driven candle feed was sparse for
  `xyz:EUR` (152 updates) and `xyz:GBP` (26), so those counts do not establish
  complete one-minute bars or ten FX pairs. The collector remains read-only.
- Local Python research tests pass 24/24; the `e68e341` GitHub Actions run
  passed. The markout implementation preserves nine-digit Alpaca timestamps
  and now exposes quote delay so an observation arriving long after its target
  cannot be mistaken for an exact horizon. These working changes are not yet
  committed.

## Next verified steps

1. Commit/push the nanosecond-safe quote-response audit and this evidence log;
   wait for CI. Keep the public response fields explicitly labeled as delayed,
   fee-excluding diagnostics if they are ever added to the monitor.
2. Reconcile the bot's full BTC inventory and cash flow from its first order,
   Alpaca end-of-day activity pages and any asset-denominated fees; test the
   observed buy-quantity reduction against the fee rows rather than assigning
   it by appearance. Explain AAPL as a separate protected account holding.
   Do not infer P&L from account equity.
3. Measure decision-to-submit time, quote age, spread, partial-fill timing and
   quote delay around each response. Improve the markout only when the capture
   supports the exact sampling window; retain skipped/stale observations.
4. Keep the current Markov and candle policies in read-only shadow. The latest
   Markov sample is slightly worse than its constant baseline. Collect more
   as-received point-in-time labels and evaluate calibration, bid/ask outcomes,
   spread, fee records and missing/stale bars before proposing an alternative.
5. For HIP-3, validate contract metadata, event-driven candle gaps and
   per-symbol quote freshness/spread. Do not present capture volume as
   simultaneous tradability or HFT latency. Replay must be deterministic
   before any testnet execution adapter is considered.
6. Update the monitor only with complete broker-backed rows, explicit
   attribution and the policy/version behind each order. Do not promote a
   candidate or alter order sizing based on these inconclusive results.

Keep the hardcoded paper endpoint, AAPL protection, durable pending journal,
$100 baseline and $500 BTC exposure ceiling. Paper fills do not establish a
profitable live strategy; if evidence stays negative or inconclusive, report
that rather than forcing more trades.

# Pre-trade evidence gate — 27 September 2026

This is an independent paper-trading engineering project. No agent can ensure
that every trade will be good. The current diagnostic cross-spread rule is
**disarmed** (`PAPER_ORDERS=0`); Pattern Forge shapes and energy observations
are read-only. Do not present a green build, a filled paper order or a chart
pattern as evidence of predictive edge.

## What was measured today

The paper broker returned a complete list of the account's orders. Five orders
had this bot's `jsbotbtc` client-ID prefix: three buys (one IOC canceled after
a tiny partial fill) and two filled sells. Summing `filled_qty ×
filled_avg_price` gives **$39.9887759676 bought** and **$39.8978419145 sold**.
The difference is **−$0.0909340531** in gross cash flows *before separately
posted sell fees*. Broker positions then showed **zero BTC** and the pre-existing
**10-share AAPL long**. This is an observed, very small paper sample, not a
backtest or estimate of future performance. Alpaca says crypto fees may be
posted at the end of the day, so the account activity ledger must be reconciled
before reporting a final net P&L. The calculation script is retained outside
the published repository in the task workspace.

A reproducible [quote-quality audit](../research/quote_audit.py) of the signed
07:19 UTC snapshot parsed **685 quote log rows**, but only **421 distinct quote
timestamps**; **264 rows** repeated an earlier market quote. Approximate quote
age at logging had a **21.226989-second median**, **88.452922-second p90** and
**278.630044-second maximum**. The logged spread had a **2.6128-basis-point
median** and **3.7743-basis-point p90**. These figures are computed from one
short session, and repeated log rows are not independent market observations.
Journal timestamps are rounded to whole seconds, which produced a minimum
calculated age of −0.663541 seconds; this is a timestamp-resolution artifact,
not evidence of a quote from the future. This audit reinforces the decision to
leave the diagnostic rule disarmed; it does not measure a profitable edge.

## Inputs and their limits

| Input | Available evidence | Trading limit |
| --- | --- | --- |
| Alpaca crypto quotes / order books | Alpaca documents a streaming feed for trades, quotes, books and bars. The current OCaml service polls a latest-quote REST endpoint every 30 seconds; that interval is an **UNCALIBRATED GUESS**. | A stale quote or different venue must not become an entry price. Scalping requires measured stream latency and fill quality; the present polling loop is unsuitable. |
| Pattern Forge | Its public API supplies validated closed Hyperliquid candles for BTC, ETH and SOL. The monitor derives descriptive 5m, 1h and 1d shapes/indicators from them. | Hyperliquid is not Alpaca's execution venue. Its candle patterns and geometric thresholds are uncalibrated; no order is authorized by them. |
| Alpaca US stocks / ETFs | The Basic market-data plan gives live IEX coverage, not consolidated SIP, and excludes the most recent 15 minutes of historical SIP queries. | Do not treat IEX alone as a full-market execution reference for energy ETFs or AAPL. AAPL is explicitly protected from this bot. |
| Energy Monitor | Public European electricity/gas observations and a candidate EIA WTI/Brent daily historical source. | These have different units, publication times and underlying markets from any Alpaca ETF. No direct tradable mapping or predictive lag has been validated. |
| Alpaca paper | The order API, positions and activities can validate software behavior. Alpaca simulates fills and may randomly partially fill marketable orders. | Paper fills omit several live-market frictions and cannot establish live profitability. |

The Alpaca Market Data documentation lists stocks, crypto, options and news
history, but does not itself establish access to complete company financial
statements. **Inference:** fundamental equity research would need separately
licensed, point-in-time statements/corporate-event data. Crypto has no company
earnings statement analogous to an equity, and energy physical data needs its
own publication-time audit.

## Decision gate before any new paper order

1. **Declare the hypothesis and horizon.** Specify the traded Alpaca symbol,
   the venue of each input, the intended holding period, benchmark and decision
   timestamp. A descriptive candle shape is a feature, not a hypothesis of net
   profit.
2. **Prove point-in-time data.** Retain raw event timestamps, receipt times,
   exchange/source IDs, gaps and revisions. Use only observations that were
   available before the simulated decision. A source outage or stale input
   blocks the order.
3. **Measure costs on the intended order path.** At Alpaca's documented first
   crypto tier, a taker order has a 0.25% fee. A taker buy followed by a taker
   sell therefore faces about **0.50% in quoted fees alone**, before the
   bid-ask spread, slippage and latency. This is a fee-schedule calculation, not
   a measured total cost for this account. Check actual tier and activity
   postings. A strategy must show an out-of-sample net edge after these costs.
4. **Evaluate without selection leakage.** Freeze candidate definitions,
   compare with simple baselines, split data by time, walk forward, count every
   configuration tried, include bad regimes, and report uncertainty and drawdown.
   The published research on backtest overfitting shows why choosing the best
   of many rules on the same history is unreliable.
5. **Forward-test and reconcile.** Run in shadow mode first, then a bounded
   paper test. Reconcile fills, cancellations, fees, holdings, order IDs,
   data-feed failures and restarts. Paper results remain separate from any
   claim about live returns.
6. **Enforce independent risk controls.** Keep the exact paper origin, the
   user's $300-per-bot capital and $2–$30 order guidance, minimum order rules,
   one pending order, daily attempt budget and AAPL protection. A new loss
   limit or signal threshold needs real calibration; it must not be guessed
   silently. A breach or unknown broker state halts execution.

### How much analysis and time?

There is **no source-backed universal number of minutes or candles** an AI
agent should inspect before a trade. The time required is determined by the
declared horizon and measured data/cost uncertainty. For this project:

- **Scalping:** no trades under the present 30-second polling plus 5-minute
  candle context. First capture live quotes/books and trade updates, measure
  latency and spread at the intended venue, and test a cost-aware strategy on
  timestamped events.
- **Day trading:** use closed intraday observations, a point-in-time event and
  cost model, multiple out-of-sample days/regimes, and a live shadow run.
  Calendar duration and sample size must be justified by a precision/power
  calculation on the actual event rate, not declared in advance as proof.
- **Swing trading:** use closed daily bars, multi-regime history, corporate
  actions/fundamentals where relevant, and publication lags for energy data.
  The current Energy Monitor observations have no validated Alpaca mapping.

For an unattended VPS process, direct Alpaca APIs and an OCaml deterministic
risk gate are more appropriate than placing orders through an LLM/MCP session.
The official Alpaca MCP server is useful for interactive account/data
exploration, but it does not replace point-in-time testing, cost accounting or
broker reconciliation. The current direct paper adapter also avoids giving a
remote MCP service broader standing execution authority.

## Primary sources

- [Alpaca paper trading specifications](https://docs.alpaca.markets/us/docs/paper-trading)
- [Alpaca crypto fees](https://docs.alpaca.markets/us/docs/crypto-fees)
- [Alpaca real-time crypto data](https://docs.alpaca.markets/us/docs/real-time-crypto-pricing-data)
- [Alpaca market-data subscriptions](https://docs.alpaca.markets/us/docs/about-market-data-api)
- [Alpaca market-data FAQ on IEX and SIP](https://docs.alpaca.markets/us/docs/market-data-faq)
- [Alpaca historical data](https://docs.alpaca.markets/us/docs/historical-api)
- [Alpaca paper order listing](https://docs.alpaca.markets/us/reference/getallorders-1)
- [Bailey et al., backtest overfitting](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2308659)
- [Pattern Forge reading rules](https://github.com/coder058/pattern-forge/blob/main/docs/reading-rules.md)
- Energy Monitor's local EIA source audit (`docs/eia-crude-benchmark-audit-2026-09-26.md` in that separate project) remains unpublished here; its availability and point-in-time suitability still need verification.

The immediate honest risk: the observed paper rule lost money in a tiny sample
before all fees were reconciled, and its data path is unsuitable for scalping.
Reactivating it now could produce more losing paper trades and would say little
about live execution.

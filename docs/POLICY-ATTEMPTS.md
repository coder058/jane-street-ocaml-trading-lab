# Paper policy and candidate log

This file records each tested rule before any paper order authority changes.
Historical BTC/USD bars retrieved on 27 September 2026 can contain revisions.
July–September was examined before this log and is not an untouched holdout.
Paper execution is simulated and cannot demonstrate live profitability.

## `quote_cross_30s_v1` — deployed paper baseline

- **Authority:** OCaml paper orders only, subject to the hardcoded Alpaca paper
  endpoint, AAPL exclusion, pending-order reconciliation, $100 target buy and
  $500 BTC exposure ceiling.
- **Inputs:** as-received Alpaca US BTC/USD quotes. A buy requires current bid
  above the preceding sampled ask while flat; a sell requires current ask
  below the preceding sampled bid while holding bot BTC.
- **Evidence through 27 September 2026, 20:00 UTC:** 72 bot orders and 92 bot
  fills in the latest complete signed snapshot at 19:53. The 18:54 flat
  checkpoint had −$1.44205878047 in cumulative filled cash difference, with
  an unexplained BTC quantity difference consistent with a 0.25% buy-side
  fee haircut. `CFEE`/`FEE` activity rows were not yet posted. The rule has
  no measured after-cost edge. Trigger quote crossings of the traced WebSocket
  orders had median 2.35120 basis points, which is not forward return.
- **Decision:** keep only as bounded paper data collection; do not represent
  it as a profitable strategy or extend authority to live trading.

## `markov-candle-fee-screen-v1` — rejected for order authority

- **Declared features:** Pattern Forge candle shapes, close direction and
  Murphy-style EMA trend from adjacent, closed Alpaca US BTC/USD 5Min bars.
- **Training:** 52,070 next-adjacent-bar labels with both bar starts before
  1 July 2026. This cutoff excludes the boundary label into July. The model
  has 73 observed states.
- **Optimistic screen:** require the state's *training mean* next-close
  midpoint return to exceed 50 basis points, the [published first-tier Alpaca
  taker fee](https://docs.alpaca.markets/us/docs/crypto-fees) for a buy and
  a sell combined. This ignores spread, latency,
  slippage, bar revisions and any uncertainty penalty; it is not a backtest
  of executable orders.
- **Result:** one state passed: `falling|up|Doji,Shooting-star shape,Bullish
  engulfing`, mean +54.185149693050974 basis points from only **9** training
  labels. It occurred **zero** times in the already-inspected July–September
  interval. No independent after-cost evaluation exists. An up probability
  above one half would not, by itself, pass the fee hurdle.
- **Decision:** no paper orders and no $50/$500 probability sizing from this
  screen. The frozen state-frequency model runs in read-only forward shadow
  mode solely to collect point-in-time evidence.

## Forward shadow evaluation protocol

- Record the model hash, state, probability, bar close, snapshot retrieval
  time, actual observation time and seconds remaining to the next close.
- Record the next adjacent close only on a later retrieval; reject duplicate
  predictions, duplicate labels, non-adjacent bars and labels observed before
  the outcome's close.
- Score direction against the frozen pre-July base rate. Keep lead times and
  outcomes visible; short-lead and near-full-horizon predictions are not
  comparable. Midpoint moves cannot establish executable after-cost return.
- Require a new chronological sample with as-of bid/ask execution and fee
  reconciliation before reconsidering order authority. No sample count or
  statistical threshold has yet been calibrated for promotion.

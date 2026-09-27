# Jane Street OCaml Trading Lab

An auditable live market monitor and **Alpaca paper-only** execution experiment,
written in OCaml. This is an independent portfolio project, not affiliated with
Jane Street or Alpaca. It does not claim a profitable strategy.

**Live read-only monitor:** [jane-street-paper-monitor.vercel.app](https://jane-street-paper-monitor.vercel.app/)

The Dublin VPS runs an OCaml paper order service and an Alpaca US market-data
collector. It signs a sanitized broker and journal
snapshot for Vercel; no Alpaca secret is sent to the website. The dashboard
shows actual paper orders, the pre-existing AAPL position, feed health, and
Pattern Forge closed-candle context. The paper account's equity includes AAPL
and is **not** a performance result for this bot.

## Current behavior

- The Dublin collector archives Alpaca US BTC/USD WebSocket quotes, trades,
  order books, closed-minute bars and later bar revisions with receipt times.
  It sends quotes and bars to OCaml over a local Unix socket. Session IDs and
  a per-consumer sequence expose reconnects and lost datagrams.
- The OCaml service is running in `PAPER_ORDER` mode with `PAPER_ORDERS=1` on
  Dublin as of 27 September 2026. It receives each quote and evaluates the
  cross-spread rule against a reference quote sampled at the earlier REST
  service's 30-second cadence. It records each sample and starts a separate
  worker for broker I/O on candidates so the feed
  receiver can continue. A deliberately simple, **uncalibrated** cross-spread
  price-move rule submits IOC limits only to the Alpaca **paper** origin.
- OCaml describes Alpaca closed-minute bars with selected Pattern Forge style
  EMA, RSI, MACD, Bollinger and candle-shape rules. A separate five-minute
  Alpaca historical snapshot supplies a more continuous, retrieval-timestamped
  context. Missing intervals reset indicators. These readings have no order
  authority and no calibrated probability; full cross-language parity with
  Pattern Forge remains unverified.
- Before every submission it checks paper account status and buying power,
  all open orders, the BTC position, and the BTC asset's price increment.
- An order journal is written before the API call. An ambiguous response
  blocks the next order until the previous client order ID is reconciled.
- A persistent ownership marker prevents the bot from selling a BTC position
  that predates its own buy. The BTC position and each order remain under the
  user's $30 cap. Repeated completed round trips have no daily turnover cap;
  the $300 per-bot capital guidance is not treated as a daily spend limit.
- Credentials are sent to `curl` through standard input rather than argv;
  credential variables are stripped from the child process environment.
- An append-only local journal records quotes, decisions and broker responses.
- `--research-once` reads closed BTC, ETH and SOL candles from Pattern Forge
  for descriptive 5m, 1h and 1d context. This path cannot authorize orders.
- Raw captures stay on Dublin; the public monitor receives signed summaries,
  broker orders, fill activities and selected journal events.
- `web/` contains the Vercel paper monitor. Dublin exports broker snapshots
  and the journal with Ed25519 signatures; Vercel never receives Alpaca keys.

The strategy rule and $20 diagnostic size are **uncalibrated guesses**. They
exercise an order lifecycle and do not imply an edge. Between 08:36 and 10:26
UTC on 27 September, the earlier 30-second REST version sent 20 paper orders,
received 20 broker acknowledgements and reconciled all 20. It used
$299.999246395 of a then-active $300 daily buy-attempt budget; the broker later showed
zero BTC, no open order and the pre-existing 10 AAPL shares. The WebSocket
order path started at 13:00 UTC. An audit of 1,349 captured quotes from
13:16:05–13:38:43 UTC found zero crosses among adjacent quotes and six crosses
among 34 non-overlapping 30-second samples. This motivated restoring the
earlier diagnostic cadence on the WebSocket at 13:40 UTC; it is not an edge
estimate. Pattern Forge and Energy Monitor remain descriptive context in
their own domains. See [the live-paper runbook](docs/LIVE-PAPER.md) and
[the evidence and strategy limits](docs/pretrade-evidence.md).

## Build and test

```sh
opam install . --deps-only
opam exec -- dune build @all
opam exec -- dune runtest --force
opam exec -- dune exec bin/paper_crypto_main.exe -- --once
```

The `--once` mode reads one public quote and never places an order. On 27
September 2026, Alpaca accepted a BTC/USD IOC buy that was canceled after a
partial fill of 0.000000020 BTC; the net position was 0.000000019 BTC. Later
paper buys and sells were filled and reconciled. These are execution plumbing
checks, not performance results. The bot handles sub-$10 dust. The account's
existing 10-share AAPL position is outside its BTC/USD order path. The service
continues under the paper-only and per-position controls.

Paper fills are simulated and can differ from live execution. Even a working
paper order loop may lose money live after fees, spread, slippage, and adverse
selection.

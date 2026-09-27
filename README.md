# Jane Street OCaml Trading Lab

An auditable live market monitor and **Alpaca paper-only** execution experiment,
written in OCaml. This is an independent portfolio project, not affiliated with
Jane Street or Alpaca. It does not claim a profitable strategy.

## Current behavior

- Polls Alpaca's public BTC/USD quote endpoint and logs timestamp, bid, ask,
  and spread. A service on the author's Dublin VPS runs this monitor now.
- A deliberately simple cross-spread price-move rule can submit small IOC
  limit orders to the exact Alpaca **paper** origin after explicit arming.
- Before every submission it checks paper account status and buying power,
  all open orders, the BTC position, and the BTC asset's price increment.
- An order journal is written before the API call. An ambiguous response
  blocks the next order until the previous client order ID is reconciled.
- A persistent ownership marker prevents the bot from selling a BTC position
  that predates its own buy. The user-stated $300 per-bot capital bounds daily
  buy attempts; sell orders can still reduce exposure.
- Credentials are sent to `curl` through standard input rather than argv;
  credential variables are stripped from the child process environment.

The strategy rule and $20 diagnostic size are **uncalibrated guesses**. They
exist to exercise a safe order lifecycle, not to imply an edge. Pattern Forge
and Energy Monitor provide useful descriptive data in their own domains, but
their outputs do not authorize BTC trades here. See [the live-paper runbook](docs/LIVE-PAPER.md).

## Build and test

```sh
opam install . --deps-only
opam exec -- dune build @all
opam exec -- dune runtest --force
opam exec -- dune exec bin/paper_crypto_main.exe -- --once
```

The `--once` mode reads one public quote and never places an order. The
continuous Dublin service runs `--paper` with valid **paper** keys and
`PAPER_ORDERS=1`. On 27 September 2026, Alpaca accepted one BTC/USD IOC buy
attempt. It was canceled after a partial fill of 0.000000020 BTC; the net
position reported separately was 0.000000019 BTC. This is a paper execution
plumbing check, not a meaningful performance result. The bot now treats such
sub-$10 holdings as dust and will not submit an invalid sell. The account's
existing 10-share AAPL position is outside the bot's BTC/USD order path.

Paper fills are simulated and can differ from live execution. Even a working
paper order loop may lose money live after fees, spread, slippage, and adverse
selection.

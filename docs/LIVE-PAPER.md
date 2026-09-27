# Live paper engineering run

`paper_crypto_main` is an OCaml diagnostic trading loop for **Alpaca paper**.
The public BTC/USD quote endpoint runs without credentials. Trading is disabled
unless both `--paper` and `PAPER_ORDERS=1` are set and paper credentials work.
The only trading origin is `https://paper-api.alpaca.markets`.

The decision is deliberately simple: buy after a live bid rises above the
previous live ask; sell the bot-owned position after a live ask falls below the
previous bid. This cross-spread rule has **not** been calibrated or shown to
have an edge. The $20 diagnostic order is a guess within the user's $2–$30
range and above Alpaca's documented $10 crypto minimum. The bot uses IOC limit
orders, one pending order at a time, a durable pre-submission journal, open
order/account/position checks, a paper-only host, and an ownership marker. It
refuses an existing BTC position it cannot attribute to itself. It does not
place live orders.

Alpaca may partially fill an IOC order and cancel its remainder. The first
observed order on 27 September 2026 filled 0.000000020 BTC, leaving a net
0.000000019 BTC position. The bot keeps ownership of that residual, suppresses
sub-$10 sells, and permits a later buy only when the total BTC position would
remain within the user's $30 position cap. Such a tiny fill is not evidence of
strategy quality.

Pattern Forge reads Hyperliquid candles and Energy Monitor reads public
electricity/gas feeds. Neither provides a calibrated signal for Alpaca BTC
execution. Their current OCaml probes are not part of this order path. A later
research run can compare Pattern Forge's closed BTC candles with Alpaca fills,
and Energy Monitor can be evaluated against an energy-linked asset if that
market and aligned timestamps become available. Connecting either to order
authorization now would invent a trading relationship.

## Checks on Dublin

```sh
cd /home/ubuntu/ocaml-paper-market-lab
opam exec -- dune runtest --force
opam exec -- dune exec bin/paper_crypto_main.exe -- --once
sudo bash -c 'set -a; . /etc/jsbot-paper.env; set +a; /home/ubuntu/ocaml-paper-market-lab/_build/default/bin/paper_crypto_main.exe --check-positions'
sudo systemctl status jsbot-paper --no-pager
sudo journalctl -u jsbot-paper -n 30 --no-pager
```

The service starts in MONITOR mode until `/etc/jsbot-paper.env` contains:

```text
APCA_API_KEY_ID=<paper key id>
APCA_API_SECRET_KEY=<paper secret>
PAPER_ORDERS=1
```

The file must be owned by root with mode 0600. Do not paste secrets into a
shell command, terminal history, issue, log or chat. Install them with a local
interactive editor on the VPS, then restart the service. `journalctl` should
show `PAPER_ORDER`, quote observations, decision holds, any `SEND`, broker
`ACK`, and later `reconcile`. Verify orders and positions against the Alpaca
paper dashboard. A `pending` journal that cannot be reconciled stops further
submissions and needs operator review.

Paper fills are simulated from quotes. They do not establish live fill quality
or profitability. The cross-spread rule may lose money after spread, fees,
slippage, and adverse selection.

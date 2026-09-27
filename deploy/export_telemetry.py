"""Publish a signed, read-only paper snapshot from Dublin to Vercel.

Runs on the VPS as root. It never sends Alpaca credentials to Vercel and has no
order submission method. The destination accepts only Ed25519-signed snapshots.
"""

from __future__ import annotations

import base64
import argparse
import hashlib
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives import serialization

PAPER_ORIGIN = "https://paper-api.alpaca.markets"  # SOURCE: Alpaca paper API origin.
ENV_PATH = Path("/etc/jsbot-paper.env")
KEY_PATH = Path("/etc/jane-telemetry-ed25519.pem")
STATE_DIR = Path("/home/ubuntu/jsbot-paper-state")
SYNC_PATH = STATE_DIR / "telemetry-sync.json"
EVENTS_PATH = STATE_DIR / "events.jsonl"
BACKFILL_PATH = STATE_DIR / "events-bootstrap.jsonl"
CAPTURE_DIR = STATE_DIR / "market-capture" / "us"

# SOURCE: Alpaca documents at most 500 results per Get All Orders request.
ORDER_PAGE_SIZE = 500
# GUESS: # UNCALIBRATED GUESS — stop after 20 pages to bound API work; the
# completeness field makes a truncated account history visible to viewers.
MAX_ORDER_PAGES = 20
# SOURCE: Alpaca Account Activities documents 100 results per page without date.
FILL_PAGE_SIZE = 100
# GUESS: # UNCALIBRATED GUESS — stop after 20 activity pages and disclose if
# incomplete; inspect account size before choosing a long-term archive policy.
MAX_FILL_PAGES = 20
# GUESS: # UNCALIBRATED GUESS — retain 4,000 recent journal lines in each
# snapshot; older lines remain on the VPS and must be archived separately.
MAX_JOURNAL_LINES = 4_000
# GUESS: # UNCALIBRATED GUESS — a five-minute idle heartbeat makes the
# read-only dashboard visibly current while limiting Blob writes. Measure
# actual storage and transfer usage before tightening it further.
HEARTBEAT_SECONDS = 5 * 60


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        values[name] = value
    return values


def paper_get(path: str, credentials: dict[str, str]) -> object:
    request = urllib.request.Request(PAPER_ORIGIN + path, headers={
        "APCA-API-KEY-ID": credentials["APCA_API_KEY_ID"],
        "APCA-API-SECRET-KEY": credentials["APCA_API_SECRET_KEY"],
        "Accept": "application/json",
    })
    # GUESS: # UNCALIBRATED GUESS — fifteen-second network timeout; measure
    # observed Alpaca response times before adjusting the timer.
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)


def broker_orders(credentials: dict[str, str]) -> tuple[list[dict[str, object]], bool]:
    orders: list[dict[str, object]] = []
    before: str | None = None
    complete = False
    for _ in range(MAX_ORDER_PAGES):
        query = {"status": "all", "limit": str(ORDER_PAGE_SIZE), "direction": "desc"}
        if before:
            query["before_order_id"] = before
        page = paper_get("/v2/orders?" + urllib.parse.urlencode(query), credentials)
        if not isinstance(page, list):
            raise ValueError("Alpaca order response was not an array")
        orders.extend(page)
        if len(page) < ORDER_PAGE_SIZE:
            complete = True
            break
        last = page[-1]
        if not isinstance(last, dict) or not isinstance(last.get("id"), str):
            raise ValueError("Alpaca order pagination has no last ID")
        before = last["id"]
    projected = []
    for order in orders:
        projected.append({
            "id": order.get("id", ""),
            "clientOrderId": order.get("client_order_id", ""),
            "symbol": order.get("symbol", ""),
            "side": order.get("side", ""),
            "type": order.get("type", ""),
            "status": order.get("status", ""),
            "qty": order.get("qty"),
            "filledQty": order.get("filled_qty", "0"),
            "filledAvgPrice": order.get("filled_avg_price"),
            "submittedAt": order.get("submitted_at"),
            "filledAt": order.get("filled_at"),
        })
    return projected, complete


def broker_fills(credentials: dict[str, str], orders: list[dict[str, object]]) -> tuple[list[dict[str, object]], bool]:
    by_order_id = {order["id"]: order["clientOrderId"] for order in orders}
    fills: list[dict[str, object]] = []
    token: str | None = None
    complete = False
    for _ in range(MAX_FILL_PAGES):
        query = {"direction": "desc", "page_size": str(FILL_PAGE_SIZE)}
        if token:
            query["page_token"] = token
        page = paper_get("/v2/account/activities/FILL?" + urllib.parse.urlencode(query), credentials)
        if not isinstance(page, list):
            raise ValueError("Alpaca FILL activities response was not an array")
        fills.extend(page)
        if len(page) < FILL_PAGE_SIZE:
            complete = True
            break
        last = page[-1]
        if not isinstance(last, dict) or not isinstance(last.get("id"), str):
            raise ValueError("Alpaca FILL pagination has no last ID")
        if token == last["id"]:
            raise ValueError("Alpaca FILL pagination did not advance")
        token = last["id"]
    projected = [{
        "id": fill.get("id", ""),
        "orderId": fill.get("order_id", ""),
        "clientOrderId": by_order_id.get(fill.get("order_id"), ""),
        "symbol": fill.get("symbol", ""),
        "side": fill.get("side", ""),
        "type": fill.get("type", ""),
        "qty": fill.get("qty", "0"),
        "price": fill.get("price", "0"),
        "transactionTime": fill.get("transaction_time"),
    } for fill in fills]
    return projected, complete


def journal() -> tuple[list[dict[str, str]], bool, list[dict[str, str]]]:
    rows: list[dict[str, str]] = []
    for path in (BACKFILL_PATH, EVENTS_PATH):
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                item = json.loads(line)
                if isinstance(item.get("at"), str) and isinstance(item.get("message"), str):
                    rows.append({"at": item["at"], "message": item["message"]})
            except (json.JSONDecodeError, AttributeError):
                continue
    rows.sort(key=lambda item: item["at"])
    complete = len(rows) <= MAX_JOURNAL_LINES
    # SOURCE: the complete local journal is needed to preserve the decision
    # trace for older broker orders after the public journal window rolls on.
    decision_rows = [row for row in rows if row["message"].startswith(
        ("HOT_DECISION ", "HOT_SAMPLE "))]
    return rows[-MAX_JOURNAL_LINES:], complete, decision_rows


def decision_history(events: list[dict[str, str]],
                     orders: list[dict[str, object]]) -> dict[str, dict[str, str]]:
    """Join logged quote decisions to broker order IDs without guessing proximity."""
    decisions: dict[str, dict[str, str]] = {}
    samples: dict[str, dict[str, str]] = {}
    for row in events:
        message = row["message"]
        if not message.startswith(("HOT_DECISION ", "HOT_SAMPLE ")):
            continue
        fields = dict(token.split("=", 1) for token in message.split()[1:]
                      if "=" in token)
        quote_time = fields.get("quote_time", "")
        if not quote_time:
            continue
        suffix = "".join(character for character in quote_time if character.isalnum())
        if message.startswith("HOT_DECISION "):
            decisions[suffix] = {key: fields[key] for key in (
                "quote_time", "policy", "receive_to_decision_ms", "trend",
                "context_frame", "context_bar", "probability") if key in fields}
        else:
            samples[suffix] = {key: fields[key] for key in (
                "reference_quote_time", "window_ms", "candidate") if key in fields}
    result: dict[str, dict[str, str]] = {}
    for order in orders:
        client_id = order.get("clientOrderId")
        order_id = order.get("id")
        side = order.get("side")
        if not isinstance(client_id, str) or not isinstance(order_id, str) or \
                side not in ("buy", "sell"):
            continue
        prefix = f"jsbotbtc{side}"
        if not client_id.startswith(prefix):
            continue
        suffix = client_id[len(prefix):]
        if suffix in decisions:
            result[order_id] = {**decisions[suffix], **samples.get(suffix, {})}
    return result


def service_state(credentials: dict[str, str]) -> dict[str, object]:
    active = subprocess.run(
        ["systemctl", "is-active", "--quiet", "jsbot-paper.service"], check=False,
    ).returncode == 0
    mode = "PAPER_ORDER" if active and credentials.get("PAPER_ORDERS") == "1" else (
        "MONITOR" if active else "STOPPED"
    )
    capture_active = subprocess.run(
        ["systemctl", "is-active", "--quiet", "jane-market-capture.service"],
        check=False,
    ).returncode == 0
    return {"active": active, "mode": mode, "captureActive": capture_active}


def capture_state(service: dict[str, object]) -> dict[str, object]:
    today = datetime.now(timezone.utc).date().isoformat()
    path = CAPTURE_DIR / f"{today}.jsonl"
    if not path.exists():
        return {"active": service["captureActive"], "lastEventAt": None, "bytesToday": 0}
    stat = path.stat()
    return {
        "active": service["captureActive"],
        "lastEventAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat().replace("+00:00", "Z"),
        "bytesToday": stat.st_size,
    }


def latest_fields(events: list[dict[str, str]], prefix: str) -> dict[str, str] | None:
    for row in reversed(events):
        message = row["message"]
        if message.startswith(prefix):
            result = {"observedAt": row["at"]}
            for token in message.split()[1:]:
                if "=" in token:
                    key, value = token.split("=", 1)
                    result[key] = value
            return result
    return None


def analysis_state(events: list[dict[str, str]]) -> dict[str, object]:
    latest_five_event = next((row for row in reversed(events) if row["message"].startswith(
        ("TECHNICAL_5M ", "TECHNICAL_5M_UNAVAILABLE "))), None)
    five = (latest_fields([latest_five_event], "TECHNICAL_5M ")
            if latest_five_event is not None else None)
    decision = latest_fields(events, "HOT_DECISION ")
    return {
        "fiveMinute": None if five is None else {
            "observedAt": five.get("observedAt"),
            "retrievedAt": five.get("retrieved_at"),
            "lastBarAt": five.get("last_bar"),
            "contiguousBars": int(five.get("contiguous_bars", "0")),
            "trend": five.get("trend", "warming"),
            "probability": None,
            "orderAuthority": False,
        },
        "lastDecision": None if decision is None else {
            "observedAt": decision.get("observedAt"),
            "quoteTime": decision.get("quote_time"),
            "policy": decision.get("policy"),
            "receiveToDecisionMs": decision.get("receive_to_decision_ms"),
            "contextFrame": decision.get("context_frame"),
            "contextBar": decision.get("context_bar"),
            "trend": decision.get("trend"),
        },
    }


def significant_digest(events: list[dict[str, str]], service: dict[str, object],
                       document: dict[str, object]) -> str:
    meaningful = [event for event in events if event["message"].startswith((
        "SEND ", "ACK ", "reconcile ", "HALT ", "DATA_ERROR ",
        "REJECTED ", "UNCERTAIN ", "start ", "TECHNICAL_5M ",
        "HOT_DECISION ",
    ))]
    orders = [{key: order.get(key) for key in ("id", "status", "filledQty")}
              for order in document["orders"]]
    fills = [fill["id"] for fill in document["fills"]]
    # SOURCE: a changed public position projection needs one immediate signed upload.
    payload = json.dumps({"projection": "position_pnl_v1", "service": service, "events": meaningful,
                          "orders": orders, "fills": fills}, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def snapshot(credentials: dict[str, str], service: dict[str, object],
             events: list[dict[str, str]], journal_complete: bool,
             decision_events: list[dict[str, str]]) -> dict[str, object]:
    account = paper_get("/v2/account", credentials)
    positions = paper_get("/v2/positions", credentials)
    orders, orders_complete = broker_orders(credentials)
    fills, fills_complete = broker_fills(credentials, orders)
    if not isinstance(account, dict) or not isinstance(positions, list):
        raise ValueError("Alpaca account or positions response has an unexpected shape")
    return {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "Dublin OCaml paper service",
        "service": service,
        "capture": capture_state(service),
        "analysis": analysis_state(events),
        "account": {
            "equity": str(account.get("equity", "")),
            "cash": str(account.get("cash", "")),
            "buyingPower": str(account.get("buying_power", "")),
        },
        "positions": [{
            "symbol": str(position.get("symbol", "")),
            "qty": str(position.get("qty", "")),
            "side": str(position.get("side", "")),
            "avgEntryPrice": str(position.get("avg_entry_price", "")),
            "marketValue": position.get("market_value"),
            "costBasis": position.get("cost_basis"),
            "currentPrice": position.get("current_price"),
            "unrealizedPl": position.get("unrealized_pl"),
            "unrealizedPlpc": position.get("unrealized_plpc"),
            "protected": position.get("symbol") not in ("BTCUSD", "BTC/USD"),
        } for position in positions],
        "orders": orders,
        "ordersComplete": orders_complete,
        "fills": fills,
        "fillsComplete": fills_complete,
        "decisionHistory": decision_history(decision_events, orders),
        "journal": events,
        "journalComplete": journal_complete,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Check read-only broker snapshot without uploading")
    args = parser.parse_args()
    credentials = read_env(ENV_PATH)
    endpoint = os.environ.get("JANE_MONITOR_INGEST_URL", "")
    if not args.dry_run and not endpoint.startswith("https://"):
        print("telemetry: JANE_MONITOR_INGEST_URL must be HTTPS", file=sys.stderr)
        return 1
    events, journal_complete, decision_events = journal()
    service = service_state(credentials)
    document = snapshot(credentials, service, events, journal_complete,
                        decision_events)
    digest = significant_digest(events, service, document)
    previous = {}
    if SYNC_PATH.exists():
        try:
            previous = json.loads(SYNC_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    now = datetime.now(timezone.utc).timestamp()
    if not args.dry_run and digest == previous.get("digest") and now - float(previous.get("sentAt", 0)) < HEARTBEAT_SECONDS:
        print("telemetry: unchanged, heartbeat not due")
        return 0
    body = json.dumps(document, separators=(",", ":"), sort_keys=True).encode()
    # GUESS: # UNCALIBRATED GUESS — match the 1 MiB ingestion limit on Vercel;
    # archive/paginate history when this becomes insufficient.
    if len(body) > 1_048_576:
        raise ValueError("telemetry exceeds the signed endpoint limit")
    if args.dry_run:
        five = document["analysis"]["fiveMinute"]
        print(f"telemetry: dry run, mode={service['mode']}, {len(document['positions'])} positions, {len(document['orders'])} orders, {len(document['fills'])} fills, {len(events)} events, {len(document['decisionHistory'])} order decisions, complete_orders={document['ordersComplete']}, complete_fills={document['fillsComplete']}, complete_journal={journal_complete}, five_minute_trend={five['trend'] if five else 'unavailable'}, five_minute_last_bar={five['lastBarAt'] if five else 'unavailable'}, {len(body)} bytes")
        return 0
    private_key = serialization.load_pem_private_key(KEY_PATH.read_bytes(), password=None)
    signature = base64.b64encode(private_key.sign(body)).decode("ascii")
    request = urllib.request.Request(endpoint, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "X-Jane-Signature": signature,
    })
    with urllib.request.urlopen(request, timeout=15) as response:
        acknowledgement = json.load(response)
    if acknowledgement.get("accepted") is not True:
        raise ValueError("monitor endpoint did not acknowledge the signed snapshot")
    temporary = SYNC_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps({"digest": digest, "sentAt": now}), encoding="utf-8")
    os.chmod(temporary, 0o600)  # SOURCE: owner-only local synchronization state.
    os.replace(temporary, SYNC_PATH)
    print(f"telemetry: uploaded signed paper snapshot, {len(document['orders'])} broker orders, {len(document['fills'])} fills, {len(events)} journal events")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

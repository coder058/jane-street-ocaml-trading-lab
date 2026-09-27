"""Archive raw Alpaca US crypto market events for later point-in-time research.

This process cannot submit orders. It sends credentials only to Alpaca's TLS
market-data WebSocket, never writes them to a capture or log, and records both
exchange and local receipt timestamps. Captured data stays private on Dublin.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from websockets.asyncio.client import connect

# SOURCE: https://docs.alpaca.markets/us/docs/real-time-crypto-pricing-data
STREAM_URL = "wss://stream.data.alpaca.markets/v1beta3/crypto/us"
ENV_PATH = Path("/etc/jsbot-paper.env")
CAPTURE_DIR = Path("/home/ubuntu/jsbot-paper-state/market-capture/us")
SYMBOL = "BTC/USD"  # SOURCE: the OCaml paper bot's only traded symbol.
# GUESS: # UNCALIBRATED GUESS — stop collecting before the 49 GB free disk
# observed on Dublin is nearly exhausted. Replace with measured capacity alert.
MIN_FREE_BYTES = 5 * 1024 * 1024 * 1024
# GUESS: # UNCALIBRATED GUESS — check capacity every 1,000 received events.
DISK_CHECK_EVENTS = 1_000
# GUESS: # UNCALIBRATED GUESS — bound a full book frame at 4 MiB; observe real
# reset sizes and reconnect behavior before revising.
MAX_MESSAGE_BYTES = 4 * 1024 * 1024
# GUESS: # UNCALIBRATED GUESS — reconnect after a transport failure in 5 seconds.
RECONNECT_SECONDS = 5


class CaptureGuardError(Exception):
    """A storage or feed-integrity condition requiring operator review."""


def credentials() -> tuple[str, str]:
    values = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.startswith("#"):
            key, value = line.split("=", 1)
            values[key] = value
    return values["APCA_API_KEY_ID"], values["APCA_API_SECRET_KEY"]


class Archive:
    def __init__(self) -> None:
        CAPTURE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.day = ""
        self.handle: int | None = None
        self.events = 0

    def close(self) -> None:
        if self.handle is not None:
            os.fsync(self.handle)
            os.close(self.handle)
            self.handle = None

    def write(self, event: dict) -> None:
        received_ns = time.time_ns()
        day = datetime.fromtimestamp(received_ns / 1_000_000_000, timezone.utc).date().isoformat()
        if day != self.day:
            self.close()
            path = CAPTURE_DIR / f"{day}.jsonl"
            self.handle = os.open(path, os.O_CREAT | os.O_APPEND | os.O_WRONLY, 0o600)
            self.day = day
        self.events += 1
        if self.events % DISK_CHECK_EVENTS == 0:
            stats = os.statvfs(CAPTURE_DIR)
            if stats.f_bavail * stats.f_frsize < MIN_FREE_BYTES:
                raise CaptureGuardError("market capture stopped: free disk below safety reserve")
        record = {"receivedAtNs": received_ns, "feed": "alpaca-us", "event": event}
        assert self.handle is not None
        os.write(self.handle, (json.dumps(record, separators=(",", ":")) + "\n").encode())


async def session(archive: Archive) -> None:
    key, secret = credentials()
    async with connect(STREAM_URL, max_size=MAX_MESSAGE_BYTES) as socket:
        await socket.send(json.dumps({"action": "auth", "key": key, "secret": secret}))
        authenticated = False
        subscribed = False
        async for message in socket:
            items = json.loads(message)
            if not isinstance(items, list):
                raise ValueError("stream frame was not an array")
            for item in items:
                if not isinstance(item, dict):
                    raise ValueError("stream event was not an object")
                kind = item.get("T")
                if kind == "error":
                    # SOURCE: Alpaca stream error codes; never log auth payload.
                    raise RuntimeError(f"Alpaca stream error code={item.get('code')}")
                if kind == "success" and item.get("msg") == "authenticated":
                    authenticated = True
                    await socket.send(json.dumps({"action": "subscribe", "quotes": [SYMBOL],
                                                  "trades": [SYMBOL], "orderbooks": [SYMBOL]}))
                elif kind == "subscription":
                    expected = all(SYMBOL in item.get(channel, []) for channel in
                                   ("quotes", "trades", "orderbooks"))
                    if not authenticated or not expected:
                        raise CaptureGuardError("Alpaca stream subscription was incomplete")
                    subscribed = True
                    print("market capture: authenticated; BTC/USD quotes, trades and orderbooks", flush=True)
                elif kind in ("q", "t", "o"):
                    if not subscribed or item.get("S") != SYMBOL or not isinstance(item.get("t"), str):
                        raise CaptureGuardError("unexpected stream market event")
                    archive.write(item)


async def main() -> None:
    archive = Archive()
    try:
        while True:
            try:
                await session(archive)
                raise ConnectionError("market stream closed")
            except (ConnectionError, OSError, TimeoutError) as error:
                print(f"market capture: {type(error).__name__}: {error}", file=sys.stderr, flush=True)
                archive.close()
                await asyncio.sleep(RECONNECT_SECONDS)
    finally:
        archive.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (CaptureGuardError, RuntimeError, ValueError) as error:
        print(f"market capture halted for review: {error}", file=sys.stderr, flush=True)
        # SOURCE: sysexits.h EX_CONFIG=78; systemd does not restart this exit.
        raise SystemExit(78) from error

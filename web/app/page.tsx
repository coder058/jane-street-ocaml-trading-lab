"use client";

import { useEffect, useMemo, useState } from "react";
import type { PaperFill, PaperOrder, PaperPosition, PaperTelemetry } from "@/lib/telemetry";

type Live = { generatedAt: string; telemetry: PaperTelemetry | null };
const usd = (value: string | number | null | undefined) => {
  const n = Number(value);
  return value == null || !Number.isFinite(n) ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
};
const qty = (value: string | number | null | undefined) => {
  const n = Number(value);
  return value == null || !Number.isFinite(n) ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 9 }).format(n);
};
const at = (value: string | null | undefined) => value && !Number.isNaN(Date.parse(value)) ?
  new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "medium", timeZone: "UTC" }).format(new Date(value)) + " UTC" : "—";
const signed = (value: string | number | null | undefined) => {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  // SOURCE: show the broker's decimal precision so a sub-cent paper P&L is not rounded to zero.
  const raw = String(value);
  return Number(value) < 0 ? `-$${raw.replace("-", "")}` : `${Number(value) > 0 ? "+" : ""}$${raw}`;
};
const tone = (value: string | number | null | undefined) => value == null ? "" : Number(value) > 0 ? "gain" : Number(value) < 0 ? "loss" : "";

function Positions({ rows }: { rows: PaperPosition[] }) {
  if (!rows.length) return <p className="empty">No bot BTC position is open at this broker snapshot.</p>;
  return <div className="position-grid">{rows.map((p) => <div className="position-card" key={p.symbol}>
    <div className="position-title"><strong>{p.symbol}</strong><span className={tone(p.unrealizedPl)}>{signed(p.unrealizedPl)} <small>open P&amp;L</small></span></div>
    <dl><div><dt>Quantity</dt><dd>{qty(p.qty)} BTC</dd></div><div><dt>Average entry</dt><dd>{usd(p.avgEntryPrice)}</dd></div><div><dt>Broker mark</dt><dd>{usd(p.currentPrice)}</dd></div><div><dt>Market value</dt><dd>{usd(p.marketValue)}</dd></div></dl>
  </div>)}</div>;
}

function Fills({ rows, exits }: { rows: PaperFill[]; exits: boolean }) {
  if (!rows.length) return <p className="empty">No {exits ? "sell fills" : "bot fills"} in the broker snapshot.</p>;
  return <div className="table-scroll"><table><thead><tr><th>EXECUTED AT</th><th>SIDE</th><th>BTC</th><th>PRICE</th><th>{exits ? "GROSS PROCEEDS" : "GROSS NOTIONAL"}</th><th>ORDER ID</th></tr></thead><tbody>
    {rows.map((f) => <tr key={f.id}><td data-label="Executed">{at(f.transactionTime)}</td><td data-label="Side"><span className={`side ${f.side}`}>{f.side.toUpperCase()}</span></td><td data-label="BTC">{qty(f.qty)}</td><td data-label="Price">{usd(f.price)}</td><td data-label={exits ? "Gross proceeds" : "Gross notional"}>{usd(Number(f.qty) * Number(f.price))}</td><td data-label="Order ID" className="order-id" title={f.clientOrderId}>{f.clientOrderId.slice(-16)}</td></tr>)}
  </tbody></table></div>;
}

function Orders({ rows }: { rows: PaperOrder[] }) {
  if (!rows.length) return <p className="empty">No bot orders in the broker snapshot.</p>;
  return <div className="table-scroll"><table><thead><tr><th>SUBMITTED AT</th><th>SIDE</th><th>STATUS</th><th>FILLED BTC</th><th>AVG FILL</th><th>ORDER ID</th></tr></thead><tbody>
    {rows.map((o) => <tr key={o.id}><td data-label="Submitted">{at(o.submittedAt)}</td><td data-label="Side"><span className={`side ${o.side}`}>{o.side.toUpperCase()}</span></td><td data-label="Status"><span className={`order-status ${o.status}`}>{o.status.replaceAll("_", " ")}</span></td><td data-label="Filled BTC">{qty(o.filledQty)}</td><td data-label="Avg fill">{usd(o.filledAvgPrice)}</td><td data-label="Order ID" className="order-id" title={o.clientOrderId}>{o.clientOrderId.slice(-16)}</td></tr>)}
  </tbody></table></div>;
}

export default function Home() {
  const [data, setData] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"exits" | "fills" | "orders">("exits");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/live", { cache: "no-store" });
        if (!response.ok) throw new Error(`Monitor API returned ${response.status}`);
        const incoming = await response.json() as Live;
        if (active) { setData(incoming); setError(null); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Monitor unavailable");
      }
    };
    void load();
    // GUESS: # UNCALIBRATED GUESS — display refresh cadence; source timestamps determine freshness.
    const timer = window.setInterval(() => void load(), 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const t = data?.telemetry ?? null;
  const orders = useMemo(() => (t?.orders ?? []).filter((o) => o.clientOrderId.startsWith("jsbotbtc")).sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? "")), [t]);
  const fills = useMemo(() => (t?.fills ?? []).filter((f) => f.clientOrderId.startsWith("jsbotbtc")).sort((a, b) => (b.transactionTime ?? "").localeCompare(a.transactionTime ?? "")), [t]);
  const exits = fills.filter((f) => f.side === "sell");
  const positions = (t?.positions ?? []).filter((p) => !p.protected);
  const protectedPositions = (t?.positions ?? []).filter((p) => p.protected);
  const openPnl = positions.length && positions.every((p) => p.unrealizedPl != null) ? positions.reduce((sum, p) => sum + Number(p.unrealizedPl), 0) : null;
  // GUESS: # UNCALIBRATED GUESS — tolerate an idle signed heartbeat for 20 minutes.
  const fresh = !!t && Date.now() - Date.parse(t.generatedAt) < 20 * 60_000;
  const healthy = fresh && t?.service.active && t?.capture?.active;
  const lastFill = fills[0];
  const lastOrder = orders[0];
  const lastDecision = t?.analysis?.lastDecision;
  return <main className="dashboard">
    <header className="header"><div><p className="eyebrow">INDEPENDENT OCAML TRADING LAB</p><h1>Alpaca paper trading</h1><p className="subtitle">Broker positions, executions and order state from the autonomous Dublin service.</p></div><div className={`live-status ${healthy ? "ok" : "stale"}`}><span className="dot" />{healthy ? "PAPER AGENT RUNNING" : "DATA OR SERVICE NEEDS CHECK"}<small>Broker snapshot {at(t?.generatedAt)}</small></div></header>
    {error && <div className="alert">{error}. Showing the last successful snapshot.</div>}
    {!t && !error && <div className="alert">Loading signed broker data…</div>}
    {t && <>
      <section className="summary" aria-label="Bot summary">
        <div className="summary-card"><span>OPEN BOT EXPOSURE</span><strong>{usd(positions.reduce((sum, p) => sum + Number(p.marketValue ?? 0), 0))}</strong><small>{positions.length} BTC position{positions.length === 1 ? "" : "s"} · next buy target $100 · AAPL excluded</small></div>
        <div className="summary-card"><span>OPEN P&amp;L · BROKER</span><strong className={tone(openPnl)}>{signed(openPnl)}</strong><small>Unrealized BTC mark from Alpaca</small></div>
        <div className="summary-card"><span>COMPLETED SELL FILLS</span><strong>{exits.length}</strong><small>{fills.length} total bot fills</small></div>
        <div className="summary-card"><span>LATEST BOT FILL</span><strong className="summary-time">{at(lastFill?.transactionTime)}</strong><small>{lastFill ? `${lastFill.side.toUpperCase()} ${qty(lastFill.qty)} BTC at ${usd(lastFill.price)}` : "No broker fill yet"}</small></div>
      </section>
      <section className="panel" id="open"><div className="section-head"><div><p className="eyebrow">01 / CURRENT EXPOSURE</p><h2>Open bot positions</h2></div><span className="source">Alpaca /v2/positions</span></div><Positions rows={positions} /><p className="panel-note">The BTC quote is the price of one whole coin; bot exposure is the market value of its fractional holding. Broker mark and unrealized P&amp;L are snapshots, not executable exit prices. {protectedPositions.length ? `${protectedPositions.map((p) => `${p.symbol} ${qty(p.qty)}`).join(", ")} is pre-existing and excluded from bot exposure and P&L.` : "No protected positions were returned."}</p></section>
      <section className="panel" id="closed"><div className="section-head"><div><p className="eyebrow">02 / EXECUTION HISTORY</p><h2>Completed sells and bot activity</h2></div><div className="tabs"><button className={view === "exits" ? "active" : ""} onClick={() => setView("exits")}>Sell fills ({exits.length})</button><button className={view === "fills" ? "active" : ""} onClick={() => setView("fills")}>All fills ({fills.length})</button><button className={view === "orders" ? "active" : ""} onClick={() => setView("orders")}>Orders ({orders.length})</button></div></div>{view === "orders" ? <Orders rows={orders} /> : <Fills rows={view === "exits" ? exits : fills} exits={view === "exits"} />}<p className="panel-note">{view === "exits" ? "Each row is an actual Alpaca paper sell fill. Gross proceeds exclude sell fees; several fills may belong to one order." : view === "fills" ? "Actual Alpaca FILL activities filtered to this bot. AAPL is excluded." : "Orders include cancellations and partial fills. A canceled order is not a completed trade."} {t.fillsComplete && t.ordersComplete ? "Broker history pagination completed." : "Broker history may be incomplete; counts are lower bounds."}</p></section>
      <section className="secondary-grid">
        <div className="panel compact"><p className="eyebrow">03 / RESULT ACCOUNTING</p><h2>Closed-trade net P&amp;L</h2><strong className="unavailable">Not yet verified</strong><p>This monitor does not yet reconcile Alpaca CFEE/FEE activities, which may post after trades. The table shows actual sell fills and gross proceeds. It does not invent a net realized result.</p><a href="https://docs.alpaca.markets/us/docs/crypto-fees" target="_blank" rel="noreferrer">How Alpaca posts crypto fees ↗</a></div>
        <div className="panel compact"><p className="eyebrow">04 / AGENT STATE</p><h2>Why there may be no new order</h2><p><b>Mode:</b> {t.service.mode} · <b>Capture:</b> {t.capture?.active ? "connected" : "not confirmed"}</p><p><b>Paper size:</b> $100 experimental baseline · $500 BTC exposure ceiling. The requested $50/$500 probability tiers await calibration.</p><p><b>Latest completed 5m bar (start):</b> {at(t.analysis?.fiveMinute?.lastBarAt)} · <b>EMA trend:</b> {t.analysis?.fiveMinute?.trend ?? "unavailable"}</p><p><b>Last candidate:</b> {at(lastDecision?.observedAt)} · <b>Policy:</b> {lastDecision?.policy ?? "unavailable"}</p><p><b>Last order:</b> {lastOrder ? `${lastOrder.side.toUpperCase()} ${lastOrder.status} at ${at(lastOrder.submittedAt)}` : "none"}</p><p>The experimental rule requires a quote move across the spread at its sample and a reconciled position. A healthy market stream can produce no qualifying order. Candle and trend readings are descriptive and do not authorize orders.</p></div>
      </section>
      <details className="panel audit"><summary>Engineering audit · account context and recent bot events</summary><div className="audit-body"><p>Account equity {usd(t.account.equity)} includes protected AAPL and is not bot P&amp;L. The page has no order controls. Signed Dublin snapshot: {at(t.generatedAt)}. Last market event: {at(t.capture?.lastEventAt)}.</p><ul>{t.journal.filter((e) => /^(SEND|ACK|reconcile|HOLD|HALT|HOT_DECISION) /.test(e.message)).slice(-12).reverse().map((e, i) => <li key={`${e.at}-${i}`}><time>{at(e.at)}</time> {e.message}</li>)}</ul><a href="https://github.com/coder058/jane-street-ocaml-trading-lab" target="_blank" rel="noreferrer">Source code and runbook ↗</a></div></details>
    </>}
    <footer>Independent engineering experiment · Alpaca paper only · Paper fills do not establish a profitable live strategy.</footer>
  </main>;
}

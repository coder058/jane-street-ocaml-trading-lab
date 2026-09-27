"use client";

import { useEffect, useMemo, useState } from "react";
import { botAccounting, botExecutions, botFills, botOrders, decisionForOrder, orderDisplayStatus,
  orderFillSummary, reasonForOrder } from "@/lib/bot-view";
import type { PaperFill, PaperOrder, PaperTelemetry } from "@/lib/telemetry";

type Live = { generatedAt: string; telemetry: PaperTelemetry | null };
type SideFilter = "trades" | "buy" | "sell" | "attempts";

const money = (value: number | string | null | undefined, digits = 2) => {
  const number = Number(value);
  return value == null || !Number.isFinite(number) ? "—" :
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits,
      maximumFractionDigits: digits }).format(number);
};
const signedMoney = (value: number | string | null | undefined, digits = 4) => {
  const number = Number(value);
  return value == null || !Number.isFinite(number) ? "—" : `${number > 0 ? "+" : ""}${money(number, digits)}`;
};
const quantity = (value: number | string | null | undefined) => {
  const number = Number(value);
  return value == null || !Number.isFinite(number) ? "—" :
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 9 }).format(number);
};
const clock = (value: string | null | undefined) => value && !Number.isNaN(Date.parse(value)) ?
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" })
    .format(new Date(value)) : "—";
const fullTime = (value: string | null | undefined) => value && !Number.isNaN(Date.parse(value)) ?
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" })
    .format(new Date(value)) + " UTC" : "—";
const tone = (value: number | null) => value == null ? "" : value > 0 ? "positive" : value < 0 ? "negative" : "";

function Activity({ fills, snapshotAt }: { fills: PaperFill[]; snapshotAt: string }) {
  // SOURCE: UTC hours are calendar buckets; count one order once per hour
  // even if several broker FILL activities belong to it.
  const hourMs = 60 * 60 * 1000;
  const latestHour = Math.floor(Date.parse(snapshotAt) / hourMs) * hourMs;
  const buckets = Array.from({ length: 24 }, (_, index) => {
    const start = latestHour - (23 - index) * hourMs;
    const matching = fills.filter((fill) => {
      const time = Date.parse(fill.transactionTime ?? "");
      return time >= start && time < start + hourMs;
    });
    return { start, buys: new Set(matching.filter((fill) => fill.side === "buy").map((fill) => fill.orderId)).size,
      sells: new Set(matching.filter((fill) => fill.side === "sell").map((fill) => fill.orderId)).size };
  });
  const maximum = Math.max(1, ...buckets.map((bucket) => bucket.buys + bucket.sells));
  return <div className="activity" role="img" aria-label="Filled bot orders by UTC hour over the last 24 hours">
    <div className="activity-bars">{buckets.map((bucket) => <div className="activity-slot" key={bucket.start}
      title={`${clock(new Date(bucket.start).toISOString())} UTC · ${bucket.buys} buy orders · ${bucket.sells} sell orders`}>
      <div className="activity-stack" style={{ height: `${((bucket.buys + bucket.sells) / maximum) * 100}%` }}>
        <div className="activity-buy" style={{ flex: bucket.buys }} /><div className="activity-sell" style={{ flex: bucket.sells }} />
      </div>
    </div>)}</div>
    <div className="activity-axis"><span>{clock(new Date(buckets[0].start).toISOString()).slice(0, 5)}</span>
      <span>Filled orders / hour · UTC</span><span>{clock(new Date(latestHour).toISOString()).slice(0, 5)}</span></div>
    <div className="legend"><span><i className="legend-buy" /> Buys</span><span><i className="legend-sell" /> Sells</span></div>
  </div>;
}

function OrderInspector({ order, fills, telemetry }: { order: PaperOrder | undefined; fills: PaperFill[];
  telemetry: PaperTelemetry }) {
  if (!order) return <div className="inspect-empty">No bot order appears in this broker snapshot.</div>;
  const executed = orderFillSummary(order, fills);
  const decision = decisionForOrder(order, telemetry.journal, telemetry.decisionHistory);
  const evidence = telemetry.journal.filter((event) => event.message.includes(order.clientOrderId)
    && /^(SEND|ACK|reconcile) /.test(event.message)).slice(-3);
  return <div className="inspector-body">
    <div className="inspector-head"><span className={`side-pill ${order.side}`}>{order.side.toUpperCase()}</span>
      <span className={`status-word ${order.status}`}>{orderDisplayStatus(order)}</span></div>
    <h3>{order.side === "buy" ? "Entry order" : "Exit order"}</h3>
    <p className="inspect-time">Submitted {fullTime(order.submittedAt)}</p>
    <div className="inspect-stats"><div><small>Executed value</small><strong>{money(executed.notional)}</strong></div>
      <div><small>Executed at · average</small><strong>{money(executed.averagePrice)} / BTC</strong></div>
      <div><small>Filled quantity</small><strong>{quantity(executed.quantity)} BTC</strong></div>
      <div><small>Broker fills</small><strong>{executed.fillCount}</strong></div></div>
    {order.status === "canceled" && executed.quantity > 0 && <p className="inspect-note">Part of this order filled. The broker canceled only the remainder.</p>}
    {order.status === "canceled" && executed.quantity === 0 && <p className="inspect-note">No execution occurred, so this order did not create a trade.</p>}
    <div className="decision-card"><span className="mini-label">ORDER REASON</span>
      <p>{reasonForOrder(order, decision)}</p>
      <dl><div><dt>Policy</dt><dd>{decision?.policy ?? "Unavailable"}</dd></div>
        <div><dt>Earlier quote</dt><dd>{fullTime(decision?.reference_quote_time)}</dd></div>
        <div><dt>Quote time</dt><dd>{fullTime(decision?.quote_time)}</dd></div>
        <div><dt>Decision latency</dt><dd>{decision?.receive_to_decision_ms ? `${decision.receive_to_decision_ms} ms` : "—"}</dd></div>
        <div><dt>Trend context</dt><dd>{decision?.trend ?? "—"} · descriptive only</dd></div></dl>
      <small>The quote cross authorized this order. Candles and Markov probabilities did not. Historical quote prices were not retained in this decision record.</small>
    </div>
    <div className="event-trace"><span className="mini-label">BROKER TRACE</span>
      {evidence.length ? evidence.map((event) => <p key={`${event.at}-${event.message}`}><time>{clock(event.at)}</time>
        {event.message.replace(order.clientOrderId, "this order")}</p>) : <p>No retained journal messages for this order.</p>}
    </div>
    <code className="full-id">{order.clientOrderId}</code>
  </div>;
}

export default function Home() {
  const [data, setData] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SideFilter>("trades");
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    // GUESS: # UNCALIBRATED GUESS — refresh the visible snapshot every 15s.
    const timer = window.setInterval(() => void load(), 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const t = data?.telemetry ?? null;
  const orders = useMemo(() => t ? botOrders(t) : [], [t]);
  const fills = useMemo(() => t ? botFills(t) : [], [t]);
  const executions = useMemo(() => t ? botExecutions(t) : [], [t]);
  const accounting = useMemo(() => t ? botAccounting(t) : null, [t]);
  const filtered = filter === "attempts" ? orders : executions.map(({ order }) => order)
    .filter((order) => filter === "trades" || order.side === filter);
  // GUESS: # UNCALIBRATED GUESS — initially show ten orders for scannability.
  const visible = showAll ? filtered : filtered.slice(0, 10);
  const selected = visible.find((order) => order.id === selectedId) ?? visible[0];
  const btcPosition = t?.positions.find((position) => !position.protected &&
    (position.symbol === "BTCUSD" || position.symbol === "BTC/USD"));
  const openPnl = btcPosition?.unrealizedPl == null ? null : Number(btcPosition.unrealizedPl);
  const sellOrders = executions.filter(({ order }) => order.side === "sell");
  // GUESS: # UNCALIBRATED GUESS — 20 minutes marks stale display data,
  // not service uptime or a trading signal.
  const fresh = !!t && Date.now() - Date.parse(t.generatedAt) < 20 * 60_000;
  const healthy = !!t && fresh && t.service.active && t.capture?.active;

  return <main className="dashboard">
    <header className="topbar"><div className="brand"><div className="brand-mark">P<span>·</span>M</div>
      <div><strong>Paper Market Lab</strong><small>Independent OCaml trading system</small></div></div>
      <div className="topbar-right"><span className="topbar-venue">BTC / USD <b>ALPACA PAPER</b></span>
        <span className={`health ${healthy ? "healthy" : "unhealthy"}`}><i />{healthy ? "AGENT ONLINE" : "CHECK DATA / SERVICE"}</span></div>
    </header>

    <section className="page-intro"><div><span className="eyebrow">LIVE PAPER OPERATIONS / DUBLIN</span>
      <h1>Every paper trade, explained.</h1><p>Actual broker fills first. Order decisions, position and accounting alongside them.</p></div>
      <div className="snapshot-time"><span>LATEST SIGNED BROKER SNAPSHOT</span><strong>{fullTime(t?.generatedAt)}</strong>
        <small>Page updates automatically. Values are simulated.</small></div></section>

    {error && <div className="alert">{error}. Showing the last successful snapshot.</div>}
    {!t && !error && <div className="loading">Loading signed broker data…</div>}
    {t && <>
      <section className="recent-trades" aria-label="Latest executed paper trades">
        <div className="recent-heading"><div><span className="eyebrow">EXECUTED AT ALPACA PAPER</span>
          <h2>Latest trades</h2><p>Each card groups every broker fill belonging to one order.</p></div>
          <a href="#orders">Full execution history ↓</a></div>
        <div className="recent-grid">{/* GUESS: # UNCALIBRATED GUESS — three recent executions fit a quick scan. */}
          {executions.slice(0, 3).map(({ order, fill }) => {
            const decision = decisionForOrder(order, t.journal, t.decisionHistory);
            return <article className="recent-card" key={order.id}>
              <div className="recent-top"><span className={`side-pill ${order.side}`}>{order.side === "buy" ? "ENTRY / BUY" : "EXIT / SELL"}</span>
                <time>{fullTime(fill.lastAt)}</time></div>
              <div className="recent-numbers"><strong>{money(fill.notional)}</strong><span>{quantity(fill.quantity)} BTC<br />at {money(fill.averagePrice)} / BTC</span></div>
              <p><b>Why this order:</b> {reasonForOrder(order, decision)}</p>
              <small>{fill.fillCount} broker {fill.fillCount === 1 ? "fill" : "fills"} · {orderDisplayStatus(order)} · {decision?.policy ?? "trace unavailable"}</small>
            </article>;
          })}
          {!executions.length && <p className="empty">No BTC executions appear in this broker snapshot.</p>}
        </div>
      </section>
      <section className="hero-grid" aria-label="Paper account overview">
        <div className="result-panel"><div className="result-top"><span className="eyebrow">INDICATIVE BOT CASH + MARK / BTC ONLY</span>
          <span className="result-badge">{accounting?.flat ? "FLAT" : "OPEN INVENTORY"}</span></div>
          <strong className={`result-number ${tone(accounting?.markedResult ?? null)}`}>
            {accounting?.available ? `${signedMoney(accounting.markedResult, 2)} USD` : "Unavailable"}</strong>
          <p className="result-caption">{accounting?.flat ? "Executed cash difference while BTC is flat" :
            "Executed cash flows plus broker BTC market value"}</p>
          <div className="result-ledger"><div><span>Buy executions</span><b>{accounting?.available ? money(accounting.buyNotional) : "—"}</b></div>
            <div><span>Sell executions</span><b>{accounting?.available ? money(accounting.sellNotional) : "—"}</b></div>
            <div><span>Open BTC mark</span><b>{accounting?.available ? money(accounting.marketValue) : "—"}</b></div></div>
          <div className="result-caution"><span>ACCOUNTING STATUS</span><p>{accounting?.available ?
            "Indicative paper result, not verified net P&L. Buy-side BTC quantity reductions may already reflect fees; CFEE/FEE activities can post later. An open mark is not an executable exit price."
            : accounting?.reason ?? "Broker result unavailable."}</p></div>
        </div>
        <div className="position-panel"><div className="panel-heading"><span className="eyebrow">CURRENT BTC POSITION</span>
          <span className={`position-state ${btcPosition ? "is-open" : ""}`}>{btcPosition ? "● OPEN" : "○ FLAT"}</span></div>
          <strong className="position-value">{btcPosition ? money(btcPosition.marketValue) : "$0.00"}</strong>
          <span className="position-sub">{btcPosition ? `${quantity(btcPosition.qty)} BTC held` : "No BTC exposure at this snapshot"}</span>
          <div className="position-pnl"><span>Broker unrealized P&amp;L</span><b className={tone(openPnl)}>{btcPosition ? signedMoney(openPnl, 2) : "—"}</b></div>
          <div className="position-facts"><div><span>Entry</span><strong>{money(btcPosition?.avgEntryPrice)}</strong></div>
            <div><span>Broker mark</span><strong>{money(btcPosition?.currentPrice)}</strong></div></div>
          <div className="risk-strip"><span>BASELINE BUY <b>$100</b></span><span>BTC EXPOSURE CAP <b>$500</b></span></div>
        </div>
      </section>

      <section className="quick-stats"><div><span>EXECUTED ORDERS</span><strong>{executions.length}</strong><small>{sellOrders.length} exits · {fills.length} individual broker fills</small></div>
        <div><span>CLOSED-TRADE NET P&amp;L</span><strong className="policy-name">Not verified</strong><small>Broker fee activities and position lots need reconciliation</small></div>
        <div><span>POLICY SENDING ORDERS</span><strong className="policy-name">{t.analysis?.lastDecision?.policy ?? "Unavailable"}</strong><small>Murphy / candles / Markov are read-only</small></div></section>

      <section className="work-grid" id="orders"><div className="orders-panel"><div className="section-title"><div><span className="eyebrow">BROKER EXECUTION HISTORY</span>
        <h2>Trade history</h2><p>One row per executed order. Partial fills are grouped; attempts without fills are separate.</p></div>
        <span className="section-count">{executions.length} EXECUTED</span></div>
        <div className="filter-row" role="group" aria-label="Filter orders">
          {(["trades", "buy", "sell", "attempts"] as SideFilter[]).map((side) => <button key={side} type="button"
            className={filter === side ? "selected" : ""} onClick={() => { setFilter(side); setShowAll(false); }}>
            {side === "trades" ? "All trades" : side === "buy" ? "Entries" : side === "sell" ? "Exits" : "All attempts"}</button>)}
          <span>{filtered.length} in filter</span></div>
        <div className={`order-list ${showAll ? "expanded" : ""}`}>{visible.map((order) => {
          const executed = orderFillSummary(order, fills);
          const decision = decisionForOrder(order, t.journal, t.decisionHistory);
          return <button type="button" key={order.id} className={`order-row ${selected?.id === order.id ? "active" : ""}`}
            onClick={() => setSelectedId(order.id)} aria-pressed={selected?.id === order.id}>
            <span className={`order-side ${order.side}`}>{order.side === "buy" ? "↗" : "↙"}</span>
            <span className="order-main"><strong>{order.side === "buy" ? "ENTRY · BUY" : "EXIT · SELL"} BTC</strong>
              <small>{reasonForOrder(order, decision)}</small><small>{orderDisplayStatus(order)} · {executed.fillCount} fills</small></span>
            <span className="order-amount"><strong>{money(executed.notional)}</strong><small>{quantity(executed.quantity)} BTC at {money(executed.averagePrice)}</small></span>
            <span className="order-when">{fullTime(executed.lastAt ?? order.submittedAt)}</span>
          </button>;
        })}{!visible.length && <p className="empty">No {filter === "attempts" ? "bot orders" : "executed trades"} in this filter.</p>}</div>
        {filtered.length > 10 && <button type="button" className="show-more" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show recent orders" : `Show all ${filtered.length} orders`} <span aria-hidden="true">↗</span></button>}
      </div>
      <aside className="inspector-panel" id="trade-detail"><div className="section-title compact-title"><div><span className="eyebrow">SELECTED TRADE / ORDER</span>
        <h2>What happened?</h2></div></div><OrderInspector order={selected} fills={fills} telemetry={t} /></aside></section>

      <section className="bottom-grid"><div className="activity-panel"><div className="section-title"><div><span className="eyebrow">MARKET ACTIVITY</span>
        <h2>Bot executions over time</h2><p>Unique filled orders by UTC hour. Counts do not imply profit.</p></div></div>
        <Activity fills={fills} snapshotAt={t.generatedAt} /></div>
        <div className="research-panel"><span className="eyebrow">RESEARCH / NO ORDER AUTHORITY</span><h2>What drives trades?</h2>
          <p>The active OCaml rule is <b>{t.analysis?.lastDecision?.policy ?? "unavailable"}</b>. It checks whether a sampled BTC quote crossed the earlier spread. The latest closed-bar trend is <b>{t.analysis?.fiveMinute?.trend ?? "unavailable"}</b>, but it does not trigger orders.</p>
          <div className="research-rows"><div><span>Markov / candle model</span><strong>Shadow only</strong></div>
            <div><span>Probability size tiers</span><strong>Not calibrated</strong></div>
            <div><span>Execution venue</span><strong>Alpaca paper</strong></div></div>
          <a href="https://github.com/coder058/jane-street-ocaml-trading-lab/blob/main/docs/POLICY-ATTEMPTS.md" target="_blank" rel="noreferrer">Read the policy evidence ↗</a></div></section>

      <footer><span>Independent project · simulated Alpaca execution · AAPL is protected and excluded from bot accounting.</span>
        <span>Paper fills and midpoint studies do not establish a profitable live strategy.</span></footer>
    </>}
  </main>;
}

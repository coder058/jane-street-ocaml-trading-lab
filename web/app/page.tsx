"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketFrame, MarketSignal, MarketSymbol, Timeframe } from "@/lib/market";
import type { JournalEvent, PaperFill, PaperOrder, PaperTelemetry } from "@/lib/telemetry";

type Live = { generatedAt: string; market: MarketSymbol[]; telemetry: PaperTelemetry | null };

const money = (value: string | number | null | undefined) => {
  const n = Number(value);
  return value == null || !Number.isFinite(n) ? "—" :
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
};
const number = (value: number | string | null | undefined, digits = 2) => {
  const n = Number(value);
  return value == null || !Number.isFinite(n) ? "—" :
    new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);
};
const time = (value: string | null | undefined) => value && !Number.isNaN(Date.parse(value)) ?
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC" : "—";

function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) return <div className="spark-empty">Waiting for closed candles</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, i) => {
    const x = (i / (values.length - 1)) * 360;
    const y = 88 - ((value - min) / span) * 72;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return <svg className={`spark ${positive ? "up" : "down"}`} viewBox="0 0 360 100" preserveAspectRatio="none" role="img" aria-label="Closed candle price path">
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
  </svg>;
}

function StatusBadge({ telemetry }: { telemetry: PaperTelemetry | null }) {
  const status = telemetry?.service.mode ?? "NOT CONNECTED";
  // GUESS: # UNCALIBRATED GUESS — allow a 20-minute age for the 15-minute idle heartbeat.
  const live = telemetry && Date.now() - Date.parse(telemetry.generatedAt) < 20 * 60_000;
  return <span className={`status ${live ? "status-live" : "status-stale"}`}>
    <span className="status-dot" /> {status} · {live ? "synced" : "stale"}
  </span>;
}

function SignalList({ signals }: { signals: MarketSignal[] }) {
  if (!signals.length) return <div className="empty-line">No candle shapes in the selected recent window.</div>;
  return <div className="signal-list">{signals.map((signal, index) =>
    <div className="signal-row" key={`${signal.symbol}-${signal.timeframe}-${signal.at}-${signal.label}-${index}`}>
      <span className={`signal-icon ${signal.direction}`}>{signal.direction === "up" ? "↗" : signal.direction === "down" ? "↘" : "◇"}</span>
      <div><strong>{signal.label}</strong><small>{signal.symbol} · {signal.timeframe} · {time(signal.at)}</small></div>
      <span className="signal-source">Shape only</span>
    </div>)}</div>;
}

function MarketPanel({ market, selected, onSelect, frame, onFrame }: {
  market: MarketSymbol[]; selected: string; onSelect: (symbol: string) => void;
  frame: Timeframe; onFrame: (frame: Timeframe) => void;
}) {
  const item = market.find((row) => row.symbol === selected);
  const selectedFrame = item?.frames.find((row) => row.timeframe === frame);
  const signals = item?.signals.filter((row) => row.timeframe === frame) ?? [];
  return <section className="panel market-panel">
    <div className="panel-head"><div><p className="eyebrow">01 / MARKET CONTEXT</p><h2>Pattern Forge signals</h2></div><span className="source-tag">HYPERLIQUID · CLOSED BARS</span></div>
    <div className="market-picker">{["BTC", "ETH", "SOL"].map((symbol) => {
      const row = market.find((value) => value.symbol === symbol);
      const mini = row?.frames.find((value) => value.timeframe === "5m");
      return <button key={symbol} className={`market-choice ${selected === symbol ? "selected" : ""}`} onClick={() => onSelect(symbol)}>
        <span className="asset-mark">{symbol === "BTC" ? "₿" : symbol === "ETH" ? "Ξ" : "◎"}</span>
        <span><strong>{symbol}</strong><small>{mini ? money(mini.close) : "Unavailable"}</small></span>
        {mini && <em className={mini.returnPct >= 0 ? "positive" : "negative"}>{mini.returnPct >= 0 ? "+" : ""}{mini.returnPct.toFixed(2)}%</em>}
      </button>;
    })}</div>
    <div className="chart-toolbar"><div className="asset-title"><span className="asset-emblem">{selected === "BTC" ? "₿" : selected === "ETH" ? "Ξ" : "◎"}</span><div><strong>{selected} / USD</strong><small>Hyperliquid context · Alpaca execution is separate</small></div></div>
      <div className="frame-tabs">{(["5m", "1h", "1d"] as Timeframe[]).map((value) => <button key={value} onClick={() => onFrame(value)} className={frame === value ? "active" : ""}>{value}</button>)}</div>
    </div>
    <div className="chart-main"><div className="chart-price"><strong>{selectedFrame ? money(selectedFrame.close) : "—"}</strong><span className={selectedFrame && selectedFrame.returnPct >= 0 ? "positive" : "negative"}>{selectedFrame ? `${selectedFrame.returnPct >= 0 ? "+" : ""}${selectedFrame.returnPct.toFixed(3)}%` : "No data"}</span></div>
      <Sparkline values={selectedFrame?.sparkline ?? []} positive={(selectedFrame?.returnPct ?? 0) >= 0} />
      <div className="chart-foot"><span>Last closed: {time(selectedFrame?.closeTime)}</span><span>EMA 20 / 50: {number(selectedFrame?.ema20)} / {number(selectedFrame?.ema50)}</span><span>RSI 14: {number(selectedFrame?.rsi14, 1)}</span></div>
    </div>
    <div className="signal-section"><div className="subhead"><h3>Recent candle readings</h3><span>Descriptive · uncalibrated</span></div><SignalList signals={signals} /></div>
    {!!item?.errors.length && <div className="data-note">{item.errors.join(" · ")}</div>}
  </section>;
}

function OrderTable({ orders }: { orders: PaperOrder[] }) {
  if (!orders.length) return <div className="empty-state">No broker orders received yet. The monitor does not invent trade history.</div>;
  return <div className="table-scroll"><table><thead><tr><th>TIME / UTC</th><th>ASSET</th><th>SIDE</th><th>STATUS</th><th>FILLED</th><th>AVG FILL</th></tr></thead><tbody>
    {orders.map((order) => <tr key={order.id}>
      <td>{time(order.submittedAt)}</td><td className="cell-strong">{order.symbol}</td>
      <td><span className={`side ${order.side === "buy" ? "buy" : "sell"}`}>{order.side.toUpperCase()}</span></td>
      <td><span className={`order-status ${order.status}`}>{order.status.replaceAll("_", " ")}</span></td>
      <td className="mono">{number(order.filledQty, 9)}</td><td className="mono">{money(order.filledAvgPrice)}</td>
    </tr>)}</tbody></table></div>;
}

function FillTable({ fills }: { fills: PaperFill[] }) {
  if (!fills.length) return <div className="empty-state">No Alpaca FILL activities received yet. Orders and executions are separate broker records.</div>;
  return <><div className="fill-explain">Alpaca FILL activities are actual paper executions. One order can produce multiple fills; the historical AAPL fills predate this bot.</div>
    <div className="table-scroll"><table><thead><tr><th>TIME / UTC</th><th>ASSET</th><th>SIDE</th><th>EXECUTION</th><th>QUANTITY</th><th>PRICE</th></tr></thead><tbody>
      {fills.map((fill) => <tr key={fill.id}>
        <td>{time(fill.transactionTime)}</td><td className="cell-strong">{fill.symbol}</td>
        <td><span className={`side ${fill.side === "buy" ? "buy" : "sell"}`}>{fill.side.toUpperCase()}</span></td>
        <td>{fill.type.replaceAll("_", " ")}</td><td className="mono">{number(fill.qty, 9)}</td><td className="mono">{money(fill.price)}</td>
      </tr>)}</tbody></table></div></>;
}

function Journal({ events }: { events: JournalEvent[] }) {
  const [filter, setFilter] = useState<"decisions" | "all" | "quotes">("decisions");
  const [page, setPage] = useState(0);
  // GUESS: # UNCALIBRATED GUESS — forty rows per page keeps the event log usable;
  // this is a display limit, not a trading or retention rule.
  const pageSize = 40;
  const matching = events.filter((event) => filter === "all" ||
    (event.message.startsWith("QUOTE ") ? filter === "quotes" : filter === "decisions"));
  const lastPage = Math.max(0, Math.ceil(matching.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  if (!events.length) return <div className="empty-state">Waiting for signed events from the Dublin service.</div>;
  return <><div className="journal-controls"><div className="journal-filters">{(["decisions", "all", "quotes"] as const).map((choice) =>
    <button key={choice} className={filter === choice ? "active" : ""} onClick={() => { setFilter(choice); setPage(0); }}>
      {choice === "decisions" ? "Decisions & orders" : choice === "all" ? "All events" : "Quotes"}
    </button>)}</div><span>{matching.length} of {events.length} events{filter === "all" ? "" : ` · ${filter}`}</span></div>
  <div className="journal-list">{matching.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((event, index) => {
    const kind = event.message.split(" ")[0];
    return <div className="journal-event" key={`${event.at}-${currentPage}-${index}`}><span className="journal-rail" /><time>{time(event.at)}</time><span className={`event-kind kind-${kind.toLowerCase()}`}>{kind}</span><p>{event.message.slice(kind.length).trim()}</p></div>;
  })}</div><div className="journal-pager"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>← Newer</button><span>Page {currentPage + 1} of {lastPage + 1}</span><button disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Older →</button></div></>;
}

export default function Home() {
  const [data, setData] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("BTC");
  const [frame, setFrame] = useState<Timeframe>("5m");
  const [tab, setTab] = useState<"fills" | "orders" | "journal">("fills");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/live", { cache: "no-store" });
        if (!response.ok) throw new Error(`Monitor API returned ${response.status}`);
        const incoming = await response.json() as Live;
        if (active) { setData(incoming); setError(null); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Monitor API unavailable");
      }
    };
    void load();
    // GUESS: # UNCALIBRATED GUESS — refresh display every 15 seconds; cache and
    // source timestamps remain visible so this is not called tick-level live.
    const timer = window.setInterval(() => void load(), 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const telemetry = data?.telemetry ?? null;
  const recentOrders = useMemo(() => [...(telemetry?.orders ?? [])].sort((a, b) =>
    (b.submittedAt ?? "").localeCompare(a.submittedAt ?? "")), [telemetry]);
  const recentFills = useMemo(() => [...(telemetry?.fills ?? [])].sort((a, b) =>
    (b.transactionTime ?? "").localeCompare(a.transactionTime ?? "")), [telemetry]);
  const botFills = recentFills.filter((fill) => fill.clientOrderId.startsWith("jsbotbtc"));
  const botOrdersWithFills = new Set(botFills.map((fill) => fill.orderId)).size;
  const events = useMemo(() => [...(telemetry?.journal ?? [])].sort((a, b) => b.at.localeCompare(a.at)), [telemetry]);
  const latestShadow = events.find((event) => event.message.startsWith("SHADOW "));
  const shadowReading = latestShadow?.message.split(" quote_time=")[0]
    .replace("SHADOW diagnostic=hold:", "Hold · ")
    .replace("SHADOW diagnostic=hypothetical_buy", "Hypothetical buy")
    .replace("SHADOW diagnostic=hypothetical_sell", "Hypothetical sell")
    .replace("SHADOW ", "");
  // GUESS: # UNCALIBRATED GUESS — same idle heartbeat allowance as the header.
  const serviceCurrent = telemetry && Date.now() - Date.parse(telemetry.generatedAt) < 20 * 60_000;
  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">J<span>·</span>S</span><div><strong>OCaml Trading Lab</strong><small>INDEPENDENT PAPER RESEARCH</small></div></div><nav><a href="#market">Market</a><a href="#execution">Execution</a><a href="#research">Research</a><a href="https://github.com/coder058/jane-street-ocaml-trading-lab" target="_blank" rel="noreferrer">Source ↗</a></nav><div className="top-status"><span className="paper-chip">PAPER ONLY</span><StatusBadge telemetry={telemetry} /></div></header>
    <div className="content"><div className="hero"><div><p className="eyebrow">LIVE SYSTEM VIEW / DUBLIN, IRELAND</p><h1>Every decision, <em>visible.</em></h1><p className="hero-copy">An auditable paper trading experiment: broker executions, closed-candle context, and the agent’s actual event journal. Market readings are descriptions, not a promise of profitable trades.</p></div><div className="hero-meta"><span className="pulse-line" /><span>Last monitor response<br/><strong>{time(data?.generatedAt)}</strong></span></div></div>
    {error && <div className="alert">Monitor API: {error}. Existing data remains visible with its last timestamp.</div>}
    <div className="metric-grid"><div className="metric-card"><span>ACCOUNT EQUITY <i>↗</i></span><strong>{telemetry ? money(telemetry.account.equity) : "—"}</strong><small>Includes pre-existing AAPL · not bot P&amp;L</small></div><div className="metric-card"><span>BOT MODE <i>◉</i></span><strong className="mode-value">{serviceCurrent ? telemetry?.service.mode.replace("_", " ") : "NO FRESH DATA"}</strong><small>{telemetry ? `Snapshot ${time(telemetry.generatedAt)}` : "Signed VPS telemetry pending"}</small></div><div className="metric-card"><span>BOT EXECUTION FILLS <i>↗</i></span><strong>{telemetry?.fills ? number(botFills.length, 0) : "—"}</strong><small>{telemetry?.fills ? `${botOrdersWithFills} BTC orders · Alpaca FILL activities` : "Signed broker history pending"}</small></div><div className="metric-card"><span>OPEN POSITIONS <i>◫</i></span><strong>{telemetry ? number(telemetry.positions.length, 0) : "—"}</strong><small>AAPL is protected from this bot</small></div></div>
    <div className="analysis-status"><strong>OCaml read-only analysis</strong><span>{latestShadow ? `${shadowReading} · uncalibrated, no order · ${time(latestShadow.at)}` : "Waiting for the next signed Dublin analysis snapshot"}</span></div>
    <div className="main-grid" id="market"><MarketPanel market={data?.market ?? []} selected={selected} onSelect={setSelected} frame={frame} onFrame={setFrame} />
      <aside className="sidebar"><section className="panel side-panel"><div className="panel-head"><div><p className="eyebrow">02 / SAFETY STATE</p><h2>Execution boundary</h2></div><span className="lock-symbol">⌁</span></div><div className="guardrail"><span className="guardrail-icon">✓</span><div><strong>Paper endpoint only</strong><small>Orders cannot target the live Alpaca host.</small></div></div><div className="guardrail"><span className="guardrail-icon">✓</span><div><strong>AAPL protected</strong><small>10 pre-existing shares remain outside BTC order code.</small></div></div><div className="guardrail"><span className="guardrail-icon">✓</span><div><strong>Pre-trade validation pending</strong><small>The diagnostic rule is disarmed while edge and costs are tested.</small></div></div><div className="guardrail"><span className="guardrail-icon">⌁</span><div><strong>Alpaca US data capture {serviceCurrent && telemetry?.capture?.active ? "running" : "unverified"}</strong><small>{telemetry?.capture?.lastEventAt ? `Latest private market event: ${time(telemetry.capture.lastEventAt)}` : "Raw quotes, trades and books stay on Dublin."}</small></div></div><div className="boundary-foot">Current account mode comes from the signed Dublin snapshot. The webpage has no order button.<br/><a className="text-link" href="https://github.com/coder058/jane-street-ocaml-trading-lab/blob/main/docs/pretrade-evidence.md" target="_blank" rel="noreferrer">Read the pre-trade evidence ↗</a></div></section>
      <section className="panel side-panel" id="research"><div className="panel-head"><div><p className="eyebrow">03 / CROSS-ASSET CONTEXT</p><h2>Energy watchlist</h2></div></div><div className="watch-row"><span>WTI / Brent</span><strong>EIA daily benchmark</strong><small>Historical candidate · no trade signal</small></div><div className="watch-row"><span>EU power / gas</span><strong>Energy Monitor</strong><small>Different market & units · no Alpaca mapping</small></div><a className="text-link" href="https://energy-monitor-jordi.jlpmccs.chatgpt.site/" target="_blank" rel="noreferrer">Open Energy Monitor ↗</a></section></aside></div>
    <section className="panel execution-panel" id="execution"><div className="panel-head"><div><p className="eyebrow">04 / EXECUTION & EVIDENCE</p><h2>Paper activity</h2></div><div className="section-tabs"><button className={tab === "fills" ? "active" : ""} onClick={() => setTab("fills")}>Executed fills</button><button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>Broker orders</button><button className={tab === "journal" ? "active" : ""} onClick={() => setTab("journal")}>Agent journal</button></div></div>{tab === "fills" ? <FillTable fills={recentFills} /> : tab === "orders" ? <OrderTable orders={recentOrders} /> : <Journal events={events} />}<div className="table-foot"><span>{tab === "fills" ? `Alpaca paper FILL activities · ${telemetry?.fillsComplete ? "complete API result" : "completeness not verified"}` : tab === "orders" ? "Broker source: Alpaca paper /v2/orders" : `Source: OCaml event journal on Dublin · ${telemetry?.journalComplete ? "complete window" : "older events retained on VPS"}`}</span><span>{telemetry ? `Captured ${time(telemetry.generatedAt)}` : "Signed telemetry pending"}</span></div></section>
    <footer><div><span className="brand-mark mini">J<span>·</span>S</span> Independent engineering project. No Jane Street affiliation.</div><p>Paper fills are simulated. Pattern shapes and indicators are uncalibrated; live trading may lose money after spread, fees and slippage.</p><div className="footer-links"><a href="https://pattern-forge-five.vercel.app/" target="_blank" rel="noreferrer">Pattern Forge ↗</a><a href="https://app.alpaca.markets/dashboard/overview" target="_blank" rel="noreferrer">Alpaca paper dashboard ↗</a></div></footer>
    </div>
  </main>;
}

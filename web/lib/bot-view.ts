import type { PaperFill, PaperOrder, PaperTelemetry } from "./telemetry";

export type BotAccounting = {
  available: boolean;
  flat: boolean;
  buyNotional: number;
  sellNotional: number;
  marketValue: number;
  cashDifference: number;
  markedResult: number | null;
  reason: string | null;
};

const botOrder = (id: string) => id.startsWith("jsbotbtc");
const btc = (symbol: string) => symbol === "BTCUSD" || symbol === "BTC/USD";

export function botOrders(t: PaperTelemetry): PaperOrder[] {
  return t.orders.filter((order) => botOrder(order.clientOrderId) && btc(order.symbol))
    .sort((left, right) => (right.submittedAt ?? "").localeCompare(left.submittedAt ?? ""));
}

export function botFills(t: PaperTelemetry): PaperFill[] {
  return (t.fills ?? []).filter((fill) => botOrder(fill.clientOrderId) && btc(fill.symbol))
    .sort((left, right) => (right.transactionTime ?? "").localeCompare(left.transactionTime ?? ""));
}

export function botAccounting(t: PaperTelemetry): BotAccounting {
  const unavailable = (reason: string): BotAccounting => ({
    available: false, flat: false, buyNotional: 0, sellNotional: 0,
    marketValue: 0, cashDifference: 0, markedResult: null, reason,
  });
  if (!t.ordersComplete || !t.fillsComplete || !Array.isArray(t.fills))
    return unavailable("Broker order or fill history is incomplete.");
  if (t.orders.some((order) => btc(order.symbol) && !botOrder(order.clientOrderId)))
    return unavailable("BTC activity outside this bot prevents attribution.");
  const positions = t.positions.filter((position) => btc(position.symbol) && !position.protected);
  if (positions.length > 1) return unavailable("Multiple BTC positions prevent attribution.");
  const position = positions[0];
  if (position && position.marketValue == null)
    return unavailable("Broker BTC market value is missing.");
  const quantity = position ? Number(position.qty) : 0;
  const marketValue = position ? Number(position.marketValue) : 0;
  if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(marketValue) || marketValue < 0)
    return unavailable("Broker BTC quantity or mark is missing.");
  const ids = new Set(botOrders(t).map((order) => order.id));
  let buyNotional = 0;
  let sellNotional = 0;
  for (const fill of botFills(t)) {
    const qty = Number(fill.qty);
    const price = Number(fill.price);
    if (!ids.has(fill.orderId) || !Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || price <= 0)
      return unavailable("A bot fill cannot be matched to a valid broker order.");
    if (fill.side === "buy") buyNotional += qty * price;
    else if (fill.side === "sell") sellNotional += qty * price;
    else return unavailable("A bot fill has an unexpected side.");
  }
  const cashDifference = sellNotional - buyNotional;
  return {
    available: true, flat: quantity === 0, buyNotional, sellNotional,
    marketValue, cashDifference, markedResult: cashDifference + marketValue,
    reason: null,
  };
}

export function orderFillSummary(order: PaperOrder, fills: PaperFill[]): { quantity: number; notional: number } {
  const matching = fills.filter((fill) => fill.orderId === order.id);
  return {
    quantity: matching.reduce((sum, fill) => sum + Number(fill.qty), 0),
    notional: matching.reduce((sum, fill) => sum + Number(fill.qty) * Number(fill.price), 0),
  };
}

export function orderDisplayStatus(order: PaperOrder): string {
  const filled = Number(order.filledQty);
  if (order.status === "canceled" && filled > 0) return "Partial fill · rest canceled";
  if (order.status === "canceled") return "Canceled · no fill";
  if (order.status === "filled") return "Filled";
  return order.status.replaceAll("_", " ");
}

export function decisionForOrder(order: PaperOrder, journal: PaperTelemetry["journal"]): Record<string, string> | null {
  const suffix = order.clientOrderId.replace(/^jsbotbtc(?:buy|sell)/, "");
  const decision = journal.findLast((entry) => {
    if (!entry.message.startsWith("HOT_DECISION ")) return false;
    const quoteTime = entry.message.match(/(?:^| )quote_time=([^ ]+)/)?.[1];
    return quoteTime?.replace(/[^A-Za-z0-9]/g, "") === suffix;
  });
  if (!decision) return null;
  return Object.fromEntries(decision.message.split(" ").slice(1).filter((part) => part.includes("="))
    .map((part) => part.split(/=(.*)/s).slice(0, 2)));
}

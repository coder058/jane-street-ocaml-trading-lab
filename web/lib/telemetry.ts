import { get } from "@vercel/blob";

export type PaperOrder = {
  id: string;
  clientOrderId: string;
  symbol: string;
  side: string;
  status: string;
  filledQty: string;
  submittedAt: string | null;
};

export type PaperFill = {
  id: string;
  orderId: string;
  symbol: string;
  side: string;
  qty: string;
  price: string;
  transactionTime: string | null;
};

export type PaperPosition = {
  symbol: string;
  qty: string;
  side: string;
  avgEntryPrice: string;
  marketValue: string | null;
  currentPrice?: string | null;
  unrealizedPl?: string | null;
  protected: boolean;
};

export type JournalEvent = {
  at: string;
  message: string;
};

export type PaperTelemetry = {
  version: 1;
  generatedAt: string;
  source: "Dublin OCaml paper service";
  service: { active: boolean; mode: "MONITOR" | "PAPER_ORDER" | "STOPPED" };
  capture?: { active: boolean; lastEventAt: string | null; bytesToday: number };
  analysis?: {
    fiveMinute: {
      observedAt: string | null;
      retrievedAt: string | null;
      lastBarAt: string | null;
      contiguousBars: number;
      trend: string;
      probability: null;
      orderAuthority: false;
    } | null;
    lastDecision: {
      observedAt: string | null;
      quoteTime: string | null;
      policy: string | null;
      receiveToDecisionMs: string | null;
      contextFrame: string | null;
      contextBar: string | null;
      trend: string | null;
    } | null;
  };
  positions: PaperPosition[];
  orders: PaperOrder[];
  ordersComplete: boolean;
  fills?: PaperFill[];
  fillsComplete?: boolean;
  decisionHistory?: Record<string, Record<string, string>>;
  journal: JournalEvent[];
  journalComplete: boolean;
};

export function isTelemetry(value: unknown): value is PaperTelemetry {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return data.version === 1 &&
    typeof data.generatedAt === "string" &&
    data.source === "Dublin OCaml paper service" &&
    Array.isArray(data.positions) && Array.isArray(data.orders) &&
    Array.isArray(data.journal) &&
    typeof data.ordersComplete === "boolean" &&
    typeof data.journalComplete === "boolean";
}

export async function getTelemetry(): Promise<PaperTelemetry | null> {
  try {
    const blob = await get("telemetry/latest.json", {
      access: "private",
      // SOURCE: Vercel recommends useCache:false when a just-overwritten blob
      // must be observed immediately; the API response is separately cached.
      useCache: false,
    });
    if (!blob || blob.statusCode !== 200) return null;
    const data: unknown = await new Response(blob.stream).json();
    return isTelemetry(data) ? data : null;
  } catch {
    return null;
  }
}

import { getMarket } from "@/lib/market";
import { getTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";

export async function GET() {
  const [market, telemetry] = await Promise.all([getMarket(), getTelemetry()]);
  return Response.json({
    generatedAt: new Date().toISOString(),
    market,
    telemetry,
  }, {
    headers: {
      // GUESS: # UNCALIBRATED GUESS — 15s edge cache gives a usable monitor
      // without a private Blob origin read for every visitor refresh.
      "Cache-Control": "public, s-maxage=15, stale-while-revalidate=15",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

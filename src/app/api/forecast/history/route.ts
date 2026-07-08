import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import forecastHistory from "@/data/forecastHistory.json";

/**
 * Dev-mode mock endpoint backed by src/data/forecastHistory.json — edit that
 * file directly with real numbers. To use a real backend instead, set
 * NEXT_PUBLIC_API_BASE_URL (see .env.example) and this route is unused.
 */
export function GET(req: NextRequest) {
  const party = req.nextUrl.searchParams.get("party");
  const months = Number(req.nextUrl.searchParams.get("months") ?? 24);

  const latestDate = forecastHistory.reduce((max, r) => (r.runDate > max ? r.runDate : max), "0000-00-00");
  const cutoff = new Date(latestDate);
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let data = forecastHistory.filter((r) => r.runDate >= cutoffStr);
  if (party) data = data.filter((r) => r.partyCode === party);

  return NextResponse.json(data);
}

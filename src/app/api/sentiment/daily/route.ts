import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import sentimentDaily from "@/data/sentimentDaily.json";

/**
 * Dev-mode mock endpoint backed by src/data/sentimentDaily.json — edit that
 * file directly with real numbers. To use a real backend instead, set
 * NEXT_PUBLIC_API_BASE_URL (see .env.example) and this route is unused.
 */
export function GET(req: NextRequest) {
  const entityCode = req.nextUrl.searchParams.get("entity_code");
  const days = Number(req.nextUrl.searchParams.get("days") ?? 90);

  const latestDay = sentimentDaily.reduce((max, r) => (r.day > max ? r.day : max), "0000-00-00");
  const cutoff = new Date(latestDay);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let data = sentimentDaily.filter((r) => r.day >= cutoffStr);
  if (entityCode) data = data.filter((r) => r.entityCode === entityCode);
  return NextResponse.json(data);
}

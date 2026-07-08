import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import sentimentRegional from "@/data/sentimentRegional.json";

/**
 * Dev-mode mock endpoint backed by src/data/sentimentRegional.json — edit
 * that file directly with real numbers (add/remove regions and parties
 * freely). To use a real backend instead, set NEXT_PUBLIC_API_BASE_URL
 * (see .env.example) and this route is unused.
 */
export function GET(req: NextRequest) {
  const entityCode = req.nextUrl.searchParams.get("entity_code");
  const data = entityCode ? sentimentRegional.filter((r) => r.entityCode === entityCode) : sentimentRegional;
  return NextResponse.json(data);
}

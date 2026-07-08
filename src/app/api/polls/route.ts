import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import polls from "@/data/polls.json";

/**
 * Dev-mode mock endpoint backed by src/data/polls.json — edit that file
 * directly with real published polls. To use a real backend instead, set
 * NEXT_PUBLIC_API_BASE_URL (see .env.example) and this route is unused.
 */
export function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 20);
  return NextResponse.json(polls.slice(0, limit));
}

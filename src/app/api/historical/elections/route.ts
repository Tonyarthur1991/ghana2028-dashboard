import { NextResponse } from "next/server";
import historicalElections from "@/data/historicalElections.json";

/**
 * Dev-mode mock endpoint backed by src/data/historicalElections.json — edit
 * that file directly with certified results. To use a real backend instead,
 * set NEXT_PUBLIC_API_BASE_URL (see .env.example) and this route is unused.
 */
export function GET() {
  return NextResponse.json(historicalElections);
}

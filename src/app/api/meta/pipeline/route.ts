import { NextResponse } from "next/server";
import pipelineMeta from "@/data/pipelineMeta.json";

/**
 * Dev-mode mock endpoint backed by src/data/pipelineMeta.json — bump
 * dataAsOf there whenever you update the other mock data files, so "Last
 * updated" on the dashboard reflects the actual data, not the server clock.
 * To use a real backend instead, set NEXT_PUBLIC_API_BASE_URL (see
 * .env.example) and this route is unused.
 */
export function GET() {
  return NextResponse.json(pipelineMeta);
}

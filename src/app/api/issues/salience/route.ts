import { NextResponse } from "next/server";
import issuesSalience from "@/data/issuesSalience.json";

/**
 * Dev-mode mock endpoint backed by src/data/issuesSalience.json — edit that
 * file directly with real numbers. To use a real backend instead, set
 * NEXT_PUBLIC_API_BASE_URL (see .env.example) and this route is unused.
 */
export function GET() {
  return NextResponse.json(issuesSalience);
}

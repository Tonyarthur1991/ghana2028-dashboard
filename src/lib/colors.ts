import type { PartyCode, PartyMeta } from "./types";

/**
 * Single source of truth for party display metadata on the frontend.
 * Colours mirror config/gazetteer.yaml in the backend repo — keep in sync
 * manually if that file changes. Deliberately neutral (muted blue/orange/
 * grey), never the parties' real brand colours, per the spec's neutrality
 * constraint.
 */
export const PARTY_META: Record<PartyCode, PartyMeta> = {
  NDC: { code: "NDC", fullName: "National Democratic Congress", colourHex: "#5B9BD5" },
  NPP: { code: "NPP", fullName: "New Patriotic Party", colourHex: "#ED7D31" },
  CPP: { code: "CPP", fullName: "Convention People's Party", colourHex: "#A5A5A5" },
  GUM: { code: "GUM", fullName: "Ghana Union Movement", colourHex: "#A5A5A5" },
  PNC: { code: "PNC", fullName: "People's National Convention", colourHex: "#A5A5A5" },
  LPG: { code: "LPG", fullName: "Liberal Party of Ghana", colourHex: "#A5A5A5" },
  APC: { code: "APC", fullName: "All People's Congress", colourHex: "#A5A5A5" },
  PPP: { code: "PPP", fullName: "Progressive People's Party", colourHex: "#A5A5A5" },
};

export const MAJOR_PARTIES: PartyCode[] = ["NDC", "NPP"];

export function partyColour(code: string): string {
  return PARTY_META[code as PartyCode]?.colourHex ?? "#A5A5A5";
}

export function partyName(code: string): string {
  return PARTY_META[code as PartyCode]?.fullName ?? code;
}

/**
 * Sentiment polarity colour scale — intentionally a SEPARATE palette from
 * party colours (signal.positive / signal.negative in tailwind.config.ts)
 * so a reader never conflates "this party's colour" with "positive/negative
 * sentiment about them." Both pass WCAG AA contrast on white and dark-mode
 * surfaces.
 */
export function sentimentColour(score: number): string {
  if (score > 0.15) return "#2E7D5B"; // signal-positive
  if (score < -0.15) return "#B3492D"; // signal-negative
  return "#6B7280"; // neutral grey for near-zero sentiment
}

/**
 * Regional confidence -> visual treatment. Low-confidence regions are
 * rendered with reduced opacity + a hatch pattern class, never hidden
 * outright — the spec requires showing the caveat, not hiding the data.
 */
export function confidenceOpacity(confidence: "high" | "low" | "insufficient_data"): number {
  switch (confidence) {
    case "high":
      return 1;
    case "low":
      return 0.55;
    case "insufficient_data":
      return 0.25;
  }
}

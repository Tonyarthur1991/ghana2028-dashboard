#!/usr/bin/env node
/**
 * Builds the monthly GH2028 Watch report from src/data/*.json and emails it
 * via Gmail SMTP. Run manually with `node scripts/generate-report.mjs
 * --dry-run` to write report.html to disk instead of sending (no
 * credentials needed for a dry run). The GitHub Actions workflow at
 * .github/workflows/monthly-report.yml runs this for real on the 1st of
 * every month — see README §6 for the two secrets it needs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "src", "data");
const readJson = (name) => JSON.parse(readFileSync(path.join(dataDir, `${name}.json`), "utf-8"));

const forecastLatest = readJson("forecastLatest");
const forecastHistory = readJson("forecastHistory");
const sentimentDaily = readJson("sentimentDaily");
const sentimentRegional = readJson("sentimentRegional");
const issuesSalience = readJson("issuesSalience");
const polls = readJson("polls");
const pipelineMeta = readJson("pipelineMeta");

const MAJOR_PARTIES = ["NDC", "NPP"];
const PARTY_COLOUR = { NDC: "#5B9BD5", NPP: "#ED7D31" };
const fmt1 = (n) => n.toFixed(1);
const fmt2 = (n) => (n >= 0 ? "+" : "") + n.toFixed(2);

function previousMonthRow(partyCode) {
  const rows = forecastHistory.filter((r) => r.partyCode === partyCode).sort((a, b) => a.runDate.localeCompare(b.runDate));
  return rows.length >= 2 ? rows[rows.length - 2] : rows[rows.length - 1];
}

function volumeWeightedSentiment(partyCode, days = 7) {
  const rows = sentimentDaily
    .filter((r) => r.entityCode === partyCode)
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-days);
  const totalVolume = rows.reduce((sum, r) => sum + r.mentionVolume, 0);
  const weighted = rows.reduce((sum, r) => sum + r.weightedMeanSentiment * r.mentionVolume, 0);
  return { value: totalVolume ? weighted / totalVolume : 0, volume: totalVolume };
}

function buildForecastSection() {
  const ndc = forecastLatest.find((f) => f.partyCode === "NDC");
  const npp = forecastLatest.find((f) => f.partyCode === "NPP");
  const ndcPrev = previousMonthRow("NDC");
  const nppPrev = previousMonthRow("NPP");
  const ndcDelta = +(ndc.pointEstimatePct - ndcPrev.pointEstimatePct).toFixed(1);
  const nppDelta = +(npp.pointEstimatePct - nppPrev.pointEstimatePct).toFixed(1);
  const overlap = Math.max(0, Math.min(ndc.ciUpperPct, npp.ciUpperPct) - Math.max(ndc.ciLowerPct, npp.ciLowerPct));

  const gammaActive = ndc.issueGammaUsed !== 0 || npp.issueGammaUsed !== 0;
  const issueSentence = gammaActive
    ? ` The incumbency-weighted issue-accountability term is active this run: it moved NDC by ${fmt2(ndc.issueGammaUsed * ndc.issueAdjustmentInput)} points and NPP by ${fmt2(npp.issueGammaUsed * npp.issueAdjustmentInput)} points.`
    : " The incumbency-weighted issue-accountability term is tracked but inactive this run (gamma = 0, not yet backtested — see ghana2028forecast/forecasting/transfer_function.py).";

  const text = `NDC sits at ${fmt1(ndc.pointEstimatePct)}% (95% CI: ${fmt1(ndc.ciLowerPct)}–${fmt1(ndc.ciUpperPct)}%), ${ndcDelta >= 0 ? "up" : "down"} ${Math.abs(ndcDelta)} points from last month's ${fmt1(ndcPrev.pointEstimatePct)}%. NPP sits at ${fmt1(npp.pointEstimatePct)}% (95% CI: ${fmt1(npp.ciLowerPct)}–${fmt1(npp.ciUpperPct)}%), ${nppDelta >= 0 ? "up" : "down"} ${Math.abs(nppDelta)} points from last month's ${fmt1(nppPrev.pointEstimatePct)}%. The two intervals ${overlap > 0 ? `overlap by ${fmt1(overlap)} points at the tail` : "do not overlap"}. A move this size is noise against a credible interval this wide: read the point estimates as a snapshot, not a trend confirmation.${issueSentence}`;

  return { ndc, npp, ndcDelta, nppDelta, text };
}

function buildSentimentSection() {
  const ndc = volumeWeightedSentiment("NDC");
  const npp = volumeWeightedSentiment("NPP");
  const text = `NDC's net sentiment over the trailing 7 days is ${fmt2(ndc.value)}, volume-weighted across ${ndc.volume.toLocaleString()} mentions. NPP's is ${fmt2(npp.value)}, across ${npp.volume.toLocaleString()} mentions. ${ndc.volume >= npp.volume ? "NDC" : "NPP"} carries the higher mention volume, so its figure rests on the larger sample.`;
  return { ndc, npp, text };
}

function buildIssuesSection() {
  const top = [...issuesSalience].sort((a, b) => b.mentionVolume - a.mentionVolume).slice(0, 3);
  const [first, second, third] = top;
  const text = `${first.label} leads mention volume at ${first.mentionVolume.toLocaleString()} mentions, net sentiment ${fmt2(first.netSentiment)}, trend ${first.trendVsPriorPeriod}. ${second.label} follows at ${second.mentionVolume.toLocaleString()} mentions, net ${fmt2(second.netSentiment)}. ${third.label} sits at ${fmt2(third.netSentiment)} and is trending ${third.trendVsPriorPeriod}.`;
  return { top, text };
}

function buildRegionalSection() {
  const byRegion = new Map();
  for (const r of sentimentRegional) {
    const entry = byRegion.get(r.region) ?? { region: r.region, volume: 0, confidence: r.confidence };
    entry.volume += r.mentionVolume;
    byRegion.set(r.region, entry);
  }
  const topRegions = [...byRegion.values()].sort((a, b) => b.volume - a.volume).slice(0, 6).map((r) => r.region);
  const highConfidence = [...new Set(sentimentRegional.filter((r) => r.confidence === "high").map((r) => r.region))];
  const ndcTop = sentimentRegional.find((r) => r.region === topRegions[0] && r.entityCode === "NDC");
  const nppTop = sentimentRegional.find((r) => r.region === topRegions[0] && r.entityCode === "NPP");
  const text = `In ${topRegions[0]} (${ndcTop.confidence === "high" ? "high-confidence" : "low-confidence"} sample), NDC nets ${fmt2(ndcTop.weightedMeanSentiment)} against NPP's ${fmt2(nppTop.weightedMeanSentiment)}. Regions carrying a genuinely high-confidence sample this month: ${highConfidence.join(", ") || "none"}. Every other region is flagged low-confidence or insufficient-data; read those numbers as directional at best.`;
  return { topRegions, highConfidence, text };
}

function buildPollsSection() {
  const latest = [...polls].sort((a, b) => b.publishedDate.localeCompare(a.publishedDate));
  const latestDate = latest[0]?.publishedDate;
  const rows = latest.filter((p) => p.publishedDate === latestDate);
  const parts = rows.map((p) => `${p.partyCode} at ${fmt1(p.voteSharePct)}%`).join(", ");
  const sample = rows[0];
  const text = `The latest published poll (${sample.pollster}, fielded ${sample.fieldworkStart} to ${sample.fieldworkEnd}, published ${sample.publishedDate}) has ${parts}, sample size ${sample.sampleSize?.toLocaleString() ?? "n/a"}${sample.marginOfErrorPct ? `, margin of error ±${sample.marginOfErrorPct}` : ""}.`;
  return { text };
}

async function renderChart(chart, width, height) {
  const res = await fetch("https://quickchart.io/chart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chart, width, height, backgroundColor: "white", format: "png" }),
  });
  if (!res.ok) throw new Error(`QuickChart render failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function trendChartConfig() {
  const labels = [];
  const series = Object.fromEntries(MAJOR_PARTIES.flatMap((p) => [[`${p}_point`, []], [`${p}_lower`, []], [`${p}_upper`, []]]));
  const byDate = new Map();
  for (const row of forecastHistory) {
    if (!MAJOR_PARTIES.includes(row.partyCode)) continue;
    if (!byDate.has(row.runDate)) byDate.set(row.runDate, {});
    byDate.get(row.runDate)[row.partyCode] = row;
  }
  for (const [date, rows] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    labels.push(new Date(date).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }));
    for (const p of MAJOR_PARTIES) {
      series[`${p}_point`].push(rows[p]?.pointEstimatePct ?? null);
      series[`${p}_lower`].push(rows[p]?.ciLowerPct ?? null);
      series[`${p}_upper`].push(rows[p]?.ciUpperPct ?? null);
    }
  }
  const datasets = MAJOR_PARTIES.flatMap((p) => {
    const colour = PARTY_COLOUR[p];
    const rgba = colour === "#5B9BD5" ? "rgba(91,155,213,0.15)" : "rgba(237,125,49,0.15)";
    return [
      { label: `${p} upper CI`, data: series[`${p}_upper`], borderColor: "transparent", backgroundColor: rgba, fill: "+1", pointRadius: 0 },
      { label: `${p} lower CI`, data: series[`${p}_lower`], borderColor: "transparent", backgroundColor: rgba, fill: false, pointRadius: 0 },
      { label: p, data: series[`${p}_point`], borderColor: colour, backgroundColor: colour, fill: false, pointRadius: 2, borderWidth: 2.5 },
    ];
  });
  return { type: "line", data: { labels, datasets }, options: { scales: { y: { title: { display: true, text: "Projected vote share (%)" } } } } };
}

function issuesChartConfig(top) {
  const all = [...issuesSalience].sort((a, b) => b.mentionVolume - a.mentionVolume);
  return {
    type: "bar",
    data: {
      labels: all.map((i) => i.label),
      datasets: [{
        label: "Mention volume",
        data: all.map((i) => i.mentionVolume),
        backgroundColor: all.map((i) => (i.netSentiment >= 0 ? "#2E7D5B" : "#B3492D")),
      }],
    },
    options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: "Mention volume" } } } },
  };
}

function regionalChartConfig(topRegions) {
  const dataFor = (party) => topRegions.map((region) => sentimentRegional.find((r) => r.region === region && r.entityCode === party)?.weightedMeanSentiment ?? 0);
  return {
    type: "bar",
    data: {
      labels: topRegions,
      datasets: MAJOR_PARTIES.map((p) => ({ label: p, data: dataFor(p), backgroundColor: PARTY_COLOUR[p] })),
    },
    options: { scales: { y: { title: { display: true, text: "Net sentiment (-1 to 1)" } } } },
  };
}

function buildHtml({ forecast, sentiment, issues, regional, pollsText, images }) {
  return `<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 720px; margin: 0 auto; color: #111827; line-height: 1.55;">
  <div style="background: #B58900; color: #111827; font-size: 12px; font-weight: 600; padding: 6px 12px; text-align: center; letter-spacing: 0.03em;">
    ${pipelineMeta.environment.toUpperCase()} BUILD &mdash; internal monitoring view, not the public dashboard
  </div>
  <div style="padding: 24px 8px 8px;">
    <h1 style="font-size: 22px; margin: 0 0 4px;">GH2028 Watch &mdash; Monthly Report</h1>
    <p style="font-size: 13px; color: #4B5563; margin: 0 0 20px;">
      Forecast run: ${forecast.ndc.runDate} &middot; Model version ${pipelineMeta.modelVersion}
    </p>

    <h2 style="font-size: 16px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px;">Forecast</h2>
    <p>${forecast.text}</p>
    <img src="cid:chart-trend" alt="Forecast trend chart: NDC vs NPP with 95% credible interval bands" style="width: 100%; height: auto; margin: 12px 0;" />

    <h2 style="font-size: 16px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px; margin-top: 28px;">Sentiment</h2>
    <p>${sentiment.text}</p>

    <h2 style="font-size: 16px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px; margin-top: 28px;">Issues</h2>
    <p>${issues.text}</p>
    <img src="cid:chart-issues" alt="Issue salience bar chart" style="width: 100%; height: auto; margin: 12px 0;" />

    <h2 style="font-size: 16px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px; margin-top: 28px;">Regional</h2>
    <p>${regional.text}</p>
    <img src="cid:chart-regional" alt="Regional net sentiment bar chart" style="width: 100%; height: auto; margin: 12px 0;" />

    <h2 style="font-size: 16px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px; margin-top: 28px;">Polls</h2>
    <p>${pollsText}</p>

    <p style="margin-top: 28px; font-size: 13px; color: #4B5563;">
      This is a model-based estimate, not a guarantee, and it isn't affiliated with any party or campaign.
    </p>
    <p style="margin-top: 36px;">By: Dr Tony Arthur</p>
  </div>
</div>`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const forecast = buildForecastSection();
  const sentiment = buildSentimentSection();
  const issues = buildIssuesSection();
  const regional = buildRegionalSection();
  const { text: pollsText } = buildPollsSection();

  const [trendPng, issuesPng, regionalPng] = await Promise.all([
    renderChart(trendChartConfig(), 900, 450),
    renderChart(issuesChartConfig(issues.top), 900, 450),
    renderChart(regionalChartConfig(regional.topRegions), 900, 450),
  ]);

  const html = buildHtml({ forecast, sentiment, issues, regional, pollsText, images: true });
  const monthLabel = new Date(forecast.ndc.runDate).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const subject = `GH2028 Watch — Monthly Report, ${monthLabel}`;

  if (dryRun) {
    writeFileSync(path.join(__dirname, "..", "report.html"), html);
    writeFileSync(path.join(__dirname, "..", "report-trend.png"), trendPng);
    writeFileSync(path.join(__dirname, "..", "report-issues.png"), issuesPng);
    writeFileSync(path.join(__dirname, "..", "report-regional.png"), regionalPng);
    console.log("Dry run: wrote report.html and chart PNGs to the project root. No email sent.");
    return;
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const to = process.env.REPORT_RECIPIENT ?? user;
  if (!user || !pass) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD env vars are required to send (see README §6). Use --dry-run to preview without them.");
  }

  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transporter.sendMail({
    from: user,
    to,
    subject,
    html,
    attachments: [
      { filename: "forecast-trend.png", content: trendPng, cid: "chart-trend" },
      { filename: "issue-salience.png", content: issuesPng, cid: "chart-issues" },
      { filename: "regional-sentiment.png", content: regionalPng, cid: "chart-regional" },
    ],
  });
  console.log(`Sent monthly report to ${to}.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

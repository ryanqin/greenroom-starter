/**
 * Random-sample validation: pull N untouched rows from the DB and extract.
 * No ground truth — visual review + automated sanity checks.
 * Stricter than holdout because samples are NOT PM-curated for known patterns.
 *
 * Usage: npx tsx tools/extraction-eval/random-sample.ts [N]
 *   (default N = 20)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { extractDeal } from "./extract";
import type { ExtractedDeal } from "./schema";

// show_ids already used in samples.ts (10 training) + holdout.ts (9 holdout)
const SEEN = new Set([
  "show_0000", "show_0523", "show_0205", "show_0391", "show_0431",
  "show_0007", "show_0014", "show_coastal_spell_dispute", "show_0001", "show_0002",
  "show_0003", "show_0065", "show_0016", "show_0066", "show_0029",
  "show_0124", "show_0067", "show_0169", "show_0009",
]);

interface Sample {
  showId: string;
  dbDealType: string;
  prose: string;
}

interface SanityResult {
  flags: string[];
  warnings: string[];
}

function sanityCheck(sample: Sample, e: ExtractedDeal): SanityResult {
  const flags: string[] = [];
  const warnings: string[] = [];

  // Critical: dealType mismatch with DB (allow unknown as flag, not mismatch)
  if (e.dealType !== sample.dbDealType && e.dealType !== "unknown") {
    flags.push(`dealType: DB=${sample.dbDealType} vs LLM=${e.dealType}`);
  }
  if (e.dealType === "unknown") flags.push("dealType=unknown");

  // Numbers
  if (e.guarantee !== null && e.guarantee < 0) flags.push("negative guarantee");
  if (e.expenseCap !== null && e.expenseCap < 0) flags.push("negative expenseCap");
  if (e.percentage !== null && (e.percentage < 0 || e.percentage > 1.2)) {
    flags.push(`percentage out of range: ${e.percentage}`);
  }

  // Bonus shape
  for (const b of e.bonuses) {
    if (b.type === "walkout_pot" && b.threshold === null) {
      flags.push("walkout_pot missing threshold");
    }
    if (b.type === "gross_threshold" && (b.threshold === null || b.amount === null)) {
      flags.push("gross_threshold missing threshold/amount");
    }
    if (b.type === "tier_ratchet" && (!b.tiers || b.tiers.length < 2)) {
      flags.push("tier_ratchet missing tiers array (or only 1 tier)");
    }
  }

  // Deferred-to-email detection
  const proseLower = sample.prose.toLowerCase();
  if (
    proseLower.includes("see email") ||
    proseLower.includes("per the email") ||
    proseLower.includes("per the deal memo")
  ) {
    const hasDeferred = e.issues.some((i) => i.kind === "deferred_to_external");
    if (!hasDeferred) {
      warnings.push("prose defers to email but no deferred_to_external issue flagged");
    }
  }

  return { flags, warnings };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function fmt(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("✗ OPENAI_API_KEY not set in .env.local");
    process.exit(1);
  }

  const N = parseInt(process.argv[2] ?? "20", 10);

  console.log(`\n========== Random-Sample DB Validation ==========`);
  console.log(`Target N: ${N} untouched DB rows (not in samples.ts or holdout.ts)`);
  console.log(`Model:    gpt-4o-mini\n`);

  // Pull more than N to allow filtering SEEN out
  const dbUrl = process.env.DATABASE_URL ?? "file:./data/greenroom.db";
  const client = createClient({ url: dbUrl });

  // Pull 2N rows to have buffer for SEEN filtering
  const queryLimit = N * 2 + SEEN.size + 10;
  const res = await client.execute({
    sql: `SELECT show_id, deal_type, deal_notes_freetext FROM deals
          WHERE LENGTH(deal_notes_freetext) >= 50
          ORDER BY RANDOM()
          LIMIT ?`,
    args: [queryLimit],
  });

  const candidates: Sample[] = res.rows
    .map((r) => ({
      showId: String(r.show_id),
      dbDealType: String(r.deal_type),
      prose: String(r.deal_notes_freetext),
    }))
    .filter((s) => !SEEN.has(s.showId));

  const samples = candidates.slice(0, N);
  console.log(`Pulled ${samples.length} untouched samples (after SEEN filter)\n`);

  let totalIn = 0;
  let totalOut = 0;
  let cleanCount = 0;
  let flagCount = 0;
  let warnCount = 0;
  const issueKindCounts: Record<string, number> = {
    ambiguous_value: 0,
    deferred_to_external: 0,
    version_drift: 0,
    missing_context: 0,
  };
  const reports: {
    sample: Sample;
    extracted: ExtractedDeal;
    flags: string[];
    warnings: string[];
  }[] = [];

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const label = `[${i + 1}/${samples.length}] ${sample.showId.padEnd(22)}`;
    process.stdout.write(`${label} `);

    try {
      const { result, inputTokens, outputTokens } = await extractDeal(sample.prose);
      totalIn += inputTokens;
      totalOut += outputTokens;

      const { flags, warnings } = sanityCheck(sample, result);
      reports.push({ sample, extracted: result, flags, warnings });

      // Count issue kinds
      for (const issue of result.issues) {
        issueKindCounts[issue.kind] = (issueKindCounts[issue.kind] ?? 0) + 1;
      }

      if (flags.length === 0 && warnings.length === 0) {
        console.log("✓ clean");
        cleanCount++;
      } else if (flags.length > 0) {
        console.log(`✗ ${flags.length} flag(s): ${flags.join("; ")}`);
        flagCount++;
      } else {
        console.log(`⚠ ${warnings.length} warning(s): ${warnings.join("; ")}`);
        warnCount++;
      }
    } catch (err) {
      console.log(`✗ ERROR: ${(err as Error).message}`);
    }
  }

  // Summary
  console.log(`\n========== Summary ==========`);
  console.log(`${cleanCount} clean · ${warnCount} warn · ${flagCount} flagged`);
  console.log(`Issue kinds surfaced:`);
  for (const [k, v] of Object.entries(issueKindCounts)) {
    console.log(`  ${k.padEnd(22)} ${v}`);
  }
  const cost = (totalIn / 1_000_000) * 0.15 + (totalOut / 1_000_000) * 0.6;
  console.log(`Tokens: ${totalIn} in + ${totalOut} out  =  ~$${cost.toFixed(4)}`);

  // Per-sample details
  console.log(`\n========== Per-sample details ==========`);
  for (const r of reports) {
    const e = r.extracted;
    console.log(`\n--- ${r.sample.showId} (DB type: ${r.sample.dbDealType}) ---`);
    console.log(`  Prose:     ${truncate(r.sample.prose, 180)}`);
    console.log(
      `  Extracted: dealType=${e.dealType}  guarantee=${fmt(e.guarantee)}  pct=${fmt(e.percentage)}  basis=${fmt(e.percentageBasis)}`,
    );
    console.log(
      `             expenseCap=${fmt(e.expenseCap)}  hospCap=${fmt(e.hospitalityCap)}`,
    );
    if (e.bonuses.length > 0) {
      for (const b of e.bonuses) {
        console.log(
          `  Bonus:     ${b.type}  threshold=${fmt(b.threshold)}  amount=${fmt(b.amount)}  "${truncate(b.label, 60)}"`,
        );
      }
    }
    if (e.recoups.length > 0) {
      for (const rc of e.recoups) {
        console.log(
          `  Recoup:    ${rc.category}  $${rc.amount}  basis=${rc.basis}  "${truncate(rc.label, 60)}"`,
        );
      }
    }
    if (e.issues.length > 0) {
      console.log(`  Issues (${e.issues.length}):`);
      for (const i of e.issues) {
        console.log(`    [${i.kind}] field=${i.field || "(deal-level)"}`);
        console.log(`      ${truncate(i.message, 140)}`);
      }
    }
    if (e.metaNotes.length > 0) {
      console.log(`  MetaNotes (${e.metaNotes.length}):`);
      for (const m of e.metaNotes) console.log(`    - ${truncate(m, 140)}`);
    }
    if (r.flags.length > 0) {
      console.log(`  ✗ FLAGS:   ${r.flags.join("; ")}`);
    }
    if (r.warnings.length > 0) {
      console.log(`  ⚠ WARNS:   ${r.warnings.join("; ")}`);
    }
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

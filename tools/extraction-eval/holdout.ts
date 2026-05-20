/**
 * Hold-out validation: 9 samples NOT used during prompt iteration.
 * No ground truth — visual review + automated sanity checks.
 *
 * Usage: npx tsx tools/extraction-eval/holdout.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { extractDeal } from "./extract";
import type { ExtractedDeal } from "./schema";

interface HoldoutSample {
  id: string;
  showId: string;
  dbDealType: string;
  prose: string;
  noteworthy: string;
}

const HOLDOUT: HoldoutSample[] = [
  {
    id: "H01_FLAT",
    showId: "show_0003",
    dbDealType: "flat",
    prose: "Flat $1,016. No upside.",
    noteworthy: "Simplest case — sanity",
  },
  {
    id: "H02_FLAT_SELLOUT",
    showId: "show_0065",
    dbDealType: "flat",
    prose: "Flat $1,021 + $200 on sellout. No expenses.",
    noteworthy: "FLAT + sellout bonus type — sellout NOT in training",
  },
  {
    id: "H03_VS_GROSS_2BONUS",
    showId: "show_0016",
    dbDealType: "vs",
    prose:
      "$5,287 vs 90% of GROSS (no expense deductions), whichever greater. Hospitality cap $300. +$800 if gross > $21,000; +$800 if gross > $29,000.",
    noteworthy: "vs-of-GROSS basis (not net) + TWO gross_threshold bonuses",
  },
  {
    id: "H04_VS_GROSS",
    showId: "show_0066",
    dbDealType: "vs",
    prose:
      "$4,850 vs 85% of GROSS (no expense deductions), whichever greater. Hospitality cap $300.",
    noteworthy: "vs-of-GROSS basis",
  },
  {
    id: "H05_PCT_NET",
    showId: "show_0029",
    dbDealType: "percentage_of_net",
    prose: "85% of net after expenses. Expenses capped $900. No guarantee.",
    noteworthy: "Standard pct of net",
  },
  {
    id: "H06_PCT_NET",
    showId: "show_0124",
    dbDealType: "percentage_of_net",
    prose: "85% of net after expenses. Expenses capped $500. No guarantee.",
    noteworthy: "Standard pct of net",
  },
  {
    id: "H07_DOOR",
    showId: "show_0067",
    dbDealType: "door",
    prose:
      "Door deal. Artist gets ticket revenue minus expenses (capped $250). DIY/experimental tour.",
    noteworthy: "Standard door deal",
  },
  {
    id: "H08_PCT_GROSS_DEFERRED",
    showId: "show_0169",
    dbDealType: "percentage_of_gross",
    prose:
      "70% of gross. No expense deductions. Simple split deal. Sellout bonus per the email.",
    noteworthy: "Bonus DEFERRED to email — must NOT invent",
  },
  {
    id: "H09_VS_WALKOUT_SHORTHAND",
    showId: "show_0009",
    dbDealType: "vs",
    prose:
      "790 g'tee vs 85/15 net, walkout above breakeven. Expense cap 400, hosp $600. Walkout pot: 100% of gross above $900.",
    noteworthy: "Slang '85/15 net' + walkout pot",
  },
];

function sanityCheck(
  sample: HoldoutSample,
  e: ExtractedDeal,
): { flags: string[]; warnings: string[] } {
  const flags: string[] = [];
  const warnings: string[] = [];

  // Critical: dealType mismatch
  if (e.dealType !== sample.dbDealType && e.dealType !== "unknown") {
    flags.push(`dealType: DB=${sample.dbDealType} vs LLM=${e.dealType}`);
  }
  if (e.dealType === "unknown") flags.push("dealType=unknown");

  // Numbers
  if (e.guarantee !== null && e.guarantee < 0) flags.push("negative guarantee");
  if (e.expenseCap !== null && e.expenseCap < 0) flags.push("negative expenseCap");
  if (
    e.percentage !== null &&
    (e.percentage < 0 || e.percentage > 1.2)
  )
    flags.push(`percentage out of range: ${e.percentage}`);

  // Bonus shape
  for (const b of e.bonuses) {
    if (b.type === "walkout_pot" && b.threshold === null) {
      flags.push("walkout_pot missing threshold");
    }
    if (
      b.type === "gross_threshold" &&
      (b.threshold === null || b.amount === null)
    ) {
      flags.push("gross_threshold missing threshold/amount");
    }
    if (b.type === "tier_ratchet" && (!b.tiers || b.tiers.length < 2)) {
      flags.push("tier_ratchet missing tiers array (or only 1 tier)");
    }
  }

  // Soft warnings
  if (
    sample.prose.toLowerCase().includes("see email") ||
    sample.prose.toLowerCase().includes("per the email") ||
    sample.prose.toLowerCase().includes("per the deal memo")
  ) {
    // Should have an ambiguity entry
    if (e.ambiguities.length === 0) {
      warnings.push("prose defers to email but no ambiguity flagged");
    }
  }

  return { flags, warnings };
}

function fmt(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("✗ OPENAI_API_KEY not set in .env.local");
    process.exit(1);
  }

  console.log(`\n========== Hold-out Validation ==========`);
  console.log(`Samples: ${HOLDOUT.length} (not used during prompt iteration)`);
  console.log(`Model:   gpt-4o-mini\n`);

  let totalIn = 0;
  let totalOut = 0;
  let cleanCount = 0;
  let flagCount = 0;
  let warnCount = 0;
  const reports: {
    sample: HoldoutSample;
    extracted: ExtractedDeal;
    flags: string[];
    warnings: string[];
  }[] = [];

  for (const sample of HOLDOUT) {
    process.stdout.write(`Running ${sample.id.padEnd(28)} `);
    try {
      const { result, inputTokens, outputTokens } = await extractDeal(
        sample.prose,
      );
      totalIn += inputTokens;
      totalOut += outputTokens;

      const { flags, warnings } = sanityCheck(sample, result);
      reports.push({ sample, extracted: result, flags, warnings });

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
  console.log(
    `${cleanCount} clean · ${warnCount} warn · ${flagCount} flagged`,
  );
  const cost = (totalIn / 1_000_000) * 0.15 + (totalOut / 1_000_000) * 0.6;
  console.log(`Tokens: ${totalIn} in + ${totalOut} out  =  ~$${cost.toFixed(4)}`);

  // Per-sample details for visual review
  console.log(`\n========== Per-sample details ==========`);
  for (const r of reports) {
    const e = r.extracted;
    console.log(`\n--- ${r.sample.id} (${r.sample.showId}) ---`);
    console.log(`  Noteworthy: ${r.sample.noteworthy}`);
    console.log(`  Prose:      ${truncate(r.sample.prose, 180)}`);
    console.log(`  DB type:    ${r.sample.dbDealType}`);
    console.log(
      `  Extracted:  dealType=${e.dealType}  guarantee=${fmt(e.guarantee)}  pct=${fmt(e.percentage)}  basis=${fmt(e.percentageBasis)}`,
    );
    console.log(
      `              expenseCap=${fmt(e.expenseCap)}  hospCap=${fmt(e.hospitalityCap)}`,
    );
    if (e.bonuses.length > 0) {
      for (const b of e.bonuses) {
        console.log(
          `  Bonus:      ${b.type}  threshold=${fmt(b.threshold)}  amount=${fmt(b.amount)}  conf=${b.confidence}  "${truncate(b.label, 60)}"`,
        );
      }
    }
    if (e.recoups.length > 0) {
      for (const rc of e.recoups) {
        console.log(
          `  Recoup:     ${rc.category}  $${rc.amount}  basis=${rc.basis}  conf=${rc.confidence}  "${truncate(rc.label, 60)}"`,
        );
      }
    }
    if (e.ambiguities.length > 0) {
      console.log(`  Ambiguities (${e.ambiguities.length}):`);
      for (const a of e.ambiguities) console.log(`    - ${truncate(a, 140)}`);
    }
    if (e.metaNotes.length > 0) {
      console.log(`  MetaNotes (${e.metaNotes.length}):`);
      for (const m of e.metaNotes) console.log(`    - ${truncate(m, 140)}`);
    }
    console.log(`  Confidence: ${e.extractionConfidence}`);
    if (r.flags.length > 0) {
      console.log(`  ✗ FLAGS:    ${r.flags.join("; ")}`);
    }
    if (r.warnings.length > 0) {
      console.log(`  ⚠ WARNS:    ${r.warnings.join("; ")}`);
    }
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

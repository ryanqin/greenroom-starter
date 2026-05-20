import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { SAMPLES } from "./samples";
import { extractDeal } from "./extract";
import { evaluateCase, type CaseResult } from "./eval";

// gpt-4o-mini pricing (Aug 2024)
const PRICE_INPUT_PER_M = 0.15;
const PRICE_OUTPUT_PER_M = 0.6;

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "✗ OPENAI_API_KEY not set. Make sure .env.local exists at the starter repo root.",
    );
    process.exit(1);
  }

  console.log(`\n========== Deal Extraction Eval ==========`);
  console.log(`Model:   gpt-4o-mini`);
  console.log(`Samples: ${SAMPLES.length}\n`);

  const results: CaseResult[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const sample of SAMPLES) {
    process.stdout.write(`Running ${sample.id.padEnd(35)} `);
    try {
      const { result, inputTokens, outputTokens } = await extractDeal(
        sample.prose,
      );
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;

      const caseResult = evaluateCase(sample, result);
      results.push(caseResult);

      const sym =
        caseResult.overall === "PASS"
          ? "✓"
          : caseResult.overall === "PARTIAL"
            ? "~"
            : "✗";
      console.log(
        `${sym} ${caseResult.overall.padEnd(7)} (${caseResult.passCount}/${caseResult.totalCount})`,
      );
    } catch (err) {
      console.log(`✗ ERROR: ${(err as Error).message}`);
    }
  }

  // Summary
  console.log(`\n========== Summary ==========`);
  const pass = results.filter((r) => r.overall === "PASS").length;
  const partial = results.filter((r) => r.overall === "PARTIAL").length;
  const fail = results.filter((r) => r.overall === "FAIL").length;
  console.log(`${pass} PASS · ${partial} PARTIAL · ${fail} FAIL`);

  // Cost
  const cost =
    (totalInputTokens / 1_000_000) * PRICE_INPUT_PER_M +
    (totalOutputTokens / 1_000_000) * PRICE_OUTPUT_PER_M;
  console.log(
    `Tokens: ${totalInputTokens} in + ${totalOutputTokens} out  =  ~$${cost.toFixed(4)}`,
  );

  // Per-sample details for non-PASS
  const nonPass = results.filter((r) => r.overall !== "PASS");
  if (nonPass.length > 0) {
    console.log(`\n========== Non-PASS Details ==========\n`);
    for (const r of nonPass) {
      console.log(`--- ${r.id}: ${r.description} ---`);
      for (const fr of r.fieldResults) {
        if (!fr.pass) {
          console.log(`  ✗ ${fr.field}`);
          console.log(`    expected: ${JSON.stringify(fr.expected)}`);
          console.log(`    actual:   ${JSON.stringify(fr.actual)}`);
          if (fr.note) console.log(`    note:     ${fr.note}`);
        }
      }
      console.log("");
    }
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

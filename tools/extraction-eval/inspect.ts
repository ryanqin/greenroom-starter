/**
 * Inspect a single sample: print the prose + the full LLM extraction.
 * Usage:
 *   npx tsx tools/extraction-eval/inspect.ts <SAMPLE_ID>
 * Example:
 *   npx tsx tools/extraction-eval/inspect.ts S08_COASTAL_DISPUTE
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { SAMPLES } from "./samples";
import { extractDeal } from "./extract";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: tsx tools/extraction-eval/inspect.ts <SAMPLE_ID>");
    console.error("\nAvailable IDs:");
    for (const s of SAMPLES) console.error(`  ${s.id.padEnd(36)} ${s.description}`);
    process.exit(1);
  }

  const sample = SAMPLES.find((s) => s.id === id);
  if (!sample) {
    console.error(`Sample not found: ${id}`);
    console.error("\nAvailable IDs:");
    for (const s of SAMPLES) console.error(`  ${s.id}`);
    process.exit(1);
  }

  console.log("=".repeat(72));
  console.log(`Sample:      ${sample.id}`);
  console.log(`Description: ${sample.description}`);
  console.log(`Show ID:     ${sample.showId}`);
  console.log("=".repeat(72));
  console.log("\n--- PROSE (LLM input) ---");
  console.log(sample.prose);
  console.log("\n--- EXTRACTED (LLM output) ---");
  const { result, inputTokens, outputTokens } = await extractDeal(sample.prose);
  console.log(JSON.stringify(result, null, 2));
  console.log("\n--- TOKEN USAGE ---");
  console.log(`Input: ${inputTokens} | Output: ${outputTokens}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

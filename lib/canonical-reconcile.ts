/**
 * Cross-source drift detection — compare prose-extracted canonical against
 * the structured DB fields on the same deal. Drift is appended to the
 * extracted result's issues[] array as version_drift issues. Slice 1
 * component 2 (audit).
 *
 * The LLM only sees prose. The structured DB has fields that may have
 * drifted over time (e.g., bonus threshold updated by phone call but
 * structured field not updated). This function pairs the two sources and
 * surfaces disagreements as actionable issues the user must resolve.
 */

import type { Deal } from "@/db/schema";
import type { ExtractedDeal, Issue } from "@/tools/extraction-eval/schema";
import { parseBonuses } from "@/lib/dealMath";

const MONEY_TOLERANCE = 1;
const PCT_TOLERANCE = 0.01;

function fmtMoney(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

export function reconcileWithStructured(
  extracted: ExtractedDeal,
  deal: Deal,
): Issue[] {
  const drift: Issue[] = [];

  // dealType
  if (
    extracted.dealType !== "unknown" &&
    extracted.dealType !== deal.dealType
  ) {
    drift.push({
      kind: "version_drift",
      field: "dealType",
      message: `Prose reads as "${extracted.dealType}" but the structured field shows "${deal.dealType}". Which one is current?`,
      proseSnippet: null,
    });
  }

  // guarantee
  if (
    extracted.guarantee !== null &&
    deal.guaranteeAmount !== null &&
    Math.abs(extracted.guarantee - deal.guaranteeAmount) > MONEY_TOLERANCE
  ) {
    drift.push({
      kind: "version_drift",
      field: "guarantee",
      message: `Prose says guarantee is ${fmtMoney(extracted.guarantee)} but the structured field shows ${fmtMoney(deal.guaranteeAmount)}. Which one is current?`,
      proseSnippet: null,
    });
  }

  // percentage
  if (
    extracted.percentage !== null &&
    deal.percentage !== null &&
    Math.abs(extracted.percentage - deal.percentage) > PCT_TOLERANCE
  ) {
    drift.push({
      kind: "version_drift",
      field: "percentage",
      message: `Prose says ${fmtPct(extracted.percentage)} but the structured field shows ${fmtPct(deal.percentage)}. Which one is current?`,
      proseSnippet: null,
    });
  }

  // percentageBasis
  if (
    extracted.percentageBasis !== null &&
    deal.percentageBasis !== null &&
    extracted.percentageBasis !== deal.percentageBasis
  ) {
    drift.push({
      kind: "version_drift",
      field: "percentageBasis",
      message: `Prose reads as % of "${extracted.percentageBasis}" but the structured field shows % of "${deal.percentageBasis}". Which basis is current?`,
      proseSnippet: null,
    });
  }

  // expenseCap
  if (
    extracted.expenseCap !== null &&
    deal.expenseCap !== null &&
    Math.abs(extracted.expenseCap - deal.expenseCap) > MONEY_TOLERANCE
  ) {
    drift.push({
      kind: "version_drift",
      field: "expenseCap",
      message: `Prose says expense cap is ${fmtMoney(extracted.expenseCap)} but the structured field shows ${fmtMoney(deal.expenseCap)}. Which is current?`,
      proseSnippet: null,
    });
  }

  // hospitalityCap
  if (
    extracted.hospitalityCap !== null &&
    deal.hospitalityCap !== null &&
    Math.abs(extracted.hospitalityCap - deal.hospitalityCap) > MONEY_TOLERANCE
  ) {
    drift.push({
      kind: "version_drift",
      field: "hospitalityCap",
      message: `Prose says hospitality cap is ${fmtMoney(extracted.hospitalityCap)} but the structured field shows ${fmtMoney(deal.hospitalityCap)}. Which is current?`,
      proseSnippet: null,
    });
  }

  // Bonuses — match by type, compare threshold/amount, flag walkout_pot as
  // schema gap (DB cannot represent it).
  const dbBonuses = parseBonuses(deal);

  for (const eb of extracted.bonuses) {
    if (eb.type === "walkout_pot") {
      drift.push({
        kind: "version_drift",
        field: "bonuses (walkout pot)",
        message: `Prose mentions a walkout pot${eb.threshold !== null ? ` with threshold ${fmtMoney(eb.threshold)}` : ""}, but the structured DB schema does not support walkout_pot bonuses — this bonus exists only in prose and won't be applied by the in-app calculator.`,
        proseSnippet: null,
      });
      continue;
    }

    const dbMatch = dbBonuses.find((db) => db.type === eb.type);
    if (!dbMatch) {
      drift.push({
        kind: "version_drift",
        field: `bonuses (${eb.type})`,
        message: `Prose mentions a ${eb.type} bonus but the structured DB has no matching bonus of this type. Confirm whether prose is the source of truth.`,
        proseSnippet: null,
      });
      continue;
    }

    // Compare threshold (only types that have one)
    if (
      (eb.type === "gross_threshold" || eb.type === "attendance_threshold") &&
      eb.threshold !== null &&
      "threshold" in dbMatch &&
      Math.abs(eb.threshold - dbMatch.threshold) > MONEY_TOLERANCE
    ) {
      drift.push({
        kind: "version_drift",
        field: `${eb.type} threshold`,
        message: `Prose says ${eb.type} bonus triggers at ${fmtMoney(eb.threshold)} but structured field shows ${fmtMoney(dbMatch.threshold)}. Which is current?`,
        proseSnippet: null,
      });
    }

    // Compare amount (types that have one)
    if (
      (eb.type === "gross_threshold" ||
        eb.type === "sellout" ||
        eb.type === "attendance_threshold") &&
      eb.amount !== null &&
      "amount" in dbMatch &&
      Math.abs(eb.amount - dbMatch.amount) > MONEY_TOLERANCE
    ) {
      drift.push({
        kind: "version_drift",
        field: `${eb.type} amount`,
        message: `Prose says ${eb.type} bonus pays ${fmtMoney(eb.amount)} but structured field shows ${fmtMoney(dbMatch.amount)}. Which is current?`,
        proseSnippet: null,
      });
    }
  }

  return drift;
}

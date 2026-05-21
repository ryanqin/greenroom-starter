import type { ExtractedDeal, Bonus, Recoup } from "./schema";
import type { TestCase } from "./samples";

export interface FieldResult {
  field: string;
  pass: boolean;
  expected: unknown;
  actual: unknown;
  note?: string;
}

export interface CaseResult {
  id: string;
  description: string;
  fieldResults: FieldResult[];
  passCount: number;
  totalCount: number;
  overall: "PASS" | "PARTIAL" | "FAIL";
}

const NUM_TOLERANCE = 0.01;
const MONEY_TOLERANCE = 1;

function numClose(a: number | null, b: number | null, tol: number): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= tol;
}

/** Returns true if the list (joined) contains AT LEAST ONE of the keywords (case-insensitive). */
function listIncludesAnyKeyword(list: string[], keywords: string[]): boolean {
  const joined = list.join(" | ").toLowerCase();
  return keywords.some((kw) => joined.includes(kw.toLowerCase()));
}

function bonusEquals(a: Bonus, b: Bonus): boolean {
  if (a.type !== b.type) return false;
  // tier_ratchet stores info in `tiers`, not threshold/amount.
  // Looser check: same type + at least 1 tier present.
  if (a.type === "tier_ratchet") {
    return (a.tiers?.length ?? 0) >= 1 && (b.tiers?.length ?? 0) >= 1;
  }
  if (!numClose(a.threshold, b.threshold, MONEY_TOLERANCE)) return false;
  if (!numClose(a.amount, b.amount, MONEY_TOLERANCE)) return false;
  return true;
}

function recoupEquals(a: Recoup, b: Recoup): boolean {
  return (
    a.category === b.category &&
    numClose(a.amount, b.amount, MONEY_TOLERANCE) &&
    a.basis === b.basis
  );
}

export function evaluateCase(
  testCase: TestCase,
  actual: ExtractedDeal,
): CaseResult {
  const expected = testCase.expected;
  const fr: FieldResult[] = [];

  fr.push({
    field: "dealType",
    pass: actual.dealType === expected.dealType,
    expected: expected.dealType,
    actual: actual.dealType,
  });
  fr.push({
    field: "guarantee",
    pass: numClose(actual.guarantee, expected.guarantee, MONEY_TOLERANCE),
    expected: expected.guarantee,
    actual: actual.guarantee,
  });
  fr.push({
    field: "percentage",
    pass: numClose(actual.percentage, expected.percentage, NUM_TOLERANCE),
    expected: expected.percentage,
    actual: actual.percentage,
  });
  fr.push({
    field: "percentageBasis",
    pass: actual.percentageBasis === expected.percentageBasis,
    expected: expected.percentageBasis,
    actual: actual.percentageBasis,
  });
  fr.push({
    field: "expenseCap",
    pass: numClose(actual.expenseCap, expected.expenseCap, MONEY_TOLERANCE),
    expected: expected.expenseCap,
    actual: actual.expenseCap,
  });
  fr.push({
    field: "hospitalityCap",
    pass: numClose(actual.hospitalityCap, expected.hospitalityCap, MONEY_TOLERANCE),
    expected: expected.hospitalityCap,
    actual: actual.hospitalityCap,
  });

  // Bonuses (count + content)
  const bonusCountMatch = actual.bonuses.length === expected.bonuses.length;
  let bonusContentMatch = true;
  if (bonusCountMatch) {
    for (const eb of expected.bonuses) {
      if (!actual.bonuses.some((ab) => bonusEquals(ab, eb))) {
        bonusContentMatch = false;
        break;
      }
    }
  }
  fr.push({
    field: "bonuses",
    pass: bonusCountMatch && bonusContentMatch,
    expected: expected.bonuses,
    actual: actual.bonuses,
    note: !bonusCountMatch
      ? `count mismatch: expected ${expected.bonuses.length}, got ${actual.bonuses.length}`
      : !bonusContentMatch
        ? "content mismatch (type / threshold / amount)"
        : undefined,
  });

  // Recoups
  const recoupCountMatch = actual.recoups.length === expected.recoups.length;
  let recoupContentMatch = true;
  if (recoupCountMatch) {
    for (const er of expected.recoups) {
      if (!actual.recoups.some((ar) => recoupEquals(ar, er))) {
        recoupContentMatch = false;
        break;
      }
    }
  }
  fr.push({
    field: "recoups",
    pass: recoupCountMatch && recoupContentMatch,
    expected: expected.recoups,
    actual: actual.recoups,
    note: !recoupCountMatch
      ? `count mismatch: expected ${expected.recoups.length}, got ${actual.recoups.length}`
      : !recoupContentMatch
        ? "content mismatch (category / amount / basis)"
        : undefined,
  });

  // Soft: expected issues — for each, must exist actual issue with same kind
  // whose message contains at least one expected keyword.
  if (testCase.expectedIssues) {
    for (const exp of testCase.expectedIssues) {
      const candidates = actual.issues.filter((i) => i.kind === exp.kind);
      const found = candidates.find((i) =>
        exp.keywords.some((kw) =>
          i.message.toLowerCase().includes(kw.toLowerCase()),
        ),
      );
      fr.push({
        field: `issues (kind=${exp.kind})`,
        pass: !!found,
        expected: exp.keywords,
        actual: candidates.map((i) => i.message),
        note: candidates.length === 0
          ? `no actual issue with kind=${exp.kind}`
          : !found
            ? `kind matched but no message contains any of ${exp.keywords.join(", ")}`
            : undefined,
      });
    }
  }

  // Soft: meta-note keyword check
  if (testCase.expectedMetaNoteKeywords) {
    fr.push({
      field: "metaNotes (keywords)",
      pass: listIncludesAnyKeyword(
        actual.metaNotes,
        testCase.expectedMetaNoteKeywords,
      ),
      expected: testCase.expectedMetaNoteKeywords,
      actual: actual.metaNotes,
    });
  }

  const passCount = fr.filter((r) => r.pass).length;
  const totalCount = fr.length;
  const overall: "PASS" | "PARTIAL" | "FAIL" =
    passCount === totalCount
      ? "PASS"
      : passCount > totalCount * 0.7
        ? "PARTIAL"
        : "FAIL";

  return {
    id: testCase.id,
    description: testCase.description,
    fieldResults: fr,
    passCount,
    totalCount,
    overall,
  };
}

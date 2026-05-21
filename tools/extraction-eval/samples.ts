import type { ExtractedDeal, IssueKind } from "./schema";

export interface ExpectedIssue {
  kind: IssueKind;
  keywords: string[]; // message must contain at least one
}

export interface TestCase {
  id: string;
  showId: string;
  description: string;
  prose: string;
  expected: ExtractedDeal;
  expectedIssues?: ExpectedIssue[];
  expectedMetaNoteKeywords?: string[];
}

export const SAMPLES: TestCase[] = [
  {
    id: "S01_FLAT_SIMPLE",
    showId: "show_0000",
    description: "Simple flat deal, no bonuses, no issues",
    prose: "Flat $2,332. No upside.",
    expected: {
      dealType: "flat",
      guarantee: 2332,
      percentage: null,
      percentageBasis: null,
      expenseCap: null,
      hospitalityCap: null,
      bonuses: [],
      recoups: [],
      issues: [],
      metaNotes: [],
    },
  },
  {
    id: "S02_PCT_GROSS",
    showId: "show_0523",
    description: "Simple % of gross, no expenses, no issues",
    prose: "75% of gross. No expense deductions. Simple split deal.",
    expected: {
      dealType: "percentage_of_gross",
      guarantee: null,
      percentage: 0.75,
      percentageBasis: "gross",
      expenseCap: null,
      hospitalityCap: null,
      bonuses: [],
      recoups: [],
      issues: [],
      metaNotes: [],
    },
  },
  {
    id: "S03_PCT_NET",
    showId: "show_0205",
    description: "Simple % of net with cap, no issues",
    prose: "90% of net after expenses. Expenses capped $2350. No guarantee.",
    expected: {
      dealType: "percentage_of_net",
      guarantee: null,
      percentage: 0.9,
      percentageBasis: "net",
      expenseCap: 2350,
      hospitalityCap: null,
      bonuses: [],
      recoups: [],
      issues: [],
      metaNotes: [],
    },
  },
  {
    id: "S04_DOOR",
    showId: "show_0391",
    description: "Door deal — artist takes door revenue minus expenses",
    prose:
      "Door deal. Artist gets ticket revenue minus expenses (capped $200). DIY/experimental tour.",
    expected: {
      dealType: "door",
      guarantee: null,
      percentage: 1.0,
      percentageBasis: "net",
      expenseCap: 200,
      hospitalityCap: null,
      bonuses: [],
      recoups: [],
      issues: [],
      metaNotes: [],
    },
  },
  {
    id: "S05_VS_BASIC",
    showId: "show_0431",
    description: "Standard vs deal, full structure, no issues",
    prose:
      "$4,760 guarantee vs 85% of net after expenses, whichever greater. Expenses capped $2400. Hospitality cap $500.",
    expected: {
      dealType: "vs",
      guarantee: 4760,
      percentage: 0.85,
      percentageBasis: "net",
      expenseCap: 2400,
      hospitalityCap: 500,
      bonuses: [],
      recoups: [],
      issues: [],
      metaNotes: [],
    },
  },
  {
    id: "S06_VS_WALKOUT_AND_VERSION_DRIFT",
    showId: "show_0007",
    description:
      "Vs with walkout pot + gross threshold bonus + version drift annotation (LLM should extract updated value AND surface version_drift issue)",
    prose:
      "$2,631 vs 90% net + walkout pot. After breakeven on guarantee + expenses, all incremental gross goes to artist. Hospitality cap $400. +$400 if gross > $11,000; Walkout pot: 100% of gross above $3,200. [Updated 4 days before show via phone call with agent: bonus threshold dropped to $6,000. Note: structured field still reflects original $11,000 — confirm before settlement.]",
    expected: {
      dealType: "vs",
      guarantee: 2631,
      percentage: 0.9,
      percentageBasis: "net",
      expenseCap: null,
      hospitalityCap: 400,
      bonuses: [
        {
          type: "gross_threshold",
          label: "+$400 if gross > $6,000 (updated from $11,000)",
          threshold: 6000,
          amount: 400,
          tiers: null,
        },
        {
          type: "walkout_pot",
          label: "100% of gross above $3,200",
          threshold: 3200,
          amount: null,
          tiers: null,
        },
      ],
      recoups: [],
      issues: [
        {
          kind: "version_drift",
          field: "bonus threshold",
          message:
            "Bonus threshold was updated from $11,000 to $6,000 four days before show via phone call. Prose warns the structured DB field may still show the original $11,000 — confirm before settlement.",
          proseSnippet:
            "[Updated 4 days before show via phone call with agent: bonus threshold dropped to $6,000. Note: structured field still reflects original $11,000 — confirm before settlement.]",
        },
      ],
      metaNotes: [],
    },
    expectedIssues: [
      { kind: "version_drift", keywords: ["6,000", "11,000", "phone"] },
    ],
  },
  {
    id: "S07_RATCHET",
    showId: "show_0014",
    description: "Vs deal with tier ratchet (escalator vocab — LLM should normalize, no issues)",
    prose:
      "7,138 g'tee with escalator: 70% net at base, ratchets to 80% over 80% capacity. Expenses to 3550.",
    expected: {
      dealType: "vs",
      guarantee: 7138,
      percentage: 0.7,
      percentageBasis: "net",
      expenseCap: 3550,
      hospitalityCap: null,
      bonuses: [
        {
          type: "tier_ratchet",
          label: "70% to 80% over 80% capacity",
          threshold: null,
          amount: null,
          tiers: [
            { from: 0, to: 0.8, percentage: 0.7 },
            { from: 0.8, to: null, percentage: 0.8 },
          ],
        },
      ],
      recoups: [],
      issues: [],
      metaNotes: [],
    },
  },
  {
    id: "S08_COASTAL_DISPUTE",
    showId: "show_coastal_spell_dispute",
    description:
      "Showcase: vs + gross threshold + ambiguous marketing recoup + WME dispute history (LLM must surface ambiguous_value issue on recoup basis AND keep $720 concession as metaNote)",
    prose:
      "$5,000 vs 80% of net after expenses, whichever greater. Expenses capped $2,500. Hospitality cap $500. +$1,000 bonus over $25k gross. Marketing recoup of $900 against gross. (Note added 3/19/25: this deal email was ambiguous — recoup interpretation disputed by WME, resolved with $720 concession.)",
    expected: {
      dealType: "vs",
      guarantee: 5000,
      percentage: 0.8,
      percentageBasis: "net",
      expenseCap: 2500,
      hospitalityCap: 500,
      bonuses: [
        {
          type: "gross_threshold",
          label: "+$1,000 bonus over $25k gross",
          threshold: 25000,
          amount: 1000,
          tiers: null,
        },
      ],
      recoups: [
        {
          category: "marketing",
          label: "Marketing recoup of $900 against gross",
          amount: 900,
          basis: "ambiguous",
        },
      ],
      issues: [
        {
          kind: "ambiguous_value",
          field: "marketing recoup basis",
          message:
            "Prose writes 'against gross' but the inline note says the deal email was ambiguous and WME disputed the basis interpretation. Confirm whether basis should be gross, net, or stays ambiguous.",
          proseSnippet:
            "Marketing recoup of $900 against gross. (Note added 3/19/25: this deal email was ambiguous — recoup interpretation disputed by WME, resolved with $720 concession.)",
        },
      ],
      metaNotes: [
        "3/19/25: WME disputed recoup interpretation; resolved with $720 concession",
      ],
    },
    expectedIssues: [
      { kind: "ambiguous_value", keywords: ["WME", "dispute", "basis"] },
    ],
    expectedMetaNoteKeywords: ["$720", "concession"],
  },
  {
    id: "S09_RENEGOTIATED",
    showId: "show_0001",
    description:
      "Vs in prose + renegotiation history note (history is contextual, NOT an actionable issue)",
    prose:
      "$3,500 guarantee vs 85% of net after expenses, whichever greater. Renegotiated up from %-only deal three weeks before show — agent insisted on a floor. Expense cap $550, hospitality $300.",
    expected: {
      dealType: "vs",
      guarantee: 3500,
      percentage: 0.85,
      percentageBasis: "net",
      expenseCap: 550,
      hospitalityCap: 300,
      bonuses: [],
      recoups: [],
      issues: [],
      metaNotes: [
        "Renegotiated up from %-only deal three weeks before show — agent insisted on a floor",
      ],
    },
    expectedMetaNoteKeywords: ["renegotiated", "floor"],
  },
  {
    id: "S10_DEFERS_EMAIL",
    showId: "show_0002",
    description:
      "Vs deal that defers bonuses to email — LLM must NOT invent bonuses, must surface deferred_to_external issue",
    prose:
      "$1,405 guarantee vs 90% of net after expenses, whichever greater. Expenses capped $700. Hospitality cap $400. Performance bonuses per the deal memo (see email thread).",
    expected: {
      dealType: "vs",
      guarantee: 1405,
      percentage: 0.9,
      percentageBasis: "net",
      expenseCap: 700,
      hospitalityCap: 400,
      bonuses: [],
      recoups: [],
      issues: [
        {
          kind: "deferred_to_external",
          field: "bonuses",
          message:
            "Performance bonuses are referenced but not stated in prose — content lives in the deal memo / email thread.",
          proseSnippet: "Performance bonuses per the deal memo (see email thread)",
        },
      ],
      metaNotes: [],
    },
    expectedIssues: [
      { kind: "deferred_to_external", keywords: ["bonus", "email", "memo"] },
    ],
  },
];

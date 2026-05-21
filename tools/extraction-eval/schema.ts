/**
 * Schema for canonical deal extraction.
 * Used by both the LLM (as JSON schema for OpenAI structured outputs)
 * and our TypeScript layer (compile-time safety).
 */

export type DealType =
  | "flat"
  | "percentage_of_gross"
  | "percentage_of_net"
  | "vs"
  | "door"
  | "unknown";

export type BonusType =
  | "gross_threshold"
  | "sellout"
  | "attendance_threshold"
  | "tier_ratchet"
  | "walkout_pot";

export interface Bonus {
  type: BonusType;
  label: string;
  threshold: number | null;
  amount: number | null;
  tiers: { from: number; to: number | null; percentage: number }[] | null;
}

export interface Recoup {
  category: string;
  label: string;
  amount: number;
  basis: "gross" | "expense_cap" | "ambiguous";
}

export type IssueKind =
  | "ambiguous_value"
  | "deferred_to_external"
  | "version_drift"
  | "missing_context";

export interface Issue {
  kind: IssueKind;
  field: string;
  message: string;
  proseSnippet: string | null;
}

export interface ExtractedDeal {
  dealType: DealType;
  guarantee: number | null;
  percentage: number | null;
  percentageBasis: "gross" | "net" | null;
  expenseCap: number | null;
  hospitalityCap: number | null;
  bonuses: Bonus[];
  recoups: Recoup[];
  issues: Issue[];
  metaNotes: string[];
}

/** JSON schema for OpenAI structured outputs (strict mode). */
export const DEAL_JSON_SCHEMA = {
  type: "object",
  properties: {
    dealType: {
      type: "string",
      enum: [
        "flat",
        "percentage_of_gross",
        "percentage_of_net",
        "vs",
        "door",
        "unknown",
      ],
    },
    guarantee: { type: ["number", "null"] },
    percentage: { type: ["number", "null"] },
    percentageBasis: {
      type: ["string", "null"],
      enum: ["gross", "net", null],
    },
    expenseCap: { type: ["number", "null"] },
    hospitalityCap: { type: ["number", "null"] },
    bonuses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "gross_threshold",
              "sellout",
              "attendance_threshold",
              "tier_ratchet",
              "walkout_pot",
            ],
          },
          label: { type: "string" },
          threshold: { type: ["number", "null"] },
          amount: { type: ["number", "null"] },
          tiers: {
            type: ["array", "null"],
            items: {
              type: "object",
              properties: {
                from: { type: "number" },
                to: { type: ["number", "null"] },
                percentage: { type: "number" },
              },
              required: ["from", "to", "percentage"],
              additionalProperties: false,
            },
          },
        },
        required: ["type", "label", "threshold", "amount", "tiers"],
        additionalProperties: false,
      },
    },
    recoups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string" },
          label: { type: "string" },
          amount: { type: "number" },
          basis: { type: "string", enum: ["gross", "expense_cap", "ambiguous"] },
        },
        required: ["category", "label", "amount", "basis"],
        additionalProperties: false,
      },
    },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: [
              "ambiguous_value",
              "deferred_to_external",
              "version_drift",
              "missing_context",
            ],
          },
          field: { type: "string" },
          message: { type: "string" },
          proseSnippet: { type: ["string", "null"] },
        },
        required: ["kind", "field", "message", "proseSnippet"],
        additionalProperties: false,
      },
    },
    metaNotes: { type: "array", items: { type: "string" } },
  },
  required: [
    "dealType",
    "guarantee",
    "percentage",
    "percentageBasis",
    "expenseCap",
    "hospitalityCap",
    "bonuses",
    "recoups",
    "issues",
    "metaNotes",
  ],
  additionalProperties: false,
} as const;

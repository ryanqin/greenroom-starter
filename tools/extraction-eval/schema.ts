/**
 * Schema for canonical deal extraction.
 * Used by both the LLM (as JSON schema for OpenAI structured outputs)
 * and our TypeScript layer (compile-time safety).
 */

export type Confidence = "clear" | "needs_eyes" | "unresolved";

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
  confidence: Confidence;
}

export interface Recoup {
  category: string;
  label: string;
  amount: number;
  basis: "gross" | "expense_cap" | "ambiguous";
  confidence: Confidence;
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
  ambiguities: string[];
  metaNotes: string[];
  extractionConfidence: "high" | "medium" | "low" | "rejected";
  rejectionReason: string | null;
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
          confidence: {
            type: "string",
            enum: ["clear", "needs_eyes", "unresolved"],
          },
        },
        required: ["type", "label", "threshold", "amount", "tiers", "confidence"],
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
          confidence: {
            type: "string",
            enum: ["clear", "needs_eyes", "unresolved"],
          },
        },
        required: ["category", "label", "amount", "basis", "confidence"],
        additionalProperties: false,
      },
    },
    ambiguities: { type: "array", items: { type: "string" } },
    metaNotes: { type: "array", items: { type: "string" } },
    extractionConfidence: {
      type: "string",
      enum: ["high", "medium", "low", "rejected"],
    },
    rejectionReason: { type: ["string", "null"] },
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
    "ambiguities",
    "metaNotes",
    "extractionConfidence",
    "rejectionReason",
  ],
  additionalProperties: false,
} as const;

/**
 * Deal calculation logic for the in-app settlement tool.
 *
 * Slice 1 extension: vs / percentage_of_net / door deals are now supported.
 * This closes the 62% gap that previously sent The Crescent's settlement
 * back to spreadsheets.
 *
 * Supported:
 *   1. flat                 — $X guaranteed, optional sellout bonus
 *   2. percentage_of_gross  — X% of gross, no expense deductions
 *   3. percentage_of_net    — X% of (gross - capped expenses)
 *   4. vs                   — max(guarantee, percentage × net_after_expenses)
 *   5. door                 — artist takes 100% of net_after_expenses
 *
 * For all five, it reads `bonusesJson` and applies bonuses where it can.
 * Bonuses that exist only in `dealNotesFreetext` are visible to the LLM
 * extractor but are not yet wired into this engine (next phase: canonical
 * extraction can replace bonusesJson as the source of truth).
 *
 * Recoups still flow separately through the settlement record. Tier ratchets
 * are recognized but not yet applied (next phase: ratchet evaluation against
 * capacity sold). Walkout pot is a canonical-only bonus type (DB schema
 * cannot represent it) and is not applied in the in-app calculator yet.
 */

import type { Deal, Expense, TicketSale, Bonus } from "@/db/schema";

export type SettlementCalculation =
  | {
      supported: true;
      grossBoxOffice: number;
      netBoxOffice: number;
      totalExpenses: number;
      totalToArtist: number;
      steps: { label: string; value: number; note?: string }[];
      finalFormula: string;
      // Bonuses that were applied. Empty array if no bonuses on the deal,
      // or if no bonuses triggered.
      bonusesApplied: { label: string; amount: number; reason: string }[];
      // Bonuses that exist on the deal but didn't trigger (helpful context).
      bonusesNotTriggered: { label: string; amount: number; reason: string }[];
    }
  | {
      supported: false;
      reason: string;
      dealType: Deal["dealType"];
    };

interface CalcInput {
  deal: Deal;
  ticketSales: TicketSale[];
  expenses: Expense[];
  // Capacity is needed to evaluate sellout bonuses. Optional — if omitted,
  // sellout bonuses are reported as "can't determine".
  venueCapacity?: number;
  ticketsSold?: number;
}

export function parseBonuses(deal: Deal): Bonus[] {
  if (!deal.bonusesJson) return [];
  try {
    const parsed = JSON.parse(deal.bonusesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function calculateSettlement(input: CalcInput): SettlementCalculation {
  const { deal, ticketSales, expenses, venueCapacity, ticketsSold } = input;

  const grossBoxOffice = ticketSales.reduce((sum, t) => sum + t.gross, 0);
  const totalFees = ticketSales.reduce((sum, t) => sum + t.fees, 0);
  const netBoxOffice = grossBoxOffice - totalFees;
  const totalExpenses = expenses
    .filter((e) => !e.absorbedByVenue)
    .reduce((sum, e) => sum + e.amount, 0);

  const tickets =
    ticketsSold ?? ticketSales.reduce((sum, t) => sum + (t.qty ?? 0), 0);

  // ---------- flat guarantee ----------
  if (deal.dealType === "flat") {
    if (deal.guaranteeAmount == null) {
      return {
        supported: false,
        reason: "Flat deal is missing a guarantee amount.",
        dealType: deal.dealType,
      };
    }
    const bonusResult = applyBonuses(parseBonuses(deal), {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist: deal.guaranteeAmount + bonusResult.totalApplied,
      steps: [
        {
          label: "Flat guarantee",
          value: deal.guaranteeAmount,
          note: "No expense deductions. The guarantee is the floor.",
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          note: b.reason,
        })),
      ],
      finalFormula: bonusResult.applied.length
        ? `flat ${deal.guaranteeAmount} + bonuses ${bonusResult.totalApplied} = ${(deal.guaranteeAmount + bonusResult.totalApplied).toFixed(2)}`
        : `flat guarantee = ${deal.guaranteeAmount}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
    };
  }

  // ---------- percentage of gross ----------
  if (deal.dealType === "percentage_of_gross") {
    if (deal.percentage == null) {
      return {
        supported: false,
        reason: "Percentage-of-gross deal is missing a percentage.",
        dealType: deal.dealType,
      };
    }
    const payout = grossBoxOffice * deal.percentage;
    const bonusResult = applyBonuses(parseBonuses(deal), {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist: payout + bonusResult.totalApplied,
      steps: [
        { label: "Gross box office", value: grossBoxOffice },
        {
          label: `× ${(deal.percentage * 100).toFixed(0)}%`,
          value: payout,
          note: "Percentage of gross — no expense deductions.",
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          note: b.reason,
        })),
      ],
      finalFormula: bonusResult.applied.length
        ? `gross × ${deal.percentage} + bonuses = ${(payout + bonusResult.totalApplied).toFixed(2)}`
        : `gross × ${deal.percentage} = ${payout.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
    };
  }

  // Effective deductible expenses, after expense cap if any.
  const cappedExpenses =
    deal.expenseCap !== null && deal.expenseCap < totalExpenses
      ? deal.expenseCap
      : totalExpenses;
  const expensesStepLabel =
    deal.expenseCap !== null && totalExpenses > deal.expenseCap
      ? `Less: expenses (capped at ${deal.expenseCap.toLocaleString()})`
      : "Less: expenses";
  const expensesStepNote =
    deal.expenseCap !== null && totalExpenses > deal.expenseCap
      ? `Actual expenses ${totalExpenses.toLocaleString()} reduced to cap`
      : undefined;
  const netAfterExpenses = Math.max(0, grossBoxOffice - cappedExpenses);

  // ---------- percentage_of_net ----------
  if (deal.dealType === "percentage_of_net") {
    if (deal.percentage == null) {
      return {
        supported: false,
        reason: "Percentage-of-net deal is missing a percentage.",
        dealType: deal.dealType,
      };
    }
    const payout = netAfterExpenses * deal.percentage;
    const bonusResult = applyBonuses(parseBonuses(deal), {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist: payout + bonusResult.totalApplied,
      steps: [
        { label: "Gross box office", value: grossBoxOffice },
        { label: expensesStepLabel, value: -cappedExpenses, note: expensesStepNote },
        { label: "Net after expenses", value: netAfterExpenses },
        {
          label: `× ${(deal.percentage * 100).toFixed(0)}%`,
          value: payout,
          note: "Percentage of net.",
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          note: b.reason,
        })),
      ],
      finalFormula: bonusResult.applied.length
        ? `(gross - expenses) × ${deal.percentage} + bonuses = ${(payout + bonusResult.totalApplied).toFixed(2)}`
        : `(gross - expenses) × ${deal.percentage} = ${payout.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
    };
  }

  // ---------- vs (guarantee vs % of net, whichever greater) ----------
  if (deal.dealType === "vs") {
    if (deal.guaranteeAmount == null || deal.percentage == null) {
      return {
        supported: false,
        reason: "Vs deal needs both a guarantee and a percentage.",
        dealType: deal.dealType,
      };
    }
    const percentagePayout = netAfterExpenses * deal.percentage;
    const guaranteeWins = deal.guaranteeAmount >= percentagePayout;
    const baseDealAmount = Math.max(deal.guaranteeAmount, percentagePayout);
    const bonusResult = applyBonuses(parseBonuses(deal), {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist: baseDealAmount + bonusResult.totalApplied,
      steps: [
        { label: "Gross box office", value: grossBoxOffice },
        { label: expensesStepLabel, value: -cappedExpenses, note: expensesStepNote },
        { label: "Net after expenses", value: netAfterExpenses },
        {
          label: `× ${(deal.percentage * 100).toFixed(0)}%`,
          value: percentagePayout,
          note: "Percentage of net.",
        },
        {
          label: "Guarantee floor",
          value: deal.guaranteeAmount,
          note: "Vs deal: artist takes the higher of % or guarantee.",
        },
        {
          label: guaranteeWins ? "→ Guarantee wins" : "→ Percentage wins",
          value: baseDealAmount,
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          note: b.reason,
        })),
      ],
      finalFormula: bonusResult.applied.length
        ? `max(${deal.guaranteeAmount}, (gross - expenses) × ${deal.percentage}) + bonuses = ${(baseDealAmount + bonusResult.totalApplied).toFixed(2)}`
        : `max(${deal.guaranteeAmount}, (gross - expenses) × ${deal.percentage}) = ${baseDealAmount.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
    };
  }

  // ---------- door deal (artist takes 100% of net) ----------
  if (deal.dealType === "door") {
    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist: netAfterExpenses,
      steps: [
        { label: "Gross box office", value: grossBoxOffice },
        { label: expensesStepLabel, value: -cappedExpenses, note: expensesStepNote },
        {
          label: "= To artist (100% of net)",
          value: netAfterExpenses,
          note: "Door deal — artist takes all net revenue.",
        },
      ],
      finalFormula: `gross - expenses = ${netAfterExpenses.toFixed(2)}`,
      bonusesApplied: [],
      bonusesNotTriggered: [],
    };
  }

  // ---------- fallback (shouldn't reach here once all 5 types are listed) ----------
  const friendlyName: Record<Deal["dealType"], string> = {
    flat: "Flat guarantee",
    percentage_of_gross: "Percentage of gross",
    percentage_of_net: "Percentage of net",
    vs: "Vs deal (guarantee vs %)",
    door: "Door deal",
  };
  return {
    supported: false,
    dealType: deal.dealType,
    reason: `${friendlyName[deal.dealType]} deals aren't supported yet.`,
  };
}

/** Evaluate a list of bonuses against the show's actual numbers. */
function applyBonuses(
  bonuses: Bonus[],
  ctx: { gross: number; tickets: number; capacity?: number },
) {
  const applied: { label: string; amount: number; reason: string }[] = [];
  const notTriggered: { label: string; amount: number; reason: string }[] = [];

  for (const b of bonuses) {
    if (b.type === "gross_threshold") {
      if (ctx.gross >= b.threshold) {
        applied.push({
          label: b.label,
          amount: b.amount,
          reason: `Gross ${ctx.gross.toLocaleString()} ≥ ${b.threshold.toLocaleString()}`,
        });
      } else {
        notTriggered.push({
          label: b.label,
          amount: b.amount,
          reason: `Gross ${ctx.gross.toLocaleString()} < ${b.threshold.toLocaleString()}`,
        });
      }
    } else if (b.type === "sellout") {
      if (ctx.capacity != null && ctx.tickets >= ctx.capacity * 0.95) {
        applied.push({
          label: b.label,
          amount: b.amount,
          reason: `${ctx.tickets} of ${ctx.capacity} sold`,
        });
      } else {
        notTriggered.push({
          label: b.label,
          amount: b.amount,
          reason:
            ctx.capacity != null
              ? `${ctx.tickets} of ${ctx.capacity} sold (sellout = ≥95%)`
              : `Capacity unknown — can't evaluate`,
        });
      }
    } else if (b.type === "attendance_threshold") {
      if (ctx.tickets >= b.threshold) {
        applied.push({
          label: b.label,
          amount: b.amount,
          reason: `${ctx.tickets} ≥ ${b.threshold}`,
        });
      } else {
        notTriggered.push({
          label: b.label,
          amount: b.amount,
          reason: `${ctx.tickets} < ${b.threshold}`,
        });
      }
    } else if (b.type === "tier_ratchet") {
      // Tier ratchets fundamentally change the percentage structure. The
      // current engine only supports flat % of gross — we can't apply a
      // ratcheting structure on top of it without knowing which deal type
      // it's modifying. Report as not-applicable.
      notTriggered.push({
        label: b.label,
        amount: 0,
        reason: "Tier ratchets need vs-deal or % of net support — not yet handled",
      });
    }
  }

  return {
    applied,
    notTriggered,
    totalApplied: applied.reduce((s, b) => s + b.amount, 0),
  };
}

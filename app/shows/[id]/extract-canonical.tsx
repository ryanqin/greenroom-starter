"use client";

import { useState } from "react";
import { Sparkles, Loader2, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExtractedDeal } from "@/tools/extraction-eval/schema";
import { formatMoney } from "@/lib/format";

const BONUS_LABEL: Record<string, string> = {
  gross_threshold: "gross",
  sellout: "sellout",
  attendance_threshold: "attend",
  tier_ratchet: "ratchet",
  walkout_pot: "walkout",
};

export function ExtractCanonical({ prose }: { prose: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractedDeal | null>(null);

  async function handleExtract() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/extract-deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prose }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ExtractedDeal;
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4">
      <Button
        variant="brand"
        size="sm"
        onClick={handleExtract}
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Extracting…
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5" />
            {result ? "Re-extract canonical deal" : "Extract canonical deal"}
          </>
        )}
      </Button>

      {error && (
        <div className="mt-4 rounded-lg bg-rose-50/60 ring-1 ring-rose-200/60 p-4">
          <div className="text-[13px] text-rose-800 font-medium">
            Extraction failed
          </div>
          <div className="text-[12px] text-rose-700 mt-1">{error}</div>
        </div>
      )}

      {result && <ExtractedPanel result={result} />}
    </div>
  );
}

function ExtractedPanel({ result }: { result: ExtractedDeal }) {
  return (
    <div className="mt-5 rounded-lg ring-1 ring-brand-300/60 bg-brand-50/30 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-brand-700" />
          <div className="eyebrow text-[10px] text-brand-800">
            AI-extracted canonical deal
          </div>
        </div>
        <ConfidenceBadge level={result.extractionConfidence} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SmallField label="Deal type" value={result.dealType} />
        <SmallField
          label="Guarantee"
          value={
            result.guarantee !== null ? formatMoney(result.guarantee) : "—"
          }
        />
        <SmallField
          label="Percentage"
          value={
            result.percentage !== null
              ? `${(result.percentage * 100).toFixed(0)}%${
                  result.percentageBasis ? ` of ${result.percentageBasis}` : ""
                }`
              : "—"
          }
        />
        <SmallField
          label="Expense cap"
          value={
            result.expenseCap !== null ? formatMoney(result.expenseCap) : "—"
          }
        />
        <SmallField
          label="Hospitality cap"
          value={
            result.hospitalityCap !== null
              ? formatMoney(result.hospitalityCap)
              : "—"
          }
        />
      </div>

      {result.bonuses.length > 0 && (
        <div>
          <div className="eyebrow text-[10px] text-brand-800 mb-2">
            Bonuses ({result.bonuses.length})
          </div>
          <ul className="space-y-1.5">
            {result.bonuses.map((b, i) => (
              <li
                key={i}
                className="text-[12.5px] text-ink-800 flex items-start gap-2"
              >
                <BonusPill type={b.type} />
                <span className="flex-1 leading-relaxed">{b.label}</span>
                <span className="font-mono tabular text-[11px] text-ink-500 shrink-0">
                  {b.threshold !== null && b.type !== "tier_ratchet"
                    ? `@${formatMoney(b.threshold)}`
                    : ""}
                  {b.amount !== null
                    ? ` → +${formatMoney(b.amount)}`
                    : b.type === "walkout_pot"
                      ? " → 100%"
                      : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.recoups.length > 0 && (
        <div>
          <div className="eyebrow text-[10px] text-brand-800 mb-2">
            Recoups ({result.recoups.length})
          </div>
          <ul className="space-y-1.5">
            {result.recoups.map((r, i) => (
              <li
                key={i}
                className="text-[12.5px] text-ink-800 flex items-start gap-2"
              >
                <span className="capitalize inline-flex shrink-0 items-center px-1.5 py-px rounded text-[9px] font-mono uppercase tracking-wider bg-white ring-1 ring-ink-200/50 text-ink-700">
                  {r.category}
                </span>
                <span className="flex-1 leading-relaxed">{r.label}</span>
                <span className="font-mono tabular text-[11px] text-ink-500 shrink-0">
                  {formatMoney(r.amount)} · {r.basis}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.ambiguities.length > 0 && (
        <div className="rounded-lg bg-amber-50/60 ring-1 ring-amber-200/60 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="h-3 w-3 text-amber-700" />
            <div className="eyebrow text-[10px] text-amber-800">
              {result.ambiguities.length} item
              {result.ambiguities.length === 1 ? "" : "s"} need your eyes
            </div>
          </div>
          <ul className="space-y-1.5 text-[12px] text-amber-900 leading-relaxed">
            {result.ambiguities.map((a, i) => (
              <li key={i}>· {a}</li>
            ))}
          </ul>
        </div>
      )}

      {result.metaNotes.length > 0 && (
        <div className="rounded-lg bg-canvas-soft ring-1 ring-ink-200/50 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Info className="h-3 w-3 text-ink-500" />
            <div className="eyebrow text-[10px] text-ink-600">
              Context / history (not in structured fields)
            </div>
          </div>
          <ul className="space-y-1.5 text-[12px] text-ink-700 leading-relaxed">
            {result.metaNotes.map((m, i) => (
              <li key={i}>· {m}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-[10.5px] text-ink-400 pt-1 border-t border-brand-200/40">
        Preview only — not yet persisted. Phase 2 will add side-by-side review +
        confirm + history.
      </div>
    </div>
  );
}

function ConfidenceBadge({
  level,
}: {
  level: ExtractedDeal["extractionConfidence"];
}) {
  const styles: Record<typeof level, string> = {
    high: "bg-emerald-50 ring-emerald-200/70 text-emerald-800",
    medium: "bg-amber-50 ring-amber-200/70 text-amber-800",
    low: "bg-rose-50 ring-rose-200/70 text-rose-800",
    rejected: "bg-ink-100 ring-ink-200/70 text-ink-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-medium ring-1 ${styles[level]}`}
    >
      {level} confidence
    </span>
  );
}

function SmallField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow text-[9px] text-ink-500">{label}</div>
      <div className="text-[13px] font-mono tabular text-ink-900 mt-0.5">
        {value}
      </div>
    </div>
  );
}

function BonusPill({ type }: { type: string }) {
  return (
    <span className="inline-flex shrink-0 items-center px-1.5 py-px rounded text-[9px] font-mono uppercase tracking-wider bg-white ring-1 ring-brand-200/50 text-brand-800">
      {BONUS_LABEL[type] ?? type}
    </span>
  );
}

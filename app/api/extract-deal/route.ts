import { NextRequest, NextResponse } from "next/server";
import { extractDeal } from "@/tools/extraction-eval/extract";
import { reconcileWithStructured } from "@/lib/canonical-reconcile";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  let body: { dealId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.dealId || typeof body.dealId !== "string") {
    return NextResponse.json(
      { error: "dealId is required (string)" },
      { status: 400 },
    );
  }

  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, body.dealId),
  });
  if (!deal) {
    return NextResponse.json(
      { error: `deal not found: ${body.dealId}` },
      { status: 404 },
    );
  }
  if (!deal.dealNotesFreetext) {
    return NextResponse.json(
      { error: "deal has no prose notes to extract from" },
      { status: 400 },
    );
  }

  try {
    const { result, inputTokens, outputTokens } = await extractDeal(
      deal.dealNotesFreetext,
    );
    const driftIssues = reconcileWithStructured(result, deal);
    const augmented = { ...result, issues: [...result.issues, ...driftIssues] };

    console.log(
      `[extract-deal] tokens=${inputTokens}in/${outputTokens}out · drift=${driftIssues.length}`,
    );

    const extractedAt = new Date();
    await db
      .update(deals)
      .set({
        canonicalJson: JSON.stringify(augmented),
        canonicalExtractedAt: extractedAt,
      })
      .where(eq(deals.id, body.dealId));

    return NextResponse.json({
      result: augmented,
      extractedAt: extractedAt.toISOString(),
    });
  } catch (err) {
    console.error("[extract-deal] error:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "extraction failed" },
      { status: 500 },
    );
  }
}

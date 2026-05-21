import { NextRequest, NextResponse } from "next/server";
import { extractDeal } from "@/tools/extraction-eval/extract";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  let body: { dealId?: string; prose?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.prose || typeof body.prose !== "string") {
    return NextResponse.json(
      { error: "prose is required (string)" },
      { status: 400 },
    );
  }
  if (!body.dealId || typeof body.dealId !== "string") {
    return NextResponse.json(
      { error: "dealId is required (string)" },
      { status: 400 },
    );
  }

  try {
    const { result, inputTokens, outputTokens } = await extractDeal(body.prose);
    console.log(`[extract-deal] tokens=${inputTokens}in/${outputTokens}out`);

    const extractedAt = new Date();
    await db
      .update(deals)
      .set({
        canonicalJson: JSON.stringify(result),
        canonicalExtractedAt: extractedAt,
      })
      .where(eq(deals.id, body.dealId));

    return NextResponse.json({
      result,
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

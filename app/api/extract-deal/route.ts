import { NextRequest, NextResponse } from "next/server";
import { extractDeal } from "@/tools/extraction-eval/extract";

export async function POST(req: NextRequest) {
  let body: { prose?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body.prose || typeof body.prose !== "string") {
    return NextResponse.json(
      { error: "prose is required (string)" },
      { status: 400 },
    );
  }

  try {
    const { result, inputTokens, outputTokens } = await extractDeal(body.prose);
    console.log(
      `[extract-deal] tokens=${inputTokens}in/${outputTokens}out`,
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("[extract-deal] error:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "extraction failed" },
      { status: 500 },
    );
  }
}

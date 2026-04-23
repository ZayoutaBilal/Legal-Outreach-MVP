import { NextResponse } from "next/server";
import { processOutreachBatch } from "@/lib/send-outreach";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handleSend() {
  try {
    const result = await processOutreachBatch();
    const message =
      result.processed === 0
        ? `No eligible pending or failed outreach record to send for ${result.campaignName}.`
        : `Batch complete for ${result.campaignName}. ${result.sent} sent, ${result.failed} failed.`;

    return NextResponse.json({
      message,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to process outreach batch."
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return handleSend();
}

export async function POST() {
  return handleSend();
}

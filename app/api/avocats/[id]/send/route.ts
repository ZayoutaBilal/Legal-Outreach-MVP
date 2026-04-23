import { NextResponse } from "next/server";
import { sendAvocatOutreach } from "@/lib/send-outreach";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const result = await sendAvocatOutreach(id);

    return NextResponse.json({
      message:
        result.processed === 0
          ? "No outreach was sent for this avocat."
          : `Outreach sent for ${result.campaignName}. ${result.sent} sent, ${result.failed} failed.`,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to send outreach for this avocat."
      },
      { status: 400 }
    );
  }
}

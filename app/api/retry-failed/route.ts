import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST() {
  try {
    const result = await prisma.outreachLog.updateMany({
      where: {
        status: "failed"
      },
      data: {
        status: "pending",
        error_message: null
      }
    });

    return NextResponse.json({
      message: `${result.count} failed log(s) moved back to pending.`,
      resetCount: result.count
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to retry failed logs."
      },
      { status: 500 }
    );
  }
}

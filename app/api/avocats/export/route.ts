import { NextResponse } from "next/server";
import { exportAvocats } from "@/lib/avocats";

export async function GET() {
  try {
    const avocats = await exportAvocats();

    return new NextResponse(JSON.stringify(avocats, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="avocats-export.json"',
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to export avocats."
      },
      { status: 500 }
    );
  }
}

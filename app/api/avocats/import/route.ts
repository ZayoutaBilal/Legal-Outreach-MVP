import { NextResponse } from "next/server";
import { importAvocats } from "@/lib/avocats";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await importAvocats(payload);

    return NextResponse.json({
      message: `${result.created} avocat(s) imported, ${result.skipped} skipped.`,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to import avocats."
      },
      { status: 400 }
    );
  }
}

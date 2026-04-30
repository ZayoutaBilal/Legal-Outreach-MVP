import { NextResponse } from "next/server";
import { importAvocats } from "@/lib/avocats";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const importMode =
      payload && typeof payload === "object" && "importMode" in payload
        ? String(payload.importMode)
        : "standard";
    const items =
      payload && typeof payload === "object" && "items" in payload
        ? payload.items
        : payload;
    const result = await importAvocats(
      items,
      importMode === "enrich-websites" ? "enrich-websites" : "standard"
    );

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

import { NextResponse } from "next/server";
import { createAvocat } from "@/lib/avocats";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const avocat = await createAvocat(payload);

    return NextResponse.json({
      message: "Avocat added successfully.",
      avocat
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to add avocat."
      },
      { status: 400 }
    );
  }
}

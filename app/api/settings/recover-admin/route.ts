import { NextResponse } from "next/server";
import { sendAdminCredentialsRecoveryEmail } from "@/lib/settings";

export async function POST() {
  try {
    const result = await sendAdminCredentialsRecoveryEmail();

    return NextResponse.json({
      message: `Admin credentials sent to ${result.recipient}.`
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to send recovery email."
      },
      { status: 400 }
    );
  }
}

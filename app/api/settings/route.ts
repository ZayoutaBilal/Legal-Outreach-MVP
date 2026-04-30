import { NextResponse } from "next/server";
import { getAdminSettings, updateAdminSettings } from "@/lib/settings";

export async function GET() {
  try {
    const settings = await getAdminSettings();

    return NextResponse.json(settings, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to fetch settings."
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const settings = await updateAdminSettings(body);

    return NextResponse.json({
      message: "Admin settings updated successfully.",
      settings: {
        email: settings.admin_email,
        password: settings.admin_password,
        smtpFrom: settings.smtp_from || process.env.SMTP_FROM || ""
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update settings."
      },
      { status: 400 }
    );
  }
}

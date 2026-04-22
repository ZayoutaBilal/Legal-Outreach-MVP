import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/dashboard";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;

  try {
    const data = await getDashboardData(status);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to fetch dashboard data."
      },
      { status: 500 }
    );
  }
}

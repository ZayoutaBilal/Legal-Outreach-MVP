import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createSession,
  getAdminCredentials,
  getSessionCookieName,
  getSessionMaxAge
} from "@/lib/auth-session";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const { email, password } = getAdminCredentials();

    if (body.email !== email || body.password !== password) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const sessionToken = await createSession(email);
    const cookieStore = await cookies();

    cookieStore.set(getSessionCookieName(), sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getSessionMaxAge()
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to sign in."
      },
      { status: 500 }
    );
  }
}

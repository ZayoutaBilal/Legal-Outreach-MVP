import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionCookieName } from "@/lib/auth-session";

const protectedRoutes = [
  "/dashboard",
  "/api/dashboard",
  "/api/send",
  "/api/retry-failed",
  "/api/avocats"
];

function isProtected(pathname: string) {
  return protectedRoutes.some((route) => pathname.startsWith(route));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  const hasValidSession = await verifySession(request.cookies.get(getSessionCookieName())?.value);
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const hasCronSecret =
    Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}` && pathname.startsWith("/api/send");

  if (hasValidSession || hasCronSecret) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/dashboard/:path*",
    "/api/send/:path*",
    "/api/retry-failed/:path*",
    "/api/avocats/:path*"
  ]
};

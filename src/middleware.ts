import { NextRequest, NextResponse } from "next/server";

/**
 * Passcode gate. Every route requires the auth cookie EXCEPT:
 *  - /login and /api/login (how you get in)
 *  - /api/sync/* and /api/nudge (called by pg_cron with a Bearer secret, not a cookie)
 */
function isBypass(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/api/login" ||
    pathname.startsWith("/api/sync") ||
    pathname.startsWith("/api/nudge")
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isBypass(pathname)) return NextResponse.next();

  const token = req.cookies.get("stockyard_auth")?.value;
  if (token && token === process.env.AUTH_TOKEN) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

// Run on everything except Next internals/static assets.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

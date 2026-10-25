import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  if (!req.auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/api/:path*"],
};

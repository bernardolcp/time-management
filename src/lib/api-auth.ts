import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";

export const ANTHROPIC_RATE_LIMIT = 20;
export const ANTHROPIC_RATE_WINDOW_MS = 60 * 60 * 1000;

export type ApiUser =
  | { ok: true; userKey: string; session: Session }
  | { ok: false; response: NextResponse };

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function requireApiUser(): Promise<ApiUser> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: unauthorizedResponse() };
  }

  const userKey = session.user.email || session.user.name || "user";
  return { ok: true, userKey, session };
}

export function enforceAnthropicRateLimit(userKey: string): NextResponse | null {
  const result = consumeRateLimit(
    `anthropic:${userKey}`,
    ANTHROPIC_RATE_LIMIT,
    ANTHROPIC_RATE_WINDOW_MS
  );
  if (result.ok) return null;

  return NextResponse.json(
    { error: "Muitas requisições. Tente novamente mais tarde." },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSeconds) },
    }
  );
}

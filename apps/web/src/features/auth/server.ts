import "server-only";
import { isIP } from "node:net";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { RequestOptions } from "@/lib/api-client";
import { getServerApiClient } from "@/lib/server-api";
import { createAuthApi, type AuthApi, type User } from "./auth-api";
import { loginHref } from "./redirects";

/** httpOnly cookie holding the opaque session token issued by the API. */
export const SESSION_COOKIE = "dieuliko_session";

/** Auth needs the Go API; without `DIEULIKO_API_URL` every call fails as "unavailable". */
export function getAuthApi(): AuthApi {
  return createAuthApi(getServerApiClient());
}

/**
 * Visitor IP as seen by our reverse proxy: X-Real-IP when it sets it, otherwise the last
 * X-Forwarded-For hop (the one our proxy appended; earlier hops are client-controlled).
 * Assumes exactly one trusted proxy in front of Next. The API also limits attempts per email address.
 */
export function visitorIpFrom(incoming: Pick<Headers, "get">): string | undefined {
  const forwardedHops = incoming.get("x-forwarded-for")?.split(",") ?? [];
  const candidate = incoming.get("x-real-ip")?.trim() || forwardedHops.at(-1)?.trim();
  return candidate && isIP(candidate) ? candidate : undefined;
}

/** Visitor IP plus, when a session cookie exists, its token. */
export async function requestContext(): Promise<RequestOptions> {
  const [incoming, cookieStore] = await Promise.all([headers(), cookies()]);
  const clientIp = visitorIpFrom(incoming);
  const bearer = cookieStore.get(SESSION_COOKIE)?.value;
  return { ...(clientIp ? { clientIp } : {}), ...(bearer ? { bearer } : {}) };
}

/** Stores the session (Server Actions and Route Handlers only). */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Only local development runs over plain http.
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The logged-in user, or null. Memoized per request; throws when the API cannot be reached. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const context = await requestContext();
  if (!context.bearer) return null;
  return getAuthApi().currentUser(context);
});

/** Protects a page: redirects to the login page (then back to `returnTo`) when logged out. */
export async function requireUser(returnTo: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(returnTo));
  return user;
}

/**
 * Protects a back-office page or action: login first, then a 404 for anyone but an admin, so the back-office does
 * not reveal it exists. The API checks the role again on every call.
 */
export async function requireAdmin(returnTo: string): Promise<User> {
  const user = await requireUser(returnTo);
  if (user.role !== "admin") notFound();
  return user;
}

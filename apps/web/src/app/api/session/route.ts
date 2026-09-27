import { getCurrentUser } from "@/features/auth/server";

/** What the (client) site header needs to know about the visitor; never cached. */
interface SessionSummary {
  readonly user: { readonly firstName: string } | null;
}

/**
 * Lets static pages show the login state without reading cookies during their render
 * (which would make them dynamic). An unreachable API is reported as logged out.
 */
export async function GET(): Promise<Response> {
  let body: SessionSummary;
  try {
    const user = await getCurrentUser();
    body = { user: user ? { firstName: user.firstName } : null };
  } catch (error: unknown) {
    console.error("Session lookup failed", error);
    body = { user: null };
  }
  return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
}

import { requestContext } from "@/features/auth/server";
import { getAdminApi } from "@/features/admin/server";
import { isLogoSlug, logoResponse } from "@/features/companies/logo";
import { ApiError } from "@/lib/api-client";

/** A listing's logo for the back-office, hidden listings included; never cached. Non-admins get a 404. */
export async function GET(_request: Request, { params }: RouteContext<"/admin/entreprises/[slug]/logo">): Promise<Response> {
  const { slug } = await params;
  const context = await requestContext();
  if (!isLogoSlug(slug) || !context.bearer) return logoResponse(null, "private");
  try {
    return logoResponse(await getAdminApi().downloadLogo(slug, context), "private");
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) return logoResponse(null, "private");
    console.error("Admin logo unavailable", error);
    return new Response(null, { status: 502 });
  }
}

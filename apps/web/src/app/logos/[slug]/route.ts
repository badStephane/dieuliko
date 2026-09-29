import { isLogoSlug, logoResponse } from "@/features/companies/logo";
import { getServerApiClient } from "@/lib/server-api";

/** A listing's logo, relayed from the API with its cache policy (hidden listings have none). */
export async function GET(request: Request, { params }: RouteContext<"/logos/[slug]">): Promise<Response> {
  const { slug } = await params;
  if (!isLogoSlug(slug)) return logoResponse(null, "public");
  const version = new URL(request.url).searchParams.get("v");
  try {
    const upstream = await getServerApiClient().download(`/companies/${slug}/logo`, version ? { params: { v: version } } : {});
    return logoResponse(upstream, "public");
  } catch (error: unknown) {
    console.error("Logo unavailable", error);
    return new Response(null, { status: 502 });
  }
}

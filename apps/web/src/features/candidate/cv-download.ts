import "server-only";
import { CANDIDATE_HOME_PATH, loginHref } from "@/features/auth/redirects";
import { requestContext } from "@/features/auth/server";
import { getCandidateApi, isLostSession } from "./server";

const NO_CV = "Vous n’avez pas encore déposé de CV.";
const UNAVAILABLE = "Votre CV est momentanément indisponible. Réessayez dans quelques instants.";

function textResponse(message: string, status: number): Response {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function loginRedirect(request: Request): Response {
  return Response.redirect(new URL(loginHref(CANDIDATE_HOME_PATH), request.url), 303);
}

/**
 * Streams the logged-in candidate's CV from the API. The browser never talks to the API: the session
 * cookie stays on this origin, and the file is always served as a private attachment.
 */
export async function cvDownloadResponse(request: Request): Promise<Response> {
  const context = await requestContext();
  if (!context.bearer) return loginRedirect(request);
  try {
    const upstream = await getCandidateApi().downloadCv(context);
    if (!upstream?.body) return textResponse(NO_CV, 404);
    const headers = new Headers({
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    for (const name of ["Content-Disposition", "Content-Length"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: 200, headers });
  } catch (error: unknown) {
    if (isLostSession(error)) return loginRedirect(request);
    console.error("CV download failed", error);
    return textResponse(UNAVAILABLE, 502);
  }
}

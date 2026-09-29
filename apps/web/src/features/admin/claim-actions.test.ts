import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ cookies: new Map<string, string>(), revalidated: [] as string[] }));

const Signal = vi.hoisted(
  () =>
    class Signal extends Error {
      constructor(readonly kind: "redirect" | "not-found", readonly url = "") {
        super(`${kind} ${url}`);
      }
    },
);

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (request.cookies.has(name) ? { name, value: request.cookies.get(name) } : undefined),
  }),
  headers: async () => new Headers({ "x-real-ip": "41.82.10.7" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Signal("redirect", url);
  },
  notFound: () => {
    throw new Signal("not-found");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => request.revalidated.push(path) }));

import { SESSION_COOKIE } from "@/features/auth/server";
import { approveClaimAction, rejectClaimAction, revokeClaimAction } from "./claim-actions";
import { loadClaim, loadClaims } from "./claim-server";

interface Reply {
  readonly status?: number;
  readonly data?: unknown;
  readonly error?: { readonly code: string; readonly message: string; readonly fields?: Record<string, string> };
}

let calls: { key: string; body: unknown }[] = [];

function stubApi(replies: Record<string, Reply>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const key = `${init.method} ${new URL(url).pathname.replace(/^\/v1/, "")}`;
      calls.push({ key, body: init.body ? JSON.parse(String(init.body)) : null });
      const reply = replies[key] ?? { status: 404, error: { code: "not_found", message: "Introuvable." } };
      const body = reply.error ? { success: false, data: null, error: reply.error } : { success: true, data: reply.data ?? null, error: null };
      return new Response(JSON.stringify(body), { status: reply.status ?? (reply.error ? 400 : 200) });
    }),
  );
}

const ID = "7f1c2b9e-4a3d-4e5f-9a8b-1c2d3e4f5a6b";
const ADMIN = { id: "0b7c3e2a-5d4f-4a8b-9c1d-2e3f4a5b6c7d", email: "admin@dieuliko.sn", role: "admin", firstName: "Admin", lastName: "Dieuliko", emailVerified: true, createdAt: "2026-09-27T10:00:00Z" };
const ME = { "GET /auth/me": { data: ADMIN } };
const CLAIM = {
  id: ID,
  status: "approved",
  jobTitle: "DRH",
  createdAt: "2026-09-29T09:00:00Z",
  reviewedAt: "2026-09-29T10:00:00Z",
  requester: { firstName: "Awa", lastName: "Diop", email: "awa@sonatel.sn", emailVerified: true },
  company: { slug: "sonatel", name: "Sonatel", city: "Dakar", verified: true, hiddenAt: null },
  phone: "",
  message: "",
  decisionReason: null,
  emailDomainMatches: false,
  otherClaims: [],
};

beforeEach(() => {
  request.cookies.clear();
  request.cookies.set(SESSION_COOKIE, "admin-token");
  request.revalidated.length = 0;
  calls = [];
  vi.stubEnv("DIEULIKO_API_URL", "http://api.test");
  vi.stubEnv("DIEULIKO_API_TOKEN", "internal-secret");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("claim decisions", () => {
  it("approves, then refreshes the queue and the listing", async () => {
    stubApi({ ...ME, [`POST /admin/claims/${ID}/approval`]: { data: CLAIM } });

    const result = await approveClaimAction(ID);

    expect(result).toEqual({ status: "success", message: "Demande acceptée. Le demandeur a été prévenu par email." });
    expect(request.revalidated).toEqual(expect.arrayContaining(["/admin/revendications", `/admin/revendications/${ID}`, "/admin/entreprises/sonatel", "/entreprises/sonatel"]));
  });

  it("sends the reason of a rejection or a revocation", async () => {
    stubApi({ ...ME, [`POST /admin/claims/${ID}/rejection`]: { data: { ...CLAIM, status: "rejected" } }, [`POST /admin/claims/${ID}/revocation`]: { data: { ...CLAIM, status: "revoked" } } });

    expect((await rejectClaimAction(ID, "Fonction non vérifiable.")).status).toBe("success");
    expect((await revokeClaimAction(ID, "Départ.")).status).toBe("success");

    expect(calls.filter((call) => call.key.startsWith("POST")).map((call) => call.body)).toEqual([{ reason: "Fonction non vérifiable." }, { reason: "Départ." }]);
  });

  it("shows why a decision was refused, the reason field included", async () => {
    stubApi({
      ...ME,
      [`POST /admin/claims/${ID}/rejection`]: {
        status: 422,
        error: { code: "validation_failed", message: "Certains champs sont invalides.", fields: { reason: "Expliquez votre décision." } },
      },
      [`POST /admin/claims/${ID}/approval`]: { status: 409, error: { code: "listing_managed", message: "Cette fiche est déjà gérée." } },
    });

    expect(await rejectClaimAction(ID, "")).toEqual({ status: "error", message: "Certains champs sont invalides.", fields: { reason: "Expliquez votre décision." } });
    expect(await approveClaimAction(ID)).toEqual({ status: "error", message: "Cette fiche est déjà gérée." });
  });

  it("refuses malformed input without calling the API", async () => {
    stubApi(ME);

    expect((await approveClaimAction("not-a-uuid")).status).toBe("error");
    expect((await rejectClaimAction(ID, 42)).status).toBe("error");
    expect(calls.some((call) => call.key.includes("/admin/claims"))).toBe(false);
  });
});

describe("claim loaders", () => {
  it("reads the queue and one claim, null when the API cannot answer", async () => {
    stubApi({ "GET /admin/claims": { data: { items: [CLAIM], total: 1 } }, [`GET /admin/claims/${ID}`]: { data: CLAIM } });
    expect((await loadClaims("pending", 0, 20))?.total).toBe(1);
    expect((await loadClaim(ID))?.claim?.company.slug).toBe("sonatel");

    stubApi({ "GET /admin/claims": { status: 503, error: { code: "unavailable", message: "Indisponible." } } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await loadClaims("pending", 0, 20)).toBeNull();
  });
});

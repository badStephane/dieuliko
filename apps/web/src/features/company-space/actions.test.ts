import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const RedirectSignal = vi.hoisted(
  () =>
    class RedirectSignal extends Error {
      constructor(readonly url: string) {
        super(`redirect ${url}`);
      }
    },
);

const revalidated = vi.hoisted(() => [] as string[]);

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "dieuliko_session" ? { name, value: "session-token" } : undefined) }),
  headers: async () => new Headers({ "x-real-ip": "41.82.10.7" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidated.push(path) }));

import { cancelClaimAction, requestClaimAction } from "./actions";
import { IDLE } from "@/features/auth/form-state";
import { loadClaim } from "./server";

interface ApiCall {
  readonly url: string;
  readonly init: RequestInit;
}

let apiCalls: ApiCall[] = [];

function answer(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      apiCalls.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    }),
  );
}

const CLAIM = {
  id: "7f1c2b9e-4a3d-4e5f-9a8b-1c2d3e4f5a6b",
  status: "pending",
  jobTitle: "DRH",
  phone: "",
  message: "",
  decisionReason: null,
  reviewedAt: null,
  createdAt: "2026-09-29T09:00:00Z",
  company: { slug: "sonatel", name: "Sonatel", city: "Dakar", logoVersion: null },
};

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function redirectOf(action: Promise<unknown>): Promise<string> {
  const error = await action.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof RedirectSignal)) throw new Error(`expected a redirect, got ${String(error)}`);
  return error.url;
}

beforeEach(() => {
  apiCalls = [];
  revalidated.length = 0;
  vi.stubEnv("DIEULIKO_API_URL", "http://api.test");
  vi.stubEnv("DIEULIKO_API_TOKEN", "internal-secret");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("requestClaimAction", () => {
  it("sends the request for the session, then shows it in the company space", async () => {
    answer(201, { success: true, data: CLAIM, error: null });
    const submitted = { companySlug: "sonatel", jobTitle: "DRH", phone: "77 123 45 67", message: "Bonjour" };

    const destination = await redirectOf(requestClaimAction(IDLE, form(submitted)));

    expect(destination).toBe("/espace-entreprise");
    expect(revalidated).toContain("/espace-entreprise");
    expect(apiCalls[0]?.url).toBe("http://api.test/v1/company/claim");
    expect(apiCalls[0]?.init.headers).toMatchObject({ Authorization: "Bearer session-token" });
    expect(JSON.parse(String(apiCalls[0]?.init.body))).toEqual(submitted);
  });

  it("shows the API's message when the listing already has a manager", async () => {
    answer(409, { success: false, data: null, error: { code: "company_claimed", message: "Cette fiche est déjà gérée." } });

    const state = await requestClaimAction(IDLE, form({ companySlug: "sonatel", jobTitle: "DRH" }));

    expect(state).toMatchObject({ status: "error", message: "Cette fiche est déjà gérée.", values: { companySlug: "sonatel", jobTitle: "DRH" } });
  });

  it("goes back to the login page when the session is lost", async () => {
    answer(401, { success: false, data: null, error: { code: "unauthenticated", message: "Session expirée." } });

    const destination = await redirectOf(requestClaimAction(IDLE, form({ companySlug: "sonatel", jobTitle: "DRH" })));

    expect(destination).toBe("/connexion?next=%2Fespace-entreprise%2Frevendiquer");
  });
});

describe("cancelClaimAction", () => {
  it("cancels the pending request", async () => {
    answer(200, { success: true, data: null, error: null });

    const state = await cancelClaimAction();

    expect(state.status).toBe("success");
    expect(apiCalls[0]?.init.method).toBe("DELETE");
  });

  it("reports that there was nothing to cancel", async () => {
    answer(404, { success: false, data: null, error: { code: "no_pending_claim", message: "Vous n’avez pas de demande en attente." } });

    expect(await cancelClaimAction()).toMatchObject({ status: "error", message: "Vous n’avez pas de demande en attente." });
  });
});

describe("loadClaim", () => {
  it("returns the claim, or null when the API cannot answer", async () => {
    answer(200, { success: true, data: CLAIM, error: null });
    expect(await loadClaim()).toMatchObject({ claim: { company: { slug: "sonatel" } } });

    answer(503, { success: false, data: null, error: { code: "unavailable", message: "Indisponible." } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await loadClaim()).toBeNull();
  });
});

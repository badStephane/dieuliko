import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "@/lib/api-client";
import { claimStatusLabel, createClaimsAdminApi, type ClaimDetail } from "./claims-api";

const CONTEXT = { bearer: "admin-token", clientIp: "41.82.10.7" };
const ID = "7f1c2b9e-4a3d-4e5f-9a8b-1c2d3e4f5a6b";

const CLAIM_DETAIL: ClaimDetail = {
  id: ID,
  status: "pending",
  jobTitle: "DRH",
  createdAt: "2026-09-29T09:00:00Z",
  reviewedAt: null,
  requester: { firstName: "Awa", lastName: "Diop", email: "awa@sonatel.sn", emailVerified: true, createdAt: "2026-09-28T09:00:00Z" },
  company: { slug: "sonatel", name: "Sonatel", city: "Dakar", website: "https://sonatel.sn", verified: false, hiddenAt: null },
  phone: "+221771234567",
  message: "Je gère les recrutements.",
  decisionReason: null,
  emailDomainMatches: true,
  otherClaims: [],
};

function apiReturning(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  });
  const api = createClaimsAdminApi(createApiClient("http://api.test", { fetchImpl: fetchImpl as unknown as typeof fetch }));
  return { api, calls };
}

const envelope = (data: unknown) => ({ success: true, data, error: null });

describe("createClaimsAdminApi", () => {
  it("lists the claims of one status", async () => {
    const { api, calls } = apiReturning(200, envelope({ items: [CLAIM_DETAIL], total: 1 }));

    const page = await api.listClaims("approved", 20, 20, CONTEXT);

    expect(page.total).toBe(1);
    expect(calls[0]?.url).toBe("http://api.test/v1/admin/claims?status=approved&offset=20&limit=20");
  });

  it("reads one claim, or null when it does not exist", async () => {
    const found = apiReturning(200, envelope(CLAIM_DETAIL));
    const missing = apiReturning(404, { success: false, data: null, error: { code: "not_found", message: "Demande introuvable." } });

    expect(await found.api.getClaim(ID, CONTEXT)).toEqual(CLAIM_DETAIL);
    expect(await missing.api.getClaim(ID, CONTEXT)).toBeNull();
  });

  it("posts each decision, with its reason", async () => {
    const { api, calls } = apiReturning(200, envelope(CLAIM_DETAIL));

    await api.approveClaim(ID, CONTEXT);
    await api.rejectClaim(ID, "Fonction non vérifiable.", CONTEXT);
    await api.revokeClaim(ID, "Départ.", CONTEXT);

    expect(calls.map((call) => call.url)).toEqual([
      `http://api.test/v1/admin/claims/${ID}/approval`,
      `http://api.test/v1/admin/claims/${ID}/rejection`,
      `http://api.test/v1/admin/claims/${ID}/revocation`,
    ]);
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({ reason: "Fonction non vérifiable." });
  });
});

describe("claimStatusLabel", () => {
  it("names every status in French", () => {
    expect(claimStatusLabel("pending")).toBe("En attente");
    expect(claimStatusLabel("approved")).toBe("Acceptée");
    expect(claimStatusLabel("rejected")).toBe("Refusée");
    expect(claimStatusLabel("cancelled")).toBe("Annulée");
    expect(claimStatusLabel("revoked")).toBe("Révoquée");
  });
});

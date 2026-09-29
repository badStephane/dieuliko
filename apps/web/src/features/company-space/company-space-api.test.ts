import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "@/lib/api-client";
import { claimHeadline, createCompanySpaceApi, type Claim } from "./company-space-api";

const CONTEXT = { bearer: "session-token", clientIp: "41.82.10.7" };

const CLAIM: Claim = {
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

function apiReturning(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  });
  const api = createCompanySpaceApi(createApiClient("http://api.test", { fetchImpl: fetchImpl as unknown as typeof fetch }));
  return { api, calls };
}

const envelope = (data: unknown) => ({ success: true, data, error: null });

describe("createCompanySpaceApi", () => {
  it("reads the account's latest claim, or null without one", async () => {
    const withClaim = apiReturning(200, envelope(CLAIM));
    const without = apiReturning(200, envelope(null));

    expect(await withClaim.api.getClaim(CONTEXT)).toEqual(CLAIM);
    expect(await without.api.getClaim(CONTEXT)).toBeNull();
    expect(withClaim.calls[0]).toMatchObject({ url: "http://api.test/v1/company/claim", init: { method: "GET" } });
  });

  it("posts a request and cancels it", async () => {
    const { api, calls } = apiReturning(201, envelope(CLAIM));

    await api.requestClaim({ companySlug: "sonatel", jobTitle: "DRH", phone: "", message: "" }, CONTEXT);
    await api.cancelClaim(CONTEXT);

    expect(calls[0]).toMatchObject({ url: "http://api.test/v1/company/claim", init: { method: "POST" } });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ companySlug: "sonatel", jobTitle: "DRH", phone: "", message: "" });
    expect(calls[1]).toMatchObject({ url: "http://api.test/v1/company/claim", init: { method: "DELETE" } });
  });

  it("rejects an unknown status", async () => {
    const { api } = apiReturning(200, envelope({ ...CLAIM, status: "lost" }));

    await expect(api.getClaim(CONTEXT)).rejects.toMatchObject({ code: "invalid_response" });
  });
});

describe("claimHeadline", () => {
  it("says where each claim stands", () => {
    expect(claimHeadline(CLAIM)).toBe("Demande en cours d’examen");
    expect(claimHeadline({ ...CLAIM, status: "approved" })).toBe("Vous gérez cette fiche");
    expect(claimHeadline({ ...CLAIM, status: "rejected" })).toBe("Demande non acceptée");
    expect(claimHeadline({ ...CLAIM, status: "revoked" })).toBe("Accès retiré");
    expect(claimHeadline({ ...CLAIM, status: "cancelled" })).toBe("Demande annulée");
  });
});

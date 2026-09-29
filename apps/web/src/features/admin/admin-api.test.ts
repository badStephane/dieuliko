import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "@/lib/api-client";
import { createAdminApi } from "./admin-api";

const CONTEXT = { bearer: "admin-token", clientIp: "41.82.10.7" };

function apiReturning(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  });
  const api = createAdminApi(createApiClient("http://api.test", { fetchImpl: fetchImpl as unknown as typeof fetch }));
  return { api, calls };
}

const envelope = (data: unknown) => ({ success: true, data, error: null });
const notFound = { success: false, data: null, error: { code: "not_found", message: "Introuvable." } };

const STATS = {
  candidates: { total: 3, last7Days: 1, last30Days: 2, verifiedEmails: 2, suspended: 0, withProfile: 2, withCv: 1 },
  letters: 4,
  applications: { sent: 2, withdrawn: 1 },
  companies: { visible: 1893, hidden: 1, verified: 3 },
  topCompanies: [{ slug: "cabinet-ndiaye", name: "Cabinet Ndiaye", city: "Dakar", applications: 2 }],
  trends: { signups: { last7Days: 1, previous7Days: 0 }, applications: { last7Days: 2, previous7Days: 1 }, letters: { last7Days: 1, previous7Days: 3 } },
  quality: { noLogo: 1890, noDescription: 1200, noContact: 40, unverified: 1891 },
  daily: [{ day: "2026-09-29", signups: 1, applications: 2 }],
  recentCandidates: [{ id: "1c8d4f3b-6e5a-4b9c-8d2e-3f4a5b6c7d8e", firstName: "Awa", lastName: "Diop", createdAt: "2026-09-29T10:00:00Z" }],
  recentApplications: [{ slug: "cabinet-ndiaye", name: "Cabinet Ndiaye", createdAt: "2026-09-29T11:00:00Z" }],
};

const COMPANY = {
  slug: "cabinet-ndiaye",
  logoVersion: null,
  name: "Cabinet Ndiaye",
  sector: "finance-comptabilite",
  city: "Dakar",
  companyType: "",
  description: "",
  website: "https://ndiaye.sn",
  email: "",
  phone: "",
  address: "",
  size: "pme",
  socialLinks: {},
  verified: false,
  hiddenAt: null,
  curatedAt: "2026-09-28T10:00:00Z",
  source: "admin",
  createdAt: "2026-09-28T10:00:00Z",
  updatedAt: "2026-09-28T10:00:00Z",
  applications: 0,
  letters: 0,
};

const CANDIDATE = {
  id: "0b7c3e2a-5d4f-4a8b-9c1d-2e3f4a5b6c7d",
  email: "awa@example.sn",
  firstName: "Awa",
  lastName: "Diop",
  emailVerified: true,
  suspendedAt: null,
  createdAt: "2026-09-27T10:00:00Z",
};

describe("createAdminApi", () => {
  it("reads the dashboard numbers with the admin's session", async () => {
    const { api, calls } = apiReturning(200, envelope(STATS));

    expect(await api.getStats(CONTEXT)).toEqual(STATS);
    expect(calls[0]?.url).toBe("http://api.test/v1/admin/stats");
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: "Bearer admin-token" });
  });

  it("lists companies with only the filters that are set", async () => {
    const { api, calls } = apiReturning(200, envelope({ items: [], total: 0 }));

    await api.listCompanies({ q: "ndiaye", status: "", offset: 20, limit: 20 }, CONTEXT);

    expect(calls[0]?.url).toBe("http://api.test/v1/admin/companies?q=ndiaye&offset=20&limit=20");
  });

  it("reads a company, or null when it does not exist", async () => {
    expect(await apiReturning(200, envelope(COMPANY)).api.getCompany("cabinet-ndiaye", CONTEXT)).toEqual(COMPANY);
    expect(await apiReturning(404, notFound).api.getCompany("inconnue", CONTEXT)).toBeNull();
  });

  it("creates, edits, hides and verifies companies", async () => {
    const input = { name: "Cabinet Ndiaye", sector: "finance-comptabilite", city: "Dakar" };
    const create = apiReturning(201, envelope(COMPANY));
    await create.api.createCompany(input, CONTEXT);
    expect(create.calls[0]?.init).toMatchObject({ method: "POST", body: JSON.stringify(input) });

    const edit = apiReturning(200, envelope(COMPANY));
    await edit.api.updateCompany("cabinet-ndiaye", input, CONTEXT);
    expect(edit.calls[0]).toMatchObject({ url: "http://api.test/v1/admin/companies/cabinet-ndiaye", init: { method: "PUT" } });

    const hide = apiReturning(200, envelope(COMPANY));
    await hide.api.setCompanyHidden("cabinet-ndiaye", true, CONTEXT);
    expect(hide.calls[0]).toMatchObject({ url: "http://api.test/v1/admin/companies/cabinet-ndiaye/visibility", init: { body: '{"hidden":true}' } });

    const verify = apiReturning(200, envelope(COMPANY));
    await verify.api.setCompanyVerified("cabinet-ndiaye", false, CONTEXT);
    expect(verify.calls[0]?.init.body).toBe('{"verified":false}');
  });

  it("lists, reads, suspends and deletes candidates", async () => {
    const list = apiReturning(200, envelope({ items: [CANDIDATE], total: 1 }));
    expect((await list.api.listCandidates({ q: "", status: "suspended", offset: 0, limit: 20 }, CONTEXT)).total).toBe(1);
    expect(list.calls[0]?.url).toBe("http://api.test/v1/admin/candidates?status=suspended&offset=0&limit=20");

    const detail = { ...CANDIDATE, hasProfile: true, hasCv: false, letters: 2, applicationsSent: 1, applicationsWithdrawn: 0 };
    expect(await apiReturning(200, envelope(detail)).api.getCandidate(CANDIDATE.id, CONTEXT)).toEqual(detail);
    expect(await apiReturning(404, notFound).api.getCandidate(CANDIDATE.id, CONTEXT)).toBeNull();

    const suspend = apiReturning(200, envelope(detail));
    await suspend.api.setCandidateSuspended(CANDIDATE.id, true, CONTEXT);
    expect(suspend.calls[0]).toMatchObject({ url: `http://api.test/v1/admin/candidates/${CANDIDATE.id}/suspension`, init: { method: "PUT" } });

    const removal = apiReturning(200, envelope(null));
    await removal.api.deleteCandidate(CANDIDATE.id, "awa@example.sn", CONTEXT);
    expect(removal.calls[0]).toMatchObject({
      url: `http://api.test/v1/admin/candidates/${CANDIDATE.id}/deletion`,
      init: { method: "POST", body: '{"confirmEmail":"awa@example.sn"}' },
    });
  });
});

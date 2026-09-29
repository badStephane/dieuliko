import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Next.js request APIs, replaced by in-memory doubles --------------------------------------
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
import {
  bulkCompaniesAction,
  deleteCandidateAction,
  removeCompanyLogoAction,
  saveCompanyAction,
  setCandidateSuspendedAction,
  setCompanyHiddenAction,
  setCompanyVerifiedAction,
  uploadCompanyLogoAction,
} from "./actions";

// --- Go API double: each "METHOD /path" answers its own status and data -----------------------
interface Reply {
  readonly status?: number;
  readonly data?: unknown;
  readonly error?: { readonly code: string; readonly message: string; readonly fields?: Record<string, string> };
}

let calls: string[] = [];

function stubApi(replies: Record<string, Reply>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const key = `${init.method} ${new URL(url).pathname.replace(/^\/v1/, "")}`;
      calls.push(key);
      const reply = replies[key] ?? { status: 404, error: { code: "not_found", message: "Introuvable." } };
      const body = reply.error ? { success: false, data: null, error: reply.error } : { success: true, data: reply.data ?? null, error: null };
      return new Response(JSON.stringify(body), { status: reply.status ?? (reply.error ? 400 : 200) });
    }),
  );
}

const ADMIN = { id: "0b7c3e2a-5d4f-4a8b-9c1d-2e3f4a5b6c7d", email: "admin@dieuliko.sn", role: "admin", firstName: "Admin", lastName: "Dieuliko", emailVerified: true, createdAt: "2026-09-27T10:00:00Z" };
const ME = { "GET /auth/me": { data: ADMIN } };
const COMPANY = {
  slug: "cabinet-ndiaye", logoVersion: null, name: "Cabinet Ndiaye", sector: "finance-comptabilite", city: "Dakar", companyType: "", description: "",
  website: "", email: "", phone: "", address: "", size: "", socialLinks: {}, verified: false, hiddenAt: null, curatedAt: null,
  source: "scraped", createdAt: "2026-09-28T10:00:00Z", updatedAt: "2026-09-28T10:00:00Z",
};
const INPUT = { name: "Cabinet Ndiaye", sector: "finance-comptabilite", city: "Dakar", companyType: "", description: "", website: "", email: "", phone: "", address: "", size: "", socialLinks: {} };
const CANDIDATE_ID = "1c8d4f3b-6e5a-4b9c-8d2e-3f4a5b6c7d8e";
const DETAIL = { id: CANDIDATE_ID, email: "awa@example.sn", firstName: "Awa", lastName: "Diop", emailVerified: true, suspendedAt: "2026-09-28T11:00:00Z", createdAt: "2026-09-27T10:00:00Z", hasProfile: true, hasCv: false, letters: 1, applicationsSent: 0, applicationsWithdrawn: 0 };

async function signalOf(action: Promise<unknown>): Promise<{ kind: string; url: string }> {
  const error = await action.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof Signal)) throw new Error(`expected a navigation signal, got ${String(error)}`);
  return { kind: error.kind, url: error.url };
}

beforeEach(() => {
  request.cookies.clear();
  request.cookies.set(SESSION_COOKIE, "admin-token");
  request.revalidated.length = 0;
  calls = [];
  vi.stubEnv("DIEULIKO_API_URL", "http://api.test");
});

describe("back-office actions", () => {
  it("are 404 for a candidate, without calling the back-office API", async () => {
    stubApi({ "GET /auth/me": { data: { ...ADMIN, role: "candidate" } } });

    expect((await signalOf(setCompanyHiddenAction("cabinet-ndiaye", true))).kind).toBe("not-found");
    expect(calls).toEqual(["GET /auth/me"]);
  });

  it("send a visitor to the login page first", async () => {
    request.cookies.clear();
    stubApi({});

    expect(await signalOf(setCompanyHiddenAction("cabinet-ndiaye", true))).toEqual({ kind: "redirect", url: "/connexion?next=%2Fadmin%2Fentreprises%2Fcabinet-ndiaye" });
  });
});

describe("company actions", () => {
  it("hide a listing and refresh its public and back-office pages", async () => {
    stubApi({ ...ME, "PUT /admin/companies/cabinet-ndiaye/visibility": { data: { ...COMPANY, hiddenAt: "2026-09-28T12:00:00Z" } } });

    const result = await setCompanyHiddenAction("cabinet-ndiaye", true);

    expect(result).toEqual({ status: "success", message: "La fiche est masquée de l’annuaire." });
    expect(request.revalidated).toEqual(expect.arrayContaining(["/entreprises", "/entreprises/cabinet-ndiaye", "/admin/entreprises/cabinet-ndiaye"]));
  });

  it("verify a listing", async () => {
    stubApi({ ...ME, "PUT /admin/companies/cabinet-ndiaye/verification": { data: { ...COMPANY, verified: true } } });

    expect(await setCompanyVerifiedAction("cabinet-ndiaye", true)).toEqual({ status: "success", message: "La fiche est marquée vérifiée." });
  });

  it("save an edit and report field errors from the API", async () => {
    stubApi({ ...ME, "PUT /admin/companies/cabinet-ndiaye": { status: 422, error: { code: "validation_failed", message: "Certains champs sont invalides.", fields: { website: "Adresse web invalide." } } } });

    expect(await saveCompanyAction("cabinet-ndiaye", INPUT)).toEqual({
      status: "error",
      message: "Certains champs sont invalides.",
      fields: { website: "Adresse web invalide." },
    });
  });

  it("create a listing, then open its page", async () => {
    stubApi({ ...ME, "POST /admin/companies": { status: 201, data: COMPANY } });

    expect(await signalOf(saveCompanyAction(null, INPUT))).toEqual({ kind: "redirect", url: "/admin/entreprises/cabinet-ndiaye" });
    expect(request.revalidated).toContain("/entreprises");
  });

  it("reject a malformed form without calling the API", async () => {
    stubApi(ME);

    expect((await saveCompanyAction("cabinet-ndiaye", { name: 42 })).status).toBe("error");
    expect((await setCompanyHiddenAction("../admin", true)).status).toBe("error");
    expect(calls.filter((call) => call !== "GET /auth/me")).toEqual([]);
  });
});

function logoForm(content: BlobPart[] = ["png"], type = "image/png"): FormData {
  const form = new FormData();
  form.append("file", new File(content, "logo.png", { type }));
  return form;
}

describe("logo actions", () => {
  it("upload a logo and refresh the pages showing the listing", async () => {
    stubApi({ ...ME, "PUT /admin/companies/cabinet-ndiaye/logo": { data: { ...COMPANY, logoVersion: "0b0b.png" } } });

    expect(await uploadCompanyLogoAction("cabinet-ndiaye", logoForm())).toEqual({ status: "success", message: "Le logo est enregistré." });
    expect(request.revalidated).toEqual(expect.arrayContaining(["/entreprises", "/entreprises/cabinet-ndiaye", "/admin/entreprises"]));
  });

  it("refuse a missing, oversized or non-image file without calling the API", async () => {
    stubApi(ME);

    expect(await uploadCompanyLogoAction("cabinet-ndiaye", new FormData())).toEqual({ status: "error", message: "Choisissez une image." });
    expect(await uploadCompanyLogoAction("cabinet-ndiaye", logoForm([new Uint8Array(2 * 1024 * 1024 + 1)]))).toEqual({
      status: "error",
      message: "Le logo ne doit pas dépasser 2 Mo.",
    });
    expect(await uploadCompanyLogoAction("cabinet-ndiaye", logoForm(["<svg/>"], "image/svg+xml"))).toEqual({
      status: "error",
      message: "Le logo doit être une image PNG, JPEG ou WebP.",
    });
    expect((await uploadCompanyLogoAction("../x", logoForm())).status).toBe("error");
    expect(calls.filter((call) => call !== "GET /auth/me")).toEqual([]);
  });

  it("show the API's reason when it refuses the image", async () => {
    const fields = { file: "Cette image est illisible." };
    stubApi({ ...ME, "PUT /admin/companies/cabinet-ndiaye/logo": { status: 422, error: { code: "validation_failed", message: "Certains champs sont invalides.", fields } } });

    expect(await uploadCompanyLogoAction("cabinet-ndiaye", logoForm())).toEqual({ status: "error", message: fields.file });
  });

  it("remove a logo", async () => {
    stubApi({ ...ME, "DELETE /admin/companies/cabinet-ndiaye/logo": { data: COMPANY } });

    expect(await removeCompanyLogoAction("cabinet-ndiaye")).toEqual({ status: "success", message: "Le logo est retiré." });
    expect(request.revalidated).toContain("/entreprises/cabinet-ndiaye");
  });
});

describe("bulk company actions", () => {
  it("apply one action to the selected listings and say how many changed", async () => {
    stubApi({ ...ME, "POST /admin/companies/bulk": { data: { updated: 2 } } });

    expect(await bulkCompaniesAction("hide", ["cabinet-ndiaye", "atelier-sow"])).toEqual({ status: "success", message: "2 fiches masquées." });
    expect(request.revalidated).toEqual(expect.arrayContaining(["/entreprises", "/admin/entreprises", "/entreprises/atelier-sow"]));
  });

  it("use the singular for one listing", async () => {
    stubApi({ ...ME, "POST /admin/companies/bulk": { data: { updated: 1 } } });

    expect(await bulkCompaniesAction("verify", ["cabinet-ndiaye"])).toEqual({ status: "success", message: "1 fiche marquée vérifiée." });
  });

  it("refuse an unknown action, an empty or oversized selection without calling the API", async () => {
    stubApi(ME);

    expect((await bulkCompaniesAction("delete", ["cabinet-ndiaye"])).status).toBe("error");
    expect((await bulkCompaniesAction("hide", [])).status).toBe("error");
    expect((await bulkCompaniesAction("hide", Array.from({ length: 101 }, (_, i) => `fiche-${i}`))).status).toBe("error");
    expect(calls.filter((call) => call !== "GET /auth/me")).toEqual([]);
  });
});

describe("candidate actions", () => {
  it("suspend a candidate", async () => {
    stubApi({ ...ME, [`PUT /admin/candidates/${CANDIDATE_ID}/suspension`]: { data: DETAIL } });

    expect(await setCandidateSuspendedAction(CANDIDATE_ID, true)).toEqual({ status: "success", message: "Le compte est suspendu. Le candidat a été prévenu par email." });
    expect(request.revalidated).toContain(`/admin/candidats/${CANDIDATE_ID}`);
  });

  it("delete a candidate once the email is confirmed, then go back to the list", async () => {
    stubApi({ ...ME, [`POST /admin/candidates/${CANDIDATE_ID}/deletion`]: {} });

    expect(await signalOf(deleteCandidateAction(CANDIDATE_ID, "awa@example.sn"))).toEqual({ kind: "redirect", url: "/admin/candidats" });
  });

  it("explain a mistyped confirmation", async () => {
    const fields = { confirmEmail: "Recopiez exactement l’adresse email du compte." };
    stubApi({ ...ME, [`POST /admin/candidates/${CANDIDATE_ID}/deletion`]: { status: 422, error: { code: "validation_failed", message: "Certains champs sont invalides.", fields } } });

    expect(await deleteCandidateAction(CANDIDATE_ID, "autre@example.sn")).toEqual({ status: "error", message: fields.confirmEmail });
  });
});

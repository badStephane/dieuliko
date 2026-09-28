import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Next.js request APIs, replaced by in-memory doubles --------------------------------------
const request = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  revalidated: [] as string[],
}));

const RedirectSignal = vi.hoisted(
  () =>
    class RedirectSignal extends Error {
      constructor(readonly url: string) {
        super(`redirect ${url}`);
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
    throw new RedirectSignal(url);
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => request.revalidated.push(path),
}));

import { SESSION_COOKIE } from "@/features/auth/server";
import { IDLE } from "@/features/auth/form-state";
import {
  applyAction,
  withdrawApplicationAction,
  deleteCvAction,
  deleteLetterAction,
  generateLetterAction,
  improveTextAction,
  saveLetterAction,
  saveProfileAction,
  uploadCvAction,
} from "./actions";
import { MAX_CV_BYTES } from "./candidate-api";
import { cvDownloadResponse } from "./cv-download";
import { EMPTY_PROFILE } from "./profile";
import { inputFromProfile } from "./profile-form";
import { loadApplicationPage, loadCandidateSpace, loadLetterPage } from "./server";

// --- Go API double ----------------------------------------------------------------------------
interface ApiCall {
  readonly url: string;
  readonly init: RequestInit;
}

let apiCalls: ApiCall[] = [];

function answer(status: number, body: unknown, headers: Record<string, string> = {}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      apiCalls.push({ url, init });
      return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
    }),
  );
}

const ok = (data: unknown) => answer(200, { success: true, data, error: null });

/** Answers each API path with its own data; unknown paths get a 404 envelope. */
function stubRoutes(routes: Record<string, unknown>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname.replace(/^\/v1/, "");
      if (!(path in routes)) {
        return new Response(JSON.stringify({ success: false, data: null, error: { code: "not_found", message: "Introuvable." } }), { status: 404 });
      }
      return new Response(JSON.stringify({ success: true, data: routes[path], error: null }), { status: 200 });
    }),
  );
}
const fail = (status: number, code: string, message: string, fields?: Record<string, string>) =>
  answer(status, { success: false, data: null, error: { code, message, ...(fields ? { fields } : {}) } });

const PROFILE_INPUT = inputFromProfile(EMPTY_PROFILE);
const APPLICATION = {
  id: "0b7c3e2a-5d4f-4a8b-9c1d-2e3f4a5b6c7d",
  companySlug: "cabinet-ndiaye",
  companyName: "Cabinet Ndiaye",
  companyCity: "Dakar",
  status: "sent",
  createdAt: "2026-09-28T10:00:00Z",
  withdrawnAt: null,
};
const CV = { fileName: "cv.pdf", sizeBytes: 8, uploadedAt: "2026-09-28T08:00:00Z" };

function cvForm(content: BlobPart[] = ["%PDF-1.7"], name = "cv.pdf"): FormData {
  const form = new FormData();
  form.set("file", new File(content, name, { type: "application/pdf" }));
  return form;
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
  request.cookies.clear();
  request.cookies.set(SESSION_COOKIE, "session-token");
  request.revalidated.length = 0;
  apiCalls = [];
  vi.stubEnv("DIEULIKO_API_URL", "http://api.test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("saveProfileAction", () => {
  it("saves for the session and returns the normalized profile", async () => {
    ok({ ...EMPTY_PROFILE, phone: "+221771234567", updatedAt: "2026-09-28T08:00:00Z" });

    const result = await saveProfileAction({ ...PROFILE_INPUT, phone: "77 123 45 67" });

    expect(result).toMatchObject({ status: "success", profile: { phone: "+221771234567" } });
    expect(apiCalls[0]?.init.headers).toMatchObject({ Authorization: "Bearer session-token", "X-Client-IP": "41.82.10.7" });
    expect(request.revalidated).toContain("/espace-candidat");
  });

  it("returns field errors from the API", async () => {
    fail(422, "validation_failed", "Certains champs sont invalides.", { "experiences.0.title": "Ce champ est obligatoire." });

    const result = await saveProfileAction(PROFILE_INPUT);

    expect(result).toMatchObject({ status: "error", fields: { "experiences.0.title": "Ce champ est obligatoire." } });
  });

  it("lets the API judge unfinished entries, such as a missing start month", async () => {
    fail(422, "validation_failed", "Certains champs sont invalides.", { "experiences.0.startMonth": "Indiquez le mois de début." });
    const unfinished = {
      ...PROFILE_INPUT,
      experiences: [{ title: "Stagiaire", organization: "Sonatel", city: "", startMonth: "", endMonth: null, description: "" }],
    };

    const result = await saveProfileAction(unfinished);

    expect(apiCalls).toHaveLength(1);
    expect(result.fields).toEqual({ "experiences.0.startMonth": "Indiquez le mois de début." });
  });

  it("rejects input that is not a profile without calling the API", async () => {
    ok(EMPTY_PROFILE);

    const result = await saveProfileAction({ headline: 42 });

    expect(result.status).toBe("error");
    expect(apiCalls).toHaveLength(0);
  });

  it("sends a lost session back to the login page", async () => {
    fail(401, "unauthenticated", "Votre session a expiré.");

    expect(await redirectOf(saveProfileAction(PROFILE_INPUT))).toBe("/connexion?next=%2Fespace-candidat%2Fprofil");
  });

  it("hides unexpected failures behind a generic message", async () => {
    answer(500, "boom");

    const result = await saveProfileAction(PROFILE_INPUT);

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/indisponible/);
  });
});

describe("uploadCvAction", () => {
  it("uploads the file and refreshes the candidate space", async () => {
    ok(CV);

    const state = await uploadCvAction(IDLE, cvForm());

    expect(state.status).toBe("success");
    expect(apiCalls[0]?.init.body).toBeInstanceOf(FormData);
    expect(request.revalidated).toContain("/espace-candidat");
  });

  it.each([
    ["no file", new FormData()],
    ["an empty file", cvForm([])],
    ["a file over 5 MB", cvForm([new Uint8Array(MAX_CV_BYTES + 1)])],
  ])("refuses %s before calling the API", async (_case, form) => {
    ok(CV);

    const state = await uploadCvAction(IDLE, form);

    expect(state.status).toBe("error");
    expect(state.fields?.file).toBeTruthy();
    expect(apiCalls).toHaveLength(0);
  });

  it("shows the API verdict on the file", async () => {
    fail(422, "validation_failed", "Certains champs sont invalides.", { file: "Le CV doit être un fichier PDF." });

    const state = await uploadCvAction(IDLE, cvForm(["PK"], "cv.docx"));

    expect(state).toMatchObject({ status: "error", fields: { file: "Le CV doit être un fichier PDF." } });
  });
});

describe("deleteCvAction", () => {
  it("deletes the CV and refreshes the candidate space", async () => {
    ok(null);

    const state = await deleteCvAction();

    expect(state.status).toBe("success");
    expect(apiCalls[0]?.init.method).toBe("DELETE");
    expect(request.revalidated).toContain("/espace-candidat");
  });
});

describe("cvDownloadResponse", () => {
  const incoming = new Request("http://localhost:3000/espace-candidat/cv");

  it("streams the PDF as a private attachment", async () => {
    answer(200, "%PDF-1.7", { "Content-Disposition": 'attachment; filename="cv.pdf"', "Content-Length": "8" });

    const response = await cvDownloadResponse(incoming);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("%PDF-1.7");
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="cv.pdf"');
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("answers 404 when the candidate has no CV", async () => {
    fail(404, "no_cv", "Vous n’avez pas encore déposé de CV.");

    expect((await cvDownloadResponse(incoming)).status).toBe(404);
  });

  it("redirects to the login page without a valid session", async () => {
    request.cookies.clear();
    const anonymous = await cvDownloadResponse(incoming);
    request.cookies.set(SESSION_COOKIE, "expired");
    fail(401, "unauthenticated", "Votre session a expiré.");
    const expired = await cvDownloadResponse(incoming);

    for (const response of [anonymous, expired]) {
      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe("http://localhost:3000/connexion?next=%2Fespace-candidat");
    }
  });

  it("answers 502 when the API fails", async () => {
    answer(500, "boom");

    expect((await cvDownloadResponse(incoming)).status).toBe(502);
  });
});

describe("loadCandidateSpace", () => {
  it("loads the profile, the CV, the letters and the applications together", async () => {
    stubRoutes({ "/me/profile": EMPTY_PROFILE, "/me/cv": CV, "/me/letters": [], "/me/applications": [APPLICATION] });

    expect(await loadCandidateSpace()).toEqual({ profile: EMPTY_PROFILE, cv: CV, letters: [], applications: [APPLICATION] });
  });

  it("returns null when the API is unavailable, so the page can degrade", async () => {
    answer(500, "boom");
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await loadCandidateSpace()).toBeNull();
  });

  it("sends a lost session back to the login page", async () => {
    fail(401, "unauthenticated", "Votre session a expiré.");

    expect(await redirectOf(loadCandidateSpace())).toBe("/connexion?next=%2Fespace-candidat");
  });
});

describe("improveTextAction", () => {
  it("returns the assistant's proposal", async () => {
    ok({ text: "Comptable rigoureuse." });

    const result = await improveTextAction({ kind: "summary", text: "comptable", title: "", organization: "" });

    expect(result).toEqual({ status: "success", text: "Comptable rigoureuse." });
    expect(apiCalls[0]?.init.headers).toMatchObject({ Authorization: "Bearer session-token" });
  });

  it("shows the assistant's own messages when it is busy or unavailable", async () => {
    fail(503, "ai_busy", "L’assistant est très sollicité en ce moment. Réessayez dans une minute.");

    const result = await improveTextAction({ kind: "summary", text: "x", title: "", organization: "" });

    expect(result).toEqual({ status: "error", message: "L’assistant est très sollicité en ce moment. Réessayez dans une minute." });
  });

  it("rejects malformed requests without calling the API", async () => {
    ok({ text: "x" });

    const result = await improveTextAction({ kind: "poem", text: 1 });

    expect(result.status).toBe("error");
    expect(apiCalls).toHaveLength(0);
  });

  it("sends a lost session back to the login page", async () => {
    fail(401, "unauthenticated", "Votre session a expiré.");

    expect(await redirectOf(improveTextAction({ kind: "summary", text: "x", title: "", organization: "" }))).toBe(
      "/connexion?next=%2Fespace-candidat%2Fprofil",
    );
  });
});

const LETTER = {
  companySlug: "cabinet-ndiaye",
  companyName: "Cabinet Ndiaye",
  companyCity: "Dakar",
  content: "Madame, Monsieur,",
  updatedAt: "2026-09-28T09:00:00Z",
};

describe("letter actions", () => {
  it("drafts a letter and refreshes the candidate space", async () => {
    ok(LETTER);

    const result = await generateLetterAction("cabinet-ndiaye");

    expect(result).toEqual({ status: "success", letter: LETTER });
    expect(apiCalls[0]?.url).toBe("http://api.test/v1/me/letters/cabinet-ndiaye/generate");
    expect(request.revalidated).toContain("/espace-candidat");
  });

  it("saves the edited letter", async () => {
    ok(LETTER);

    const result = await saveLetterAction("cabinet-ndiaye", "Ma lettre.");

    expect(result.status).toBe("success");
    expect(apiCalls[0]?.init).toMatchObject({ method: "PUT", body: JSON.stringify({ content: "Ma lettre." }) });
  });

  it("explains why a letter cannot be drafted", async () => {
    fail(422, "validation_failed", "Certains champs sont invalides.", { profile: "Complétez d’abord votre profil." });

    expect(await generateLetterAction("cabinet-ndiaye")).toEqual({ status: "error", message: "Complétez d’abord votre profil." });
  });

  it("deletes the letter", async () => {
    ok(null);

    expect((await deleteLetterAction("cabinet-ndiaye")).status).toBe("success");
    expect(apiCalls[0]?.init.method).toBe("DELETE");
  });

  it.each([
    ["a malformed slug", () => generateLetterAction("../admin")],
    ["content that is not text", () => saveLetterAction("cabinet-ndiaye", 42)],
  ])("rejects %s without calling the API", async (_case, run) => {
    ok(LETTER);

    expect((await run()).status).toBe("error");
    expect(apiCalls).toHaveLength(0);
  });

  it("sends a lost session back to the letter page", async () => {
    fail(401, "unauthenticated", "Votre session a expiré.");

    expect(await redirectOf(saveLetterAction("cabinet-ndiaye", "Ma lettre."))).toBe(
      "/connexion?next=%2Fespace-candidat%2Flettres%2Fcabinet-ndiaye",
    );
  });
});

describe("loadLetterPage", () => {
  it("loads the letter, whether the profile is ready and which experiences lack missions", async () => {
    const experience = { title: "Assistante comptable", organization: "Cabinet Ndiaye", city: "", startMonth: "2024-01", endMonth: null, description: "" };
    const elsewhere = { ...APPLICATION, id: "1c8d4f3b-6e5a-4b9c-8d2e-3f4a5b6c7d8e", companySlug: "autre-entreprise" };
    const withdrawn = { ...APPLICATION, id: "2d9e5a4c-7f6b-4c1d-9e3f-4a5b6c7d8e9f", status: "withdrawn", withdrawnAt: "2026-09-28T09:00:00Z" };
    stubRoutes({
      "/me/letters/cabinet-ndiaye": LETTER,
      "/me/profile": { ...EMPTY_PROFILE, experiences: [experience] },
      "/me/cv": CV,
      "/me/applications": [elsewhere, APPLICATION, withdrawn],
    });

    expect(await loadLetterPage("cabinet-ndiaye")).toEqual({
      letter: LETTER,
      isProfileReady: true,
      undescribedExperiences: ["Assistante comptable"],
      hasCv: true,
      application: APPLICATION,
    });
  });

  it("has no letter, CV or application yet, and an empty profile is not ready", async () => {
    stubRoutes({ "/me/profile": EMPTY_PROFILE, "/me/cv": null, "/me/applications": [] });

    expect(await loadLetterPage("cabinet-ndiaye")).toEqual({
      letter: null,
      isProfileReady: false,
      undescribedExperiences: [],
      hasCv: false,
      application: null,
    });
  });

  it("returns null when the API is unavailable", async () => {
    answer(500, "boom");
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await loadLetterPage("cabinet-ndiaye")).toBeNull();
  });
});

describe("application actions", () => {
  const DETAIL = { ...APPLICATION, snapshot: null };

  it("sends the application and refreshes the candidate space", async () => {
    answer(201, { success: true, data: DETAIL, error: null });

    const result = await applyAction("cabinet-ndiaye");

    expect(result).toEqual({ status: "success", application: DETAIL });
    expect(apiCalls[0]?.init.body).toBe(JSON.stringify({ companySlug: "cabinet-ndiaye" }));
    expect(request.revalidated).toContain("/espace-candidat");
  });

  it("explains a refusal with the API's first field message, or its message", async () => {
    fail(422, "validation_failed", "Votre candidature est incomplète.", { cv: "Ajoutez d’abord votre CV." });
    expect(await applyAction("cabinet-ndiaye")).toEqual({ status: "error", message: "Ajoutez d’abord votre CV." });

    fail(409, "already_applied", "Vous avez déjà une candidature en cours.");
    expect(await applyAction("cabinet-ndiaye")).toEqual({ status: "error", message: "Vous avez déjà une candidature en cours." });
  });

  it("rejects a malformed slug or id without calling the API", async () => {
    answer(200, { success: true, data: null, error: null });

    expect((await applyAction("../admin")).status).toBe("error");
    expect((await withdrawApplicationAction("pas-un-uuid")).status).toBe("error");
    expect(apiCalls).toHaveLength(0);
  });

  it("withdraws an application", async () => {
    ok(null);

    const result = await withdrawApplicationAction(APPLICATION.id);

    expect(result.status).toBe("success");
    expect(apiCalls[0]?.url).toBe(`http://api.test/v1/me/applications/${APPLICATION.id}/withdraw`);
    expect(request.revalidated).toContain("/espace-candidat");
  });

  it("sends a lost session back to the letter page", async () => {
    fail(401, "unauthenticated", "Votre session a expiré.");

    expect(await redirectOf(applyAction("cabinet-ndiaye"))).toBe("/connexion?next=%2Fespace-candidat%2Flettres%2Fcabinet-ndiaye");
  });
});

describe("loadApplicationPage", () => {
  it("loads one application, or reports it missing", async () => {
    stubRoutes({ [`/me/applications/${APPLICATION.id}`]: { ...APPLICATION, snapshot: null } });
    expect(await loadApplicationPage(APPLICATION.id)).toEqual({ application: { ...APPLICATION, snapshot: null } });

    expect(await loadApplicationPage("1c8d4f3b-6e5a-4b9c-8d2e-3f4a5b6c7d8e")).toEqual({ application: null });
    expect(await loadApplicationPage("pas-un-uuid")).toEqual({ application: null });
  });

  it("returns null when the API is unavailable", async () => {
    answer(500, "boom");
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await loadApplicationPage(APPLICATION.id)).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "@/lib/api-client";
import { createCandidateApi } from "./candidate-api";
import { EMPTY_PROFILE } from "./profile";
import { inputFromProfile } from "./profile-form";

const CONTEXT = { bearer: "session-token", clientIp: "41.82.10.7" };
const CV = { fileName: "CV Awa Diop.pdf", sizeBytes: 125, uploadedAt: "2026-09-28T07:49:17Z" };

function apiReturning(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  });
  const api = createCandidateApi(createApiClient("http://api.test", { fetchImpl: fetchImpl as unknown as typeof fetch }));
  return { api, calls };
}

const envelope = (data: unknown) => ({ success: true, data, error: null });

describe("createCandidateApi", () => {
  it("reads the profile for the session", async () => {
    const { api, calls } = apiReturning(200, envelope(EMPTY_PROFILE));

    const profile = await api.getProfile(CONTEXT);

    expect(profile).toEqual(EMPTY_PROFILE);
    expect(calls[0]).toMatchObject({ url: "http://api.test/v1/me/profile", init: { method: "GET" } });
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: "Bearer session-token" });
  });

  it("saves the whole profile with PUT and returns the normalized one", async () => {
    const saved = { ...EMPTY_PROFILE, phone: "+221771234567", updatedAt: "2026-09-28T08:00:00Z" };
    const { api, calls } = apiReturning(200, envelope(saved));
    const input = inputFromProfile({ ...EMPTY_PROFILE, phone: "77 123 45 67" });

    const profile = await api.saveProfile(input, CONTEXT);

    expect(profile.phone).toBe("+221771234567");
    expect(calls[0]?.init).toMatchObject({ method: "PUT", body: JSON.stringify(input) });
  });

  it("reads CV metadata, null when there is none", async () => {
    expect(await apiReturning(200, envelope(CV)).api.getCv(CONTEXT)).toEqual(CV);
    expect(await apiReturning(200, envelope(null)).api.getCv(CONTEXT)).toBeNull();
  });

  it("uploads the CV as a multipart file part", async () => {
    const { api, calls } = apiReturning(200, envelope(CV));
    const file = new File(["%PDF-1.7"], "CV Awa Diop.pdf", { type: "application/pdf" });

    await api.uploadCv(file, CONTEXT);

    const body = calls[0]?.init.body;
    expect(calls[0]?.init.method).toBe("PUT");
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("deletes the CV and downloads it as a raw response", async () => {
    const deletion = apiReturning(200, envelope(null));
    await deletion.api.deleteCv(CONTEXT);
    expect(deletion.calls[0]).toMatchObject({ url: "http://api.test/v1/me/cv", init: { method: "DELETE" } });

    const download = apiReturning(200, "%PDF-1.7");
    const response = await download.api.downloadCv(CONTEXT);
    expect(await response?.text()).toBe("%PDF-1.7");
    expect(download.calls[0]?.url).toBe("http://api.test/v1/me/cv/file");
  });

  it("asks the assistant to rewrite a text", async () => {
    const { api, calls } = apiReturning(200, envelope({ text: "Texte amélioré." }));
    const input = { kind: "experience" as const, text: "saisie", title: "Comptable", organization: "Cabinet" };

    const text = await api.rewrite(input, CONTEXT);

    expect(text).toBe("Texte amélioré.");
    expect(calls[0]).toMatchObject({ url: "http://api.test/v1/me/assist/rewrite", init: { method: "POST", body: JSON.stringify(input) } });
  });

  it("surfaces validation errors with their field paths", async () => {
    const { api } = apiReturning(422, {
      success: false,
      data: null,
      error: { code: "validation_failed", message: "Certains champs sont invalides.", fields: { "experiences.0.title": "Ce champ est obligatoire." } },
    });
    const input = inputFromProfile(EMPTY_PROFILE);

    await expect(api.saveProfile(input, CONTEXT)).rejects.toMatchObject({
      code: "validation_failed",
      fields: { "experiences.0.title": "Ce champ est obligatoire." },
    });
  });
});

const LETTER = {
  companySlug: "cabinet-ndiaye",
  companyName: "Cabinet Ndiaye",
  companyCity: "Dakar",
  content: "Madame, Monsieur,",
  updatedAt: "2026-09-28T09:00:00Z",
};

describe("cover letters", () => {
  it("lists, reads, drafts, saves and deletes letters for the session", async () => {
    const list = apiReturning(200, envelope([LETTER]));
    expect(await list.api.listLetters(CONTEXT)).toEqual([LETTER]);
    expect(list.calls[0]?.url).toBe("http://api.test/v1/me/letters");

    const read = apiReturning(200, envelope(LETTER));
    expect(await read.api.getLetter("cabinet-ndiaye", CONTEXT)).toEqual(LETTER);
    expect(read.calls[0]?.url).toBe("http://api.test/v1/me/letters/cabinet-ndiaye");

    const draft = apiReturning(200, envelope(LETTER));
    await draft.api.generateLetter("cabinet-ndiaye", CONTEXT);
    expect(draft.calls[0]).toMatchObject({ url: "http://api.test/v1/me/letters/cabinet-ndiaye/generate", init: { method: "POST" } });

    const save = apiReturning(200, envelope(LETTER));
    await save.api.saveLetter("cabinet-ndiaye", "Ma lettre.", CONTEXT);
    expect(save.calls[0]?.init).toMatchObject({ method: "PUT", body: JSON.stringify({ content: "Ma lettre." }) });

    const removal = apiReturning(200, envelope(null));
    await removal.api.deleteLetter("cabinet-ndiaye", CONTEXT);
    expect(removal.calls[0]?.init.method).toBe("DELETE");
  });

  it("reads a missing letter as null", async () => {
    const { api } = apiReturning(404, { success: false, data: null, error: { code: "no_letter", message: "Pas de lettre." } });

    expect(await api.getLetter("cabinet-ndiaye", CONTEXT)).toBeNull();
  });

  it("escapes the slug in paths", async () => {
    const { api, calls } = apiReturning(200, envelope(LETTER));

    await api.getLetter("a/../b", CONTEXT);

    expect(calls[0]?.url).toBe("http://api.test/v1/me/letters/a%2F..%2Fb");
  });
});

const APPLICATION = {
  id: "0b7c3e2a-5d4f-4a8b-9c1d-2e3f4a5b6c7d",
  companySlug: "cabinet-ndiaye",
  companyName: "Cabinet Ndiaye",
  companyCity: "Dakar",
  status: "sent",
  createdAt: "2026-09-28T10:00:00Z",
  withdrawnAt: null,
};

const SNAPSHOT = {
  firstName: "Awa",
  lastName: "Diop",
  email: "awa@example.sn",
  profile: { ...inputFromProfile(EMPTY_PROFILE), headline: "Comptable" },
  letter: "Madame, Monsieur,",
  cvFileName: "cv.pdf",
  cvSizeBytes: 125,
};

describe("applications", () => {
  it("sends an application for a company and lists them", async () => {
    const sent = apiReturning(201, envelope({ ...APPLICATION, snapshot: SNAPSHOT }));
    const detail = await sent.api.apply("cabinet-ndiaye", CONTEXT);
    expect(detail.snapshot?.letter).toBe("Madame, Monsieur,");
    expect(sent.calls[0]).toMatchObject({
      url: "http://api.test/v1/me/applications",
      init: { method: "POST", body: JSON.stringify({ companySlug: "cabinet-ndiaye" }) },
    });

    const list = apiReturning(200, envelope([APPLICATION]));
    expect(await list.api.listApplications(CONTEXT)).toEqual([APPLICATION]);
  });

  it("reads a withdrawn application without its snapshot, and a missing one as null", async () => {
    const withdrawn = { ...APPLICATION, status: "withdrawn", withdrawnAt: "2026-09-28T11:00:00Z", snapshot: null };
    const read = apiReturning(200, envelope(withdrawn));
    expect(await read.api.getApplication(APPLICATION.id, CONTEXT)).toEqual(withdrawn);
    expect(read.calls[0]?.url).toBe(`http://api.test/v1/me/applications/${APPLICATION.id}`);

    const missing = apiReturning(404, { success: false, data: null, error: { code: "not_found", message: "Introuvable." } });
    expect(await missing.api.getApplication(APPLICATION.id, CONTEXT)).toBeNull();
  });

  it("withdraws an application", async () => {
    const { api, calls } = apiReturning(200, envelope(null));

    await api.withdrawApplication(APPLICATION.id, CONTEXT);

    expect(calls[0]).toMatchObject({ url: `http://api.test/v1/me/applications/${APPLICATION.id}/withdraw`, init: { method: "POST" } });
  });

  it("surfaces the API's refusal codes", async () => {
    const { api } = apiReturning(409, { success: false, data: null, error: { code: "already_applied", message: "Déjà envoyée." } });

    await expect(api.apply("cabinet-ndiaye", CONTEXT)).rejects.toMatchObject({ code: "already_applied" });
  });
});

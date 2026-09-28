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

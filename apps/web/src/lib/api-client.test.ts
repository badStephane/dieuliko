import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, DEFAULT_REVALIDATE_SECONDS, createApiClient, parseApiData, requireResponse } from "./api-client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function recordingFetch(response: () => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return response();
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const ok = () => jsonResponse(200, { success: true, data: { ok: true }, error: null });

describe("createApiClient", () => {
  it("caches anonymous GETs and adds the internal token", async () => {
    const { fetchImpl, calls } = recordingFetch(ok);

    await createApiClient("http://api.test/", { token: "s3cret", fetchImpl }).get("/sectors", { params: { a: "1" } });

    expect(calls[0]?.url).toBe("http://api.test/v1/sectors?a=1");
    expect(calls[0]?.init).toMatchObject({
      method: "GET",
      next: { revalidate: DEFAULT_REVALIDATE_SECONDS },
      headers: { "X-Internal-Token": "s3cret" },
    });
  });

  it("never caches requests made for a user and relays the session and visitor IP", async () => {
    const { fetchImpl, calls } = recordingFetch(ok);

    await createApiClient("http://api.test", { fetchImpl }).get("/auth/me", { bearer: "tok", clientIp: "41.82.10.7" });

    expect(calls[0]?.init).toMatchObject({
      cache: "no-store",
      headers: { Authorization: "Bearer tok", "X-Client-IP": "41.82.10.7" },
    });
    expect(calls[0]?.init).not.toHaveProperty("next");
  });

  it("POSTs JSON without caching", async () => {
    const { fetchImpl, calls } = recordingFetch(ok);

    const response = await createApiClient("http://api.test", { fetchImpl }).post("/auth/login", { email: "a@b.sn" });

    expect(response.data).toEqual({ ok: true });
    expect(calls[0]?.init).toMatchObject({
      method: "POST",
      cache: "no-store",
      body: '{"email":"a@b.sn"}',
      headers: { "Content-Type": "application/json" },
    });
  });

  it("returns null for a GET 404 but throws for a POST 404", async () => {
    const notFound = () =>
      jsonResponse(404, { success: false, data: null, error: { code: "not_found", message: "Introuvable." } });
    const { fetchImpl } = recordingFetch(notFound);
    const client = createApiClient("http://api.test", { fetchImpl });

    expect(await client.get("/companies/x")).toBeNull();
    await expect(client.post("/nowhere")).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("exposes the API error code, message and field errors", async () => {
    const { fetchImpl } = recordingFetch(() =>
      jsonResponse(422, {
        success: false,
        data: null,
        error: { code: "validation_failed", message: "Certains champs sont invalides.", fields: { email: "Invalide." } },
      }),
    );

    const failure = createApiClient("http://api.test", { fetchImpl }).post("/auth/register", {});

    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({
      status: 422,
      code: "validation_failed",
      message: "Certains champs sont invalides.",
      fields: { email: "Invalide." },
    });
  });

  it("reports an unreachable API as unavailable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    await expect(createApiClient("http://api.test", { fetchImpl }).get("/x")).rejects.toMatchObject({
      status: 0,
      code: "unavailable",
    });
  });

  it("rejects answers that are not envelopes", async () => {
    for (const response of [() => new Response("<html>", { status: 502 }), () => jsonResponse(200, { data: 1 })]) {
      const { fetchImpl } = recordingFetch(response);
      await expect(createApiClient("http://api.test", { fetchImpl }).get("/x")).rejects.toMatchObject({
        code: "invalid_response",
      });
    }
  });
});

describe("parseApiData / requireResponse", () => {
  const response = { data: { n: 1 }, meta: { total: 2 }, status: 200 };

  it("validates data or another part of the response", () => {
    expect(parseApiData(z.object({ n: z.number() }), response, "thing")).toEqual({ n: 1 });
    expect(parseApiData(z.object({ total: z.number() }), response, "meta", response.meta)).toEqual({ total: 2 });
    expect(() => parseApiData(z.string(), response, "thing")).toThrow(/Invalid thing/);
  });

  it("treats a missing response as not found", () => {
    expect(requireResponse(response, "/x")).toBe(response);
    expect(() => requireResponse(null, "/x")).toThrow(ApiError);
  });
});

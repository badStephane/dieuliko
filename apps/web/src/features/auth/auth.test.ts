import { describe, expect, it, vi } from "vitest";
import { ApiError, type ApiClient, type ApiResponse } from "@/lib/api-client";
import { createAuthApi } from "./auth-api";
import { errorState, formText, IDLE } from "./form-state";
import { CANDIDATE_HOME_PATH, loginHref, safeNextPath } from "./redirects";

const USER = {
  id: "2db42e29-e9c9-4a16-9a58-74856f9aecf1",
  email: "awa@example.sn",
  role: "candidate",
  firstName: "Awa",
  lastName: "Diop",
  emailVerified: false,
  createdAt: "2026-09-27T16:22:19.238343Z",
};
const SESSION = { token: "tok", expiresAt: "2026-10-27T16:22:19Z" };

function response(data: unknown): ApiResponse {
  return { data, meta: undefined, status: 200 };
}

/** ApiClient double recording calls; `post`/`get` answers are configurable per test. */
function fakeClient(answers: { post?: () => Promise<ApiResponse>; get?: () => Promise<ApiResponse | null> } = {}) {
  const post = vi.fn(answers.post ?? (async () => response(null)));
  const get = vi.fn(answers.get ?? (async () => null));
  return { client: { post, get } as unknown as ApiClient, post, get };
}

describe("createAuthApi", () => {
  it("signs up and parses the user and session", async () => {
    const { client, post } = fakeClient({ post: async () => response({ user: USER, session: SESSION }) });
    const input = { email: "awa@example.sn", password: "correct horse", firstName: "Awa", lastName: "Diop" };

    const result = await createAuthApi(client).signUp(input, { clientIp: "41.82.10.7" });

    expect(post).toHaveBeenCalledWith("/auth/register", input, { clientIp: "41.82.10.7" });
    expect(result.user.firstName).toBe("Awa");
    expect(result.session.expiresAt).toEqual(new Date("2026-10-27T16:22:19Z"));
  });

  it("logs in with credentials", async () => {
    const { client, post } = fakeClient({ post: async () => response({ user: USER, session: SESSION }) });

    await createAuthApi(client).logIn("awa@example.sn", "pw", {});

    expect(post).toHaveBeenCalledWith("/auth/login", { email: "awa@example.sn", password: "pw" }, {});
  });

  it("rejects malformed auth results", async () => {
    const { client } = fakeClient({ post: async () => response({ user: { ...USER, role: "superuser" }, session: SESSION }) });

    await expect(createAuthApi(client).logIn("a@b.sn", "pw", {})).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("returns the current user only for a valid session", async () => {
    const valid = fakeClient({ get: async () => response(USER) });
    const expired = fakeClient({
      get: async () => {
        throw new ApiError("Votre session a expiré.", 401, "unauthenticated");
      },
    });
    const down = fakeClient({
      get: async () => {
        throw new ApiError("down", 0, "unavailable");
      },
    });

    expect(await createAuthApi(valid.client).currentUser({ bearer: "tok" })).toMatchObject({ email: "awa@example.sn" });
    expect(await createAuthApi(valid.client).currentUser({})).toBeNull();
    expect(valid.get).toHaveBeenCalledTimes(1);
    expect(await createAuthApi(expired.client).currentUser({ bearer: "old" })).toBeNull();
    await expect(createAuthApi(down.client).currentUser({ bearer: "tok" })).rejects.toMatchObject({ code: "unavailable" });
  });

  it("calls the email and password endpoints", async () => {
    const { client, post } = fakeClient();
    const api = createAuthApi(client);
    const context = { bearer: "tok" };

    await api.logOut(context);
    await api.resendVerification(context);
    await api.verifyEmail("v", {});
    await api.requestPasswordReset("awa@example.sn", {});
    await api.resetPassword("r", "new secret", {});

    expect(post.mock.calls).toEqual([
      ["/auth/logout", undefined, context],
      ["/auth/email/verification", undefined, context],
      ["/auth/email/verify", { token: "v" }, {}],
      ["/auth/password/forgot", { email: "awa@example.sn" }, {}],
      ["/auth/password/reset", { token: "r", password: "new secret" }, {}],
    ]);
  });
});

describe("errorState", () => {
  it("shows user-facing API messages with field errors and keeps submitted values", () => {
    const error = new ApiError("Certains champs sont invalides.", 422, "validation_failed", { email: "Invalide." });

    expect(errorState(error, { email: "x" })).toEqual({
      status: "error",
      message: "Certains champs sont invalides.",
      fields: { email: "Invalide." },
      values: { email: "x" },
    });
  });

  it("hides technical failures behind a generic message", () => {
    for (const error of [new ApiError("GET x failed with 500", 500, "internal_error"), new Error("boom"), "weird"]) {
      const state = errorState(error);
      expect(state.status).toBe("error");
      expect(state.message).toMatch(/momentanément indisponible/);
      expect(state.fields).toBeUndefined();
    }
  });

  it("starts idle", () => {
    expect(IDLE).toEqual({ status: "idle" });
  });
});

describe("formText", () => {
  it("reads text fields and ignores files or missing ones", () => {
    const form = new FormData();
    form.set("email", "awa@example.sn");
    form.set("file", new Blob(["x"]));

    expect(formText(form, "email")).toBe("awa@example.sn");
    expect(formText(form, "file")).toBe("");
    expect(formText(form, "missing")).toBe("");
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/entreprises/auchan?x=1#top")).toBe("/entreprises/auchan?x=1#top");
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/ok\n//evil",
    `/${"a".repeat(600)}`,
  ])("falls back to the candidate space for %j", (raw) => {
    expect(safeNextPath(raw)).toBe(CANDIDATE_HOME_PATH);
  });

  it("builds login links that return to a page", () => {
    expect(loginHref("/espace-candidat")).toBe("/connexion?next=%2Fespace-candidat");
  });
});

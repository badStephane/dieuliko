import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Next.js request APIs, replaced by in-memory doubles --------------------------------------
interface CookieCall {
  readonly name: string;
  readonly value: string;
  readonly options: Record<string, unknown>;
}

const request = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  setCalls: [] as CookieCall[],
  deleted: [] as string[],
  headers: new Headers(),
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
    set: (name: string, value: string, options: Record<string, unknown>) => {
      request.setCalls.push({ name, value, options });
      request.cookies.set(name, value);
    },
    delete: (name: string) => {
      request.deleted.push(name);
      request.cookies.delete(name);
    },
  }),
  headers: async () => request.headers,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

import {
  forgotPasswordAction,
  logInAction,
  logOutAction,
  resendVerificationAction,
  resetPasswordAction,
  signUpAction,
  verifyEmailAction,
} from "./actions";
import { IDLE } from "./form-state";
import { getCurrentUser, requireUser, SESSION_COOKIE, visitorIpFrom } from "./server";

// --- Go API double ----------------------------------------------------------------------------
const USER = {
  id: "2db42e29-e9c9-4a16-9a58-74856f9aecf1",
  email: "awa@example.sn",
  role: "candidate",
  firstName: "Awa",
  lastName: "Diop",
  emailVerified: true,
  createdAt: "2026-09-27T16:22:19Z",
};
const AUTH_RESULT = { user: USER, session: { token: "session-token", expiresAt: "2026-10-27T16:22:19Z" } };

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

const ok = (data: unknown) => answer(200, { success: true, data, error: null });
const fail = (status: number, code: string, message: string, fields?: Record<string, string>) =>
  answer(status, { success: false, data: null, error: { code, message, ...(fields ? { fields } : {}) } });

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
  request.cookies.clear();
  request.setCalls.length = 0;
  request.deleted.length = 0;
  request.headers = new Headers({ "x-real-ip": "41.82.10.7" });
  apiCalls = [];
  vi.stubEnv("DIEULIKO_API_URL", "http://api.test");
  vi.stubEnv("DIEULIKO_API_TOKEN", "internal-secret");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("visitorIpFrom", () => {
  it.each([
    [{ "x-real-ip": "41.82.10.7", "x-forwarded-for": "6.6.6.6, 41.82.10.7" }, "41.82.10.7"],
    [{ "x-forwarded-for": "6.6.6.6, 41.82.10.7" }, "41.82.10.7"],
    [{ "x-forwarded-for": "not-an-ip" }, undefined],
    [{}, undefined],
  ])("reads %j as %s (client-supplied hops are ignored)", (values, expected) => {
    expect(visitorIpFrom(new Headers(values))).toBe(expected);
  });
});

describe("signUpAction", () => {
  it("stores a hardened session cookie and redirects to a safe destination", async () => {
    ok(AUTH_RESULT);
    const submitted = { firstName: "Awa", lastName: "Diop", email: "awa@example.sn", password: "correct horse" };

    const destination = await redirectOf(signUpAction(IDLE, form({ ...submitted, next: "//evil.example" })));

    expect(destination).toBe("/espace-candidat");
    expect(request.setCalls).toEqual([
      {
        name: SESSION_COOKIE,
        value: "session-token",
        options: { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: new Date("2026-10-27T16:22:19Z") },
      },
    ]);
    expect(apiCalls[0]?.url).toBe("http://api.test/v1/auth/register");
    expect(apiCalls[0]?.init.headers).toMatchObject({ "X-Client-IP": "41.82.10.7", "X-Internal-Token": "internal-secret" });
    expect(JSON.parse(String(apiCalls[0]?.init.body))).toEqual(submitted);
  });

  it("creates a company account and sends it to the company space", async () => {
    ok({ ...AUTH_RESULT, user: { ...USER, role: "company" } });
    const submitted = { firstName: "Awa", lastName: "Diop", email: "rh@sonatel.sn", password: "correct horse" };

    const destination = await redirectOf(signUpAction(IDLE, form({ ...submitted, accountType: "company", next: "//evil.example" })));

    expect(destination).toBe("/espace-entreprise");
    expect(JSON.parse(String(apiCalls[0]?.init.body))).toEqual({ ...submitted, accountType: "company" });
  });

  it("returns field errors and the submitted values, never the password", async () => {
    fail(422, "validation_failed", "Certains champs sont invalides.", { email: "Invalide." });

    const state = await signUpAction(IDLE, form({ firstName: "Awa", lastName: "", email: "x", password: "secret-value" }));

    expect(state).toEqual({
      status: "error",
      message: "Certains champs sont invalides.",
      fields: { email: "Invalide." },
      values: { firstName: "Awa", lastName: "", email: "x" },
    });
    expect(JSON.stringify(state)).not.toContain("secret-value");
    expect(request.setCalls).toHaveLength(0);
  });
});

describe("logInAction", () => {
  it("logs in and returns to the requested page", async () => {
    ok(AUTH_RESULT);

    const destination = await redirectOf(
      logInAction(IDLE, form({ email: "awa@example.sn", password: "pw", next: "/entreprises/x" })),
    );

    expect(destination).toBe("/entreprises/x");
    expect(request.cookies.get(SESSION_COOKIE)).toBe("session-token");
  });

  it("shows the API message for wrong credentials", async () => {
    fail(401, "invalid_credentials", "Email ou mot de passe incorrect.");

    const state = await logInAction(IDLE, form({ email: "awa@example.sn", password: "bad" }));

    expect(state).toMatchObject({
      status: "error",
      message: "Email ou mot de passe incorrect.",
      values: { email: "awa@example.sn" },
    });
  });

  it("reports a missing API configuration as unavailable", async () => {
    vi.stubEnv("DIEULIKO_API_URL", "");

    const state = await logInAction(IDLE, form({ email: "awa@example.sn", password: "pw" }));

    expect(state.message).toMatch(/momentanément indisponible/);
  });
});

describe("logOutAction", () => {
  it("revokes the session and clears the cookie", async () => {
    request.cookies.set(SESSION_COOKIE, "session-token");
    ok(null);

    expect(await redirectOf(logOutAction())).toBe("/");
    expect(apiCalls[0]?.init.headers).toMatchObject({ Authorization: "Bearer session-token" });
    expect(request.deleted).toEqual([SESSION_COOKIE]);
  });

  it("clears the cookie even when the API is unreachable", async () => {
    request.cookies.set(SESSION_COOKIE, "session-token");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));

    expect(await redirectOf(logOutAction())).toBe("/");
    expect(request.deleted).toEqual([SESSION_COOKIE]);
  });
});

describe("email and password actions", () => {
  it("always confirms a reset request with the same neutral message", async () => {
    ok(null);

    const state = await forgotPasswordAction(IDLE, form({ email: "whoever@example.sn" }));

    expect(state).toEqual({ status: "success", message: expect.stringMatching(/^Si un compte existe/) });
  });

  it("reports throttled reset requests", async () => {
    fail(429, "rate_limited", "Trop de tentatives.");

    expect(await forgotPasswordAction(IDLE, form({ email: "a@b.sn" }))).toMatchObject({
      status: "error",
      message: "Trop de tentatives.",
    });
  });

  it("resets the password, drops the revoked session and goes to the login page", async () => {
    request.cookies.set(SESSION_COOKIE, "revoked");
    ok(null);

    const destination = await redirectOf(resetPasswordAction(IDLE, form({ token: "t", password: "new secret" })));

    expect(destination).toBe("/connexion?reinitialise=1");
    expect(request.deleted).toEqual([SESSION_COOKIE]);
  });

  it("explains expired reset links", async () => {
    fail(400, "invalid_token", "Ce lien est invalide ou a expiré.");

    expect(await resetPasswordAction(IDLE, form({ token: "t", password: "new secret" }))).toMatchObject({
      message: "Ce lien est invalide ou a expiré.",
    });
  });

  it("verifies an email address on click", async () => {
    ok(null);

    expect(await verifyEmailAction(IDLE, form({ token: "v" }))).toMatchObject({ status: "success" });
    expect(JSON.parse(String(apiCalls[0]?.init.body))).toEqual({ token: "v" });

    fail(400, "invalid_token", "Ce lien est invalide ou a expiré.");
    expect(await verifyEmailAction(IDLE, form({ token: "v" }))).toMatchObject({ status: "error" });
  });

  it("resends the verification link for the logged-in user", async () => {
    request.cookies.set(SESSION_COOKIE, "session-token");
    ok(null);

    expect(await resendVerificationAction()).toMatchObject({ status: "success" });
    expect(apiCalls[0]?.init.headers).toMatchObject({ Authorization: "Bearer session-token" });

    fail(503, "email_delivery_failed", "L’email n’a pas pu être envoyé.");
    expect(await resendVerificationAction()).toMatchObject({ status: "error", message: "L’email n’a pas pu être envoyé." });
  });
});

describe("current user", () => {
  it("is null without a session cookie, without calling the API", async () => {
    ok(USER);

    expect(await getCurrentUser()).toBeNull();
    expect(apiCalls).toHaveLength(0);
  });

  it("is resolved from the session cookie", async () => {
    request.cookies.set(SESSION_COOKIE, "session-token");
    ok(USER);

    expect(await getCurrentUser()).toMatchObject({ email: "awa@example.sn" });
  });

  it("sends logged-out visitors to the login page, then back", async () => {
    expect(await redirectOf(requireUser("/espace-candidat"))).toBe("/connexion?next=%2Fespace-candidat");
  });
});

import { z } from "zod";
import { ApiError, parseApiData, type ApiClient, type RequestOptions } from "@/lib/api-client";

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: z.enum(["candidate", "admin", "company"]),
  firstName: z.string(),
  lastName: z.string(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
});

export type User = z.infer<typeof userSchema>;

const sessionSchema = z.object({ token: z.string().min(1), expiresAt: z.coerce.date() });

const authResultSchema = z.object({ user: userSchema, session: sessionSchema });

export type AuthResult = z.infer<typeof authResultSchema>;

export interface SignUpInput {
  readonly email: string;
  readonly password: string;
  readonly firstName: string;
  readonly lastName: string;
  /** "company" opens a company account; left out, the account is a candidate's. */
  readonly accountType?: "company";
}

/** Calls to `/v1/auth`. `context` carries the visitor IP (rate limiting) and, when logged in, the session. */
export interface AuthApi {
  signUp(input: SignUpInput, context: RequestOptions): Promise<AuthResult>;
  logIn(email: string, password: string, context: RequestOptions): Promise<AuthResult>;
  logOut(context: RequestOptions): Promise<void>;
  /** The session's user, or null when the session is missing, expired or revoked. */
  currentUser(context: RequestOptions): Promise<User | null>;
  resendVerification(context: RequestOptions): Promise<void>;
  verifyEmail(token: string, context: RequestOptions): Promise<void>;
  requestPasswordReset(email: string, context: RequestOptions): Promise<void>;
  resetPassword(token: string, password: string, context: RequestOptions): Promise<void>;
}

export function createAuthApi(client: ApiClient): AuthApi {
  return {
    async signUp(input, context) {
      return parseApiData(authResultSchema, await client.post("/auth/register", input, context), "sign-up result");
    },
    async logIn(email, password, context) {
      return parseApiData(authResultSchema, await client.post("/auth/login", { email, password }, context), "login result");
    },
    async logOut(context) {
      await client.post("/auth/logout", undefined, context);
    },
    async currentUser(context) {
      if (!context.bearer) return null;
      try {
        const response = await client.get("/auth/me", context);
        return response ? parseApiData(userSchema, response, "user") : null;
      } catch (error: unknown) {
        if (error instanceof ApiError && error.code === "unauthenticated") return null;
        throw error;
      }
    },
    async resendVerification(context) {
      await client.post("/auth/email/verification", undefined, context);
    },
    async verifyEmail(token, context) {
      await client.post("/auth/email/verify", { token }, context);
    },
    async requestPasswordReset(email, context) {
      await client.post("/auth/password/forgot", { email }, context);
    },
    async resetPassword(token, password, context) {
      await client.post("/auth/password/reset", { token, password }, context);
    },
  };
}

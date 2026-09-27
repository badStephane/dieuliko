import { z } from "zod";

/**
 * Failure reported by the Go API. `code` comes from its error envelope ("invalid_response" when the
 * answer could not be understood, "unavailable" when the API could not be reached); `fields` maps form
 * fields to French messages on validation failures.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly fields: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Fetch = typeof fetch;

export interface ApiClientOptions {
  /** Shared secret identifying the Next.js server to the API (never expose it to browsers). */
  readonly token?: string;
  /** Next.js data cache lifetime of anonymous GET requests. */
  readonly revalidateSeconds?: number;
  readonly fetchImpl?: Fetch;
}

export interface RequestOptions {
  readonly params?: Readonly<Record<string, string>>;
  /** Session token of the user the request is made for. Such requests are never cached. */
  readonly bearer?: string;
  /** IP of the visitor, relayed so the API can rate-limit per person rather than per server. */
  readonly clientIp?: string;
}

export interface ApiResponse {
  readonly data: unknown;
  readonly meta: unknown;
  readonly status: number;
}

export interface ApiClient {
  /** GET returning the envelope, or `null` on 404. */
  get(path: string, options?: RequestOptions): Promise<ApiResponse | null>;
  /** POST a JSON body; every non-2xx answer throws an ApiError. */
  post(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse>;
}

/** Directory data changes rarely; profiles are refreshed daily (a shorter fetch lifetime would lower it). */
export const DEFAULT_REVALIDATE_SECONDS = 86400;

const successEnvelopeSchema = z.object({ success: z.literal(true), data: z.unknown(), meta: z.unknown().optional() });
const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string(), message: z.string(), fields: z.record(z.string(), z.string()).optional() }),
});

interface RawResult {
  readonly url: string;
  readonly response: Response;
  readonly payload: unknown;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toApiResponse(method: string, { url, response, payload }: RawResult): ApiResponse {
  if (!response.ok) {
    const failure = errorEnvelopeSchema.safeParse(payload);
    if (!failure.success) throw new ApiError(`${method} ${url} failed with ${response.status}`, response.status, "invalid_response");
    const { code, message, fields } = failure.data.error;
    throw new ApiError(message, response.status, code, fields);
  }
  const success = successEnvelopeSchema.safeParse(payload);
  if (!success.success) throw new ApiError(`${method} ${url} returned an invalid envelope`, response.status, "invalid_response");
  return { data: success.data.data, meta: success.data.meta, status: response.status };
}

export function createApiClient(baseUrl: string, options: ApiClientOptions = {}): ApiClient {
  const { token, revalidateSeconds = DEFAULT_REVALIDATE_SECONDS, fetchImpl = fetch } = options;
  const root = `${baseUrl.replace(/\/+$/, "")}/v1`;

  function headersFor(request: RequestOptions, hasBody: boolean): Record<string, string> {
    return {
      Accept: "application/json",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "X-Internal-Token": token } : {}),
      ...(request.bearer ? { Authorization: `Bearer ${request.bearer}` } : {}),
      ...(request.clientIp ? { "X-Client-IP": request.clientIp } : {}),
    };
  }

  async function send(method: "GET" | "POST", path: string, body: unknown, request: RequestOptions): Promise<RawResult> {
    const search = new URLSearchParams(request.params ?? {}).toString();
    const url = `${root}${path}${search ? `?${search}` : ""}`;
    const cacheable = method === "GET" && !request.bearer;
    const init: RequestInit = {
      method,
      headers: headersFor(request, body !== undefined),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(cacheable ? { next: { revalidate: revalidateSeconds } } : { cache: "no-store" }),
    };
    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch (error: unknown) {
      throw new ApiError(`${method} ${url} failed: ${describe(error)}`, 0, "unavailable");
    }
    const payload: unknown = await response.json().catch(() => null);
    return { url, response, payload };
  }

  return {
    async get(path, request = {}) {
      const result = await send("GET", path, undefined, request);
      return result.response.status === 404 ? null : toApiResponse("GET", result);
    },
    async post(path, body, request = {}) {
      return toApiResponse("POST", await send("POST", path, body, request));
    },
  };
}

/** Validates `response.data` (or another part of the response via `value`) against a schema. */
export function parseApiData<T>(schema: z.ZodType<T>, response: ApiResponse, what: string, value: unknown = response.data): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ApiError(`Invalid ${what} from API at ${issue?.path.join(".")}: ${issue?.message}`, response.status, "invalid_response");
  }
  return result.data;
}

/** Throws when an endpoint that always exists answers 404. */
export function requireResponse(response: ApiResponse | null, path: string): ApiResponse {
  if (!response) throw new ApiError(`GET ${path} returned 404`, 404, "not_found");
  return response;
}

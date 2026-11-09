// ApiError and the problem+json parser (backend decision 028). Every failed call, on the server or in the browser,
// becomes one ApiError that keeps what screens need: the error `code` (translate by code: the API's text is English
// only), each field error's `code`, the extension members and the request id to show on error screens.
// Safe to import anywhere.

export type FieldError = {
  /** Dotted path from the API (`imeis.0`, `inputs.model`, `email`), or `body` / `query` for a whole-input issue. */
  field: string;
  /** A zod issue code (`too_small`, `invalid_type` …) or a business word (`WEAK_PASSWORD`, `not_available` …). */
  code: string;
  /** The API's English message: a fallback only, screens translate by `code`. */
  message: string;
};

export type ApiErrorInit = {
  status: number;
  code?: string;
  title?: string;
  detail?: string;
  fieldErrors?: FieldError[];
  requestId?: string;
  retryAfter?: number;
  extensions?: Record<string, unknown>;
  cause?: unknown;
};

const KNOWN_MEMBERS = new Set(["type", "title", "status", "code", "detail", "errors", "requestId", "instance"]);

export class ApiError extends Error {
  readonly status: number;
  /** `VALIDATION_FAILED`, `UNAUTHORIZED`, `PRICE_CHANGED` …; `NETWORK_ERROR` when no answer came (status 0). */
  readonly code: string;
  readonly title: string;
  readonly detail: string | undefined;
  readonly fieldErrors: FieldError[];
  readonly requestId: string | undefined;
  /** Seconds from `Retry-After` (429 and 503 MAINTENANCE). */
  readonly retryAfter: number | undefined;
  /**
   * Problem extension members: `listedPrice` / `currentPrice` (PRICE_CHANGED), `orderId` (DUPLICATE_ORDER),
   * `expectedEndAt` (MAINTENANCE).
   */
  readonly extensions: Record<string, unknown>;

  constructor(init: ApiErrorInit) {
    const title = init.title ?? `Request failed (HTTP ${init.status})`;
    super(init.detail ?? title, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code ?? `HTTP_${init.status}`;
    this.title = title;
    this.detail = init.detail;
    this.fieldErrors = init.fieldErrors ?? [];
    this.requestId = init.requestId;
    this.retryAfter = init.retryAfter;
    this.extensions = init.extensions ?? {};
  }

  /** The first error for a field (exact path), e.g. `fieldError('email')`. */
  fieldError(field: string): FieldError | undefined {
    return this.fieldErrors.find((e) => e.field === field);
  }

  /** Field errors as `{ path: FieldError }` (first error per path). */
  byField(): Record<string, FieldError> {
    const out: Record<string, FieldError> = {};
    for (const e of this.fieldErrors) out[e.field] ??= e;
    return out;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function networkError(cause?: unknown): ApiError {
  return new ApiError({
    status: 0,
    code: "NETWORK_ERROR",
    title: "Network error",
    detail: "Could not reach the server.",
    cause,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const value = header.trim();
  if (/^\d+$/.test(value)) return Number(value);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/** Builds an ApiError from a non-2xx response. Never throws. */
export async function parseProblem(res: Response): Promise<ApiError> {
  const raw = await res.text().catch(() => "");
  let json: unknown;
  try {
    json = raw.trim() ? JSON.parse(raw) : undefined;
  } catch {
    json = undefined;
  }
  const body = isRecord(json) ? json : {};
  const fieldErrors: FieldError[] = Array.isArray(body.errors)
    ? body.errors.filter(isRecord).map((e) => ({
        field: str(e.field) ?? "",
        code: str(e.code) ?? "invalid",
        message: str(e.message) ?? "",
      }))
    : [];
  const extensions: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (!KNOWN_MEMBERS.has(k)) extensions[k] = v;
  return new ApiError({
    status: res.status,
    code: str(body.code),
    title: str(body.title) ?? str(res.statusText),
    detail: str(body.detail),
    fieldErrors,
    requestId: res.headers.get("x-request-id") ?? str(body.requestId),
    retryAfter: parseRetryAfter(res.headers.get("retry-after")),
    extensions,
  });
}

/** True when the request was cancelled through an AbortSignal. */
export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

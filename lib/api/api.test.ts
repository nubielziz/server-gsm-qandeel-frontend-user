import { describe, expect, it } from "vitest";
import { ApiError, parseProblem } from "./errors";
import { listQuery, pageRange, parsePage, pathOf, toQueryString } from "./query";

function problem(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/problem+json", ...headers },
  });
}

describe("parseProblem", () => {
  it("keeps the code, each field error code and the request id", async () => {
    const error = await parseProblem(
      problem(
        422,
        {
          type: "http://localhost:3000/errors/validation-failed",
          title: "Validation failed",
          status: 422,
          code: "VALIDATION_FAILED",
          detail: "2 fields are not valid.",
          errors: [
            { field: "imeis.0", code: "INVALID_IMEI", message: "Not a valid IMEI." },
            { field: "password", code: "WEAK_PASSWORD", message: "Too weak." },
          ],
          requestId: "req-body",
        },
        { "x-request-id": "req-header" },
      ),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.fieldError("imeis.0")?.code).toBe("INVALID_IMEI");
    expect(error.byField().password.code).toBe("WEAK_PASSWORD");
    expect(error.requestId).toBe("req-header");
  });

  it("keeps extension members (PRICE_CHANGED) and Retry-After", async () => {
    const price = await parseProblem(
      problem(409, { code: "PRICE_CHANGED", status: 409, listedPrice: "10.0000", currentPrice: "12.0000" }),
    );
    expect(price.extensions).toEqual({ listedPrice: "10.0000", currentPrice: "12.0000" });
    const limited = await parseProblem(problem(429, { code: "RATE_LIMITED" }, { "retry-after": "42" }));
    expect(limited.retryAfter).toBe(42);
  });

  it("survives non-JSON bodies", async () => {
    const error = await parseProblem(new Response("<html>bad gateway</html>", { status: 502, statusText: "Bad Gateway" }));
    expect(error.code).toBe("HTTP_502");
    expect(error.title).toBe("Bad Gateway");
    expect(error.fieldErrors).toEqual([]);
  });
});

describe("query helpers", () => {
  it("drops empty values and repeats array keys", () => {
    expect(toQueryString({ a: 1, b: "", c: undefined, d: null, status: ["pending", "processing"] })).toBe(
      "?a=1&status=pending&status=processing",
    );
    expect(toQueryString({})).toBe("");
  });
  it("builds the list dialect", () => {
    expect(listQuery({ start: 0, end: 25, sort: ["createdAt"], order: ["desc"], q: "  iphone " }, { type: "imei" })).toEqual({
      _start: 0,
      _end: 25,
      _sort: "createdAt",
      _order: "desc",
      q: "iphone",
      type: "imei",
    });
    expect(listQuery({ order: "asc" })._order).toBeUndefined();
  });
  it("pages", () => {
    expect(pageRange(3, 20)).toEqual({ start: 40, end: 60 });
    expect(pageRange(0, 20)).toEqual({ start: 0, end: 20 });
    expect(parsePage("4")).toBe(4);
    expect(parsePage(["2", "9"])).toBe(2);
    expect(parsePage("-1")).toBe(1);
    expect(parsePage("abc")).toBe(1);
  });
  it("fills path placeholders safely", () => {
    expect(pathOf("/client/orders/:id/cancel", { id: 7 })).toBe("/client/orders/7/cancel");
    expect(pathOf("/store/v1/orders/:token", { token: "a/b" })).toBe("/store/v1/orders/a%2Fb");
    expect(() => pathOf("/client/orders/:id", {})).toThrow();
  });
});

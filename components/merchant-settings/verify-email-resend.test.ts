import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { isAlreadyVerified } from "./verify-email-resend";

describe("isAlreadyVerified: the answers of POST /client/auth/verify-email/resend", () => {
  it("a 409 CONFLICT means the address is already verified", () => {
    expect(isAlreadyVerified(new ApiError({ status: 409, code: "CONFLICT", title: "The request conflicts with the current state." }))).toBe(true);
  });

  it("a 429 (five an hour), a 401, a 403 and a network error are not", () => {
    expect(isAlreadyVerified(new ApiError({ status: 429, code: "RATE_LIMITED", retryAfter: 3600 }))).toBe(false);
    expect(isAlreadyVerified(new ApiError({ status: 401, code: "UNAUTHORIZED" }))).toBe(false);
    expect(isAlreadyVerified(new ApiError({ status: 403, code: "ACCOUNT_SUSPENDED" }))).toBe(false);
    expect(isAlreadyVerified(new ApiError({ status: 0, code: "NETWORK_ERROR" }))).toBe(false);
  });

  it("anything that is not an ApiError is not", () => {
    expect(isAlreadyVerified(new Error("boom"))).toBe(false);
    expect(isAlreadyVerified(undefined)).toBe(false);
    expect(isAlreadyVerified({ status: 409 })).toBe(false);
  });
});

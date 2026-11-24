// The one sign-out button: one route for every rank, a 401 counts as signed out, any other failure keeps the session.
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { endSession } from "./sign-out-button";

describe("endSession", () => {
  it("posts the one sign-out route and forgets the remembered token", async () => {
    const post = vi.fn(async () => undefined);
    const forget = vi.fn();
    expect(await endSession(post, forget)).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/client/auth/logout");
    expect(forget).toHaveBeenCalledTimes(1);
  });

  it("a 401 means the session was already gone: signed out, token forgotten", async () => {
    const post = vi.fn(async () => {
      throw new ApiError({ status: 401, code: "UNAUTHORIZED" });
    });
    const forget = vi.fn();
    expect(await endSession(post, forget)).toBe(true);
    expect(forget).toHaveBeenCalledTimes(1);
  });

  it("any other failure leaves the session and the token alone", async () => {
    for (const error of [
      new ApiError({ status: 500, code: "INTERNAL" }),
      new ApiError({ status: 0, code: "NETWORK_ERROR" }),
      new Error("boom"),
    ]) {
      const post = vi.fn(async () => {
        throw error;
      });
      const forget = vi.fn();
      expect(await endSession(post, forget)).toBe(false);
      expect(forget).not.toHaveBeenCalled();
    }
  });
});

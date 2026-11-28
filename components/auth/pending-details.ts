// The details a sign-up link hands back when it was opened in another browser than the one that filled the sign-up form (the
// `pendingDetails` key of `POST /store/v1/auth/verify`, backend decision 079). Pure: no React, no API calls, so the exchange and
// the page's decision share one reader and it has one unit test.
import type { PendingDetails } from "@/lib/api/types";

/**
 * The four details of `pendingDetails`, or null when the value is not an object of four strings (nothing is guessed, so a
 * malformed answer never opens a form with made-up values). The password is never part of it.
 */
export function readPendingDetails(value: unknown): PendingDetails | null {
  if (typeof value !== "object" || value === null) return null;
  const { firstName, lastName, country, phone } = value as Record<string, unknown>;
  if (typeof firstName !== "string" || typeof lastName !== "string" || typeof country !== "string" || typeof phone !== "string") {
    return null;
  }
  return { firstName, lastName, country, phone };
}

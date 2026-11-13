import { describe, expect, it } from "vitest";
import { createIdempotencyKeys, newIdempotencyKey } from "./idempotency";

function counter() {
  let n = 0;
  return () => `key-${++n}`;
}

describe("newIdempotencyKey", () => {
  it("is a fresh printable ASCII key without spaces, 1 to 100 characters", () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).not.toBe(b);
    for (const key of [a, b]) expect(key).toMatch(/^[\x21-\x7e]{1,100}$/);
  });
});

describe("createIdempotencyKeys", () => {
  it("gives the same key for the same request signature (a retry or a double click)", () => {
    const keys = createIdempotencyKeys(counter());
    const body = JSON.stringify({ amount: "25", gatewayId: 3 });
    expect(keys.keyFor(body)).toBe("key-1");
    expect(keys.keyFor(body)).toBe("key-1");
    expect(keys.keyFor(JSON.stringify({ amount: "25", gatewayId: 3 }))).toBe("key-1");
  });

  it("gives a new key when the signature changes", () => {
    const keys = createIdempotencyKeys(counter());
    expect(keys.keyFor('{"amount":"25"}')).toBe("key-1");
    expect(keys.keyFor('{"amount":"30"}')).toBe("key-2");
    expect(keys.keyFor('{"amount":"30"}')).toBe("key-2");
  });

  it("never goes back to an older key: returning to a first signature gets a new key", () => {
    const keys = createIdempotencyKeys(counter());
    expect(keys.keyFor("A")).toBe("key-1");
    expect(keys.keyFor("B")).toBe("key-2");
    expect(keys.keyFor("A")).toBe("key-3");
  });

  it("forgets the key on reset, so the next request starts clean even with the same signature", () => {
    const keys = createIdempotencyKeys(counter());
    expect(keys.keyFor("A")).toBe("key-1");
    keys.reset();
    expect(keys.keyFor("A")).toBe("key-2");
  });

  it("keeps separate stores apart (the balance payment must never reuse a /pay key)", () => {
    const pay = createIdempotencyKeys();
    const balance = createIdempotencyKeys();
    expect(pay.keyFor("same")).not.toBe(balance.keyFor("same"));
  });

  it("calls the maker once per new key, not per read", () => {
    let made = 0;
    const keys = createIdempotencyKeys(() => `k${++made}`);
    keys.keyFor("A");
    keys.keyFor("A");
    keys.keyFor("A");
    expect(made).toBe(1);
  });
});

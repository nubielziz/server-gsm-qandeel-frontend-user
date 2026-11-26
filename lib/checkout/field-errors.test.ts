import { describe, expect, it } from "vitest";
import { drawnPaths, placeFieldErrors } from "./field-errors";

const text = (e: { code: string }) => `T:${e.code}`;
const error = (field: string, code = "custom") => ({ field, code, message: "" });

/** A form that lists the IMEI's field (key `imei_number`) and another one, with the drawer and no region box. */
const drawn = drawnPaths({ fieldKeys: ["imei_number", "model"], region: false, quantity: true });

describe("drawnPaths", () => {
  it("is the buyer's boxes, the fields as inputs.<key>, the region when it is shown and the quantity when the drawer is", () => {
    expect([...drawn].sort()).toEqual(["country", "currency", "email", "inputs.imei_number", "inputs.model", "quantity"]);
    expect(drawnPaths({ fieldKeys: [], region: true, quantity: false }).has("region")).toBe(true);
    expect(drawnPaths({ fieldKeys: [], region: true, quantity: false }).has("quantity")).toBe(false);
    expect(drawn.has("region")).toBe(false);
  });
});

describe("placeFieldErrors", () => {
  it("puts an error on a drawn field, the IMEI's included, under that field", () => {
    const placed = placeFieldErrors([error("inputs.imei_number", "invalid_imei"), error("email", "invalid_string")], drawn, text);
    expect(placed.fields).toEqual({ "inputs.imei_number": "T:invalid_imei", email: "T:invalid_string" });
    expect(placed.unplaced).toBeUndefined();
    expect(placed.service).toBeUndefined();
  });

  it("makes an error on imei, a path of an older API with no box, the message of the whole form", () => {
    const placed = placeFieldErrors([error("imei", "INVALID_IMEI")], drawn, text);
    expect(placed.fields).toEqual({});
    expect(placed.unplaced).toBe("T:INVALID_IMEI");
  });

  it("makes an error on an input the service does not list the message of the whole form", () => {
    const placed = placeFieldErrors([error("inputs.removed_field", "unknown_field")], drawn, text);
    expect(placed.fields).toEqual({});
    expect(placed.unplaced).toBe("T:unknown_field");
  });

  it("does the same for body, query and utm, and keeps the first of them", () => {
    const placed = placeFieldErrors([error("body", "first"), error("query", "second"), error("utm.source", "third")], drawn, text);
    expect(placed.unplaced).toBe("T:first");
  });

  it("keeps the unplaced message when errors on drawn fields arrive with it, and the first error of a path", () => {
    const placed = placeFieldErrors([error("inputs.model", "required"), error("imei", "INVALID_IMEI"), error("inputs.model", "pattern")], drawn, text);
    expect(placed.fields).toEqual({ "inputs.model": "T:required" });
    expect(placed.unplaced).toBe("T:INVALID_IMEI");
  });

  it("has no box for the quantity when the drawer is not offered, nor for a region that is not shown", () => {
    const bare = drawnPaths({ fieldKeys: [], region: false, quantity: false });
    const placed = placeFieldErrors([error("quantity", "invalid_quantity"), error("region", "custom")], bare, text);
    expect(placed.fields).toEqual({});
    expect(placed.unplaced).toBe("T:invalid_quantity");
  });

  it("sets an error on serviceId apart: it wins over an unplaced one", () => {
    const placed = placeFieldErrors([error("imei", "INVALID_IMEI"), error("serviceId", "not_found")], drawn, text);
    expect(placed.service).toBe("T:not_found");
    expect(placed.unplaced).toBe("T:INVALID_IMEI");
    expect(placed.fields).toEqual({});
  });
});

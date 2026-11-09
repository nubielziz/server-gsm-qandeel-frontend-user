#!/usr/bin/env node
// Generates lib/api/schema.gen.ts: TypeScript types for every /client and /store/v1 operation of the backend's
// OpenAPI document (backend/docs/contract/openapi.json, itself generated from the zod contracts and checked by the
// backend's `bun run check`). One `<OperationId>Query | Params | Body | Response` type per operation.
// Usage: node scripts/gen-api-types.mjs [--check]   (--check fails when the committed file is stale)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = resolve(process.env.GSM_OPENAPI ?? resolve(root, "../backend/docs/contract/openapi.json"));
const outPath = resolve(root, "lib/api/schema.gen.ts");
const check = process.argv.includes("--check");

const spec = JSON.parse(readFileSync(specPath, "utf8"));
const METHODS = ["get", "post", "put", "patch", "delete"];
const ALIASES = { Id: "Id", Money: "Money", Decimal: "Decimal", IsoDateTime: "IsoDateTime", JsonObject: "JsonObject" };

const pascal = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const isIdent = (k) => /^[A-Za-z_$][\w$]*$/.test(k);
const key = (k) => (isIdent(k) ? k : JSON.stringify(k));

/** One-line JSDoc from a description (first paragraph, no comment terminators). */
function doc(description, indent) {
  if (!description) return "";
  const text = String(description).split(/\n\s*\n/)[0].replace(/\*\//g, "*\\/").replace(/\s+/g, " ").trim();
  return text ? `${indent}/** ${text} */\n` : "";
}

/** JSON Schema (OpenAPI 3.1 subset produced by zod) → TypeScript type text. */
function ts(schema, indent = "") {
  if (!schema || typeof schema !== "object" || Object.keys(schema).length === 0) return "unknown";
  if (schema["x-gsm-alias"] && ALIASES[schema["x-gsm-alias"]]) {
    const base = ALIASES[schema["x-gsm-alias"]];
    return Array.isArray(schema.type) && schema.type.includes("null") ? `${base} | null` : base;
  }
  if ("const" in schema) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (schema.anyOf || schema.oneOf) {
    const parts = [...new Set((schema.anyOf ?? schema.oneOf).map((s) => ts(s, indent)))];
    return parts.length === 1 ? parts[0] : parts.map((p) => (p.includes("\n") ? p : p)).join(" | ");
  }
  if (schema.allOf) return schema.allOf.map((s) => ts(s, indent)).join(" & ");
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length > 1) {
    return types.map((t) => ts({ ...schema, type: t }, indent)).join(" | ");
  }
  switch (types[0]) {
    case "null":
      return "null";
    case "boolean":
      return "boolean";
    case "integer":
    case "number":
      return "number";
    case "string":
      return schema.format === "binary" ? "Blob" : "string";
    case "array": {
      const item = ts(schema.items, indent);
      return /^[\w.]+$/.test(item) ? `${item}[]` : `Array<${item}>`;
    }
    case "object":
    default: {
      const props = schema.properties ?? {};
      const required = new Set(schema.required ?? []);
      const inner = indent + "  ";
      const lines = Object.entries(props).map(
        ([k, s]) => `${doc(s.description, inner)}${inner}${key(k)}${required.has(k) ? "" : "?"}: ${ts(s, inner)};`,
      );
      const extra = schema.additionalProperties;
      if (extra && typeof extra === "object") lines.push(`${inner}[key: string]: ${ts(extra, inner)};`);
      if (lines.length === 0) return extra && typeof extra === "object" ? `Record<string, ${ts(extra, inner)}>` : "Record<string, never>";
      return `{\n${lines.join("\n")}\n${indent}}`;
    }
  }
}

function paramsType(params, where) {
  const list = (params ?? []).filter((p) => p.in === where);
  if (list.length === 0) return null;
  const lines = list.map(
    (p) => `${doc(p.description ?? p.schema?.description, "  ")}  ${key(p.name)}${p.required ? "" : "?"}: ${ts(p.schema, "  ")};`,
  );
  return `{\n${lines.join("\n")}\n}`;
}

function successResponse(op) {
  const entries = Object.entries(op.responses ?? {}).filter(([s]) => /^[23]/.test(s));
  for (const [status, r] of entries) {
    const content = r.content ?? {};
    if (content["application/json"]) return { status, type: ts(content["application/json"].schema) };
    const other = Object.keys(content)[0];
    if (other) return { status, type: "Blob", note: other };
    return { status, type: "void" };
  }
  return { status: "?", type: "void" };
}

const ops = [];
for (const [path, item] of Object.entries(spec.paths)) {
  if (!path.startsWith("/client") && !path.startsWith("/store/v1")) continue;
  for (const method of METHODS) {
    const op = item[method];
    if (op) ops.push({ path, method, op });
  }
}
ops.sort((a, b) => (a.path === b.path ? METHODS.indexOf(a.method) - METHODS.indexOf(b.method) : a.path < b.path ? -1 : 1));

let out = `// GENERATED by scripts/gen-api-types.mjs from backend/docs/contract/openapi.json. Do not edit by hand.
// Run \`npm run gen:api\` after the backend contract changes; \`npm run gen:api:check\` fails when this file is stale.

/** Database id: a positive integer JSON number. */
export type Id = number;
/** Money: a decimal string with exactly 4 fraction digits ("12.4900"). Never parse it into a float for arithmetic. */
export type Money = string;
/** Exact decimal sent as a string (rates, percents; fxRate has 8 decimals). */
export type Decimal = string;
/** ISO 8601 UTC date-time with milliseconds ("2026-03-01T09:30:00.000Z"). */
export type IsoDateTime = string;
export type JsonObject = { [key: string]: unknown };

`;

const routeLines = [];
for (const { path, method, op } of ops) {
  const name = pascal(op.operationId);
  const route = `${method.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ":$1")}`;
  out += `// ── ${route}${op.summary ? ` — ${op.summary}` : ""}\n`;
  const query = paramsType(op.parameters, "query");
  const params = paramsType(op.parameters, "path");
  const content = op.requestBody?.content ?? {};
  const bodySchema = content["application/json"]?.schema;
  const isMultipart = Boolean(content["multipart/form-data"]);
  const res = successResponse(op);
  if (query) out += `export type ${name}Query = ${query};\n`;
  if (params) out += `export type ${name}Params = ${params};\n`;
  if (bodySchema) out += `export type ${name}Body = ${ts(bodySchema)};\n`;
  if (isMultipart) out += `/** multipart/form-data with one part named \`file\`. */\nexport type ${name}Body = FormData;\n`;
  out += `/** ${res.status}${res.note ? ` ${res.note}` : ""} */\nexport type ${name}Response = ${res.type};\n\n`;
  routeLines.push(
    `  ${JSON.stringify(route)}: { query: ${query ? `${name}Query` : "never"}; params: ${params ? `${name}Params` : "never"}; body: ${bodySchema || isMultipart ? `${name}Body` : "never"}; response: ${name}Response; status: ${res.status === "?" ? "number" : res.status} };`,
  );
}
out += `/** Every /client and /store/v1 route: \`ApiRoutes['GET /store/v1/services']['response']\`. */\nexport interface ApiRoutes {\n${routeLines.join("\n")}\n}\n`;

if (check) {
  const current = existsSync(outPath) ? readFileSync(outPath, "utf8") : "";
  if (current !== out) {
    console.error(`lib/api/schema.gen.ts is stale: run npm run gen:api (${ops.length} operations in the contract).`);
    process.exit(1);
  }
  console.log(`lib/api/schema.gen.ts is up to date (${ops.length} operations).`);
} else {
  writeFileSync(outPath, out);
  console.log(`wrote lib/api/schema.gen.ts (${ops.length} operations)`);
}

// A value of the site under test's environment, read as Next reads it: the process env, then the env files by precedence
// (the same rule playwright.config.ts uses for GSM_API_ORIGIN). `npm run dev` (:5175) reads the development files, a
// production build (`npm start`, :5176) the production ones. For BUILD-TIME values (NEXT_PUBLIC_*) this is only right when
// Playwright runs from the directory the build under test was made in.
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The value of `name` for the site under test, or undefined when no file sets it. Quotes around a value are dropped. */
export function siteEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const mode = new URL(process.env.E2E_BASE_URL ?? "http://localhost:5175").port === "5175" ? "development" : "production";
  for (const file of [`.env.${mode}.local`, ".env.local", `.env.${mode}`, ".env"]) {
    try {
      const match = new RegExp(`^[ \\t]*${name}[ \\t]*=[ \\t]*(.*)$`, "m").exec(readFileSync(join(__dirname, "..", file), "utf8"));
      if (match) return (match[1] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2");
    } catch {
      // the file does not exist
    }
  }
  return undefined;
}

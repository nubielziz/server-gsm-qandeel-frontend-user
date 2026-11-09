// Staff-written Markdown "may contain HTML" (handoff §5.2): it must never reach the page as live HTML or script.
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown safety", () => {
  it("escapes raw HTML instead of rendering it", () => {
    const html = renderMarkdown('Hello <script>alert(1)</script> <img src=x onerror="alert(2)">');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("drops javascript: and vbscript: links", () => {
    const html = renderMarkdown("[click](javascript:alert(1)) [vb](vbscript:msgbox(1))");
    expect(html).not.toMatch(/href="(javascript|vbscript):/i);
  });

  it("opens external links in a new tab without opener access", () => {
    const html = renderMarkdown("[GSM](https://example.com/page) and [terms](/en/pages/terms)");
    expect(html).toContain('href="https://example.com/page" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('href="/en/pages/terms"');
    expect(html).not.toContain('href="/en/pages/terms" target');
  });

  it("renders ordinary Markdown", () => {
    expect(renderMarkdown("# Title\n\n- one\n- two")).toContain("<h1>Title</h1>");
  });
});

// Markdown → HTML for content pages, legal documents and help articles written by staff in the admin console.
// Safety first: raw HTML in the source is escaped (`html: false`), markdown-it's default link validation drops
// `javascript:`, `vbscript:`, `file:` and non-image `data:` URLs, and every external link opens in a new tab with
// `rel="noopener noreferrer"`. The result is still passed through `dangerouslySetInnerHTML` only by <Markdown>.
// Server-side only in practice (markdown-it is ~100 kB): render in a Server Component.
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
  breaks: false,
});

function isExternal(href: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href) || /^(?:https?|ftp):/i.test(href);
}

const defaultLinkOpen =
  md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const href = String(token.attrGet("href") ?? "");
  if (isExternal(href)) {
    token.attrSet("target", "_blank");
    token.attrSet("rel", "noopener noreferrer");
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// Images from content are lazy and async by default; they never block the first paint.
const defaultImage =
  md.renderer.rules.image ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  token.attrSet("loading", "lazy");
  token.attrSet("decoding", "async");
  return defaultImage(tokens, idx, options, env, self);
};

/** Renders markdown to safe HTML (no raw HTML, safe links, external links in a new tab with noopener noreferrer). */
export function renderMarkdown(source: string): string {
  return md.render(source);
}

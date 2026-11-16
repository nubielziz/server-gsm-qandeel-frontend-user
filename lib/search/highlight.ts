// The highlighted title of a suggested service. The API sends `titleHighlight`: the title it escaped itself, with
// `<mark>` around the matched words (backend plan 29 §5.2). It is never injected as HTML: only `<mark>` and `</mark>` are
// read as marks, the five HTML escapes and numeric references are decoded, and everything else stays text, so a tag in a
// title can never become markup. Pure, safe to import anywhere.

/** A run of the title, matched (drawn in a `<mark>`) or not. */
export type HighlightPart = { text: string; mark: boolean };

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

/** Decodes `&amp; &lt; &gt; &quot; &#39; &apos;` and numeric references (`&#65;`, `&#x41;`); unknown ones stay as they are. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]+|#39);/gi, (match, name: string) => {
    const lower = name.toLowerCase();
    if (lower in NAMED) return NAMED[lower];
    if (lower.startsWith("#")) {
      const code = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
      // A valid scalar value only (no NUL, no lone surrogate): otherwise the reference stays as written.
      if (code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)) return String.fromCodePoint(code);
    }
    return match;
  });
}

/**
 * `"<mark>Samsung</mark> FRP &amp; KG"` → `[{text:"Samsung",mark:true},{text:" FRP & KG",mark:false}]`. Empty runs are
 * left out; an unclosed `<mark>` marks the rest; a stray `</mark>` is dropped.
 */
export function parseHighlight(html: string): HighlightPart[] {
  const parts: HighlightPart[] = [];
  let mark = false;
  for (const piece of html.split(/(<\/?mark>)/i)) {
    const tag = piece.toLowerCase();
    if (tag === "<mark>") mark = true;
    else if (tag === "</mark>") mark = false;
    else if (piece) {
      const text = decodeEntities(piece);
      const last = parts[parts.length - 1];
      if (last && last.mark === mark) last.text += text;
      else parts.push({ text, mark });
    }
  }
  return parts;
}

/** The highlighted title when it holds the same text as the plain title, else the plain title unmarked. */
export function highlightParts(title: string, titleHighlight: string | null | undefined): HighlightPart[] {
  const parts = titleHighlight ? parseHighlight(titleHighlight) : [];
  // A highlight that does not spell the title (an older answer, an engine change) must not change what is shown.
  if (parts.map((part) => part.text).join("") !== title) return title ? [{ text: title, mark: false }] : [];
  return parts;
}

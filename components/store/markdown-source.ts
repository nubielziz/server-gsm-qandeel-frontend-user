// Staff write Markdown in the admin console and often start a page with `# Title`, but the page already has its own `<h1>`.
// One document must have one `h1`, so every ATX heading moves one level down (`#` → `##`, … , `#####` → `######`).
// Fenced code blocks are left alone. Safe to import anywhere.
export function demoteHeadings(markdown: string): string {
  let fenced = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s{0,3}(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) return line;
      return /^\s{0,3}#{1,5}(\s|$)/.test(line) ? line.replace("#", "##") : line;
    })
    .join("\n");
}

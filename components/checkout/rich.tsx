// Fills a `{name}` placeholder of a translated sentence with a React node (a link, a bold span). Translators keep the
// sentence whole; the page decides what the placeholder becomes. Safe in Server and Client Components.
import type { ReactNode } from "react";

export function slot(template: string, name: string, node: ReactNode): ReactNode {
  const marker = `{${name}}`;
  const at = template.indexOf(marker);
  if (at < 0) return template;
  return (
    <>
      {template.slice(0, at)}
      {node}
      {template.slice(at + marker.length)}
    </>
  );
}

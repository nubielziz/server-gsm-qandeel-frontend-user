// Fills a `{name}` placeholder with a value that is isolated from the surrounding text direction. API values such as
// "2 days" or an IMEI are Latin text: inside an Arabic sentence they would otherwise reorder around punctuation.
import type { ReactNode } from "react";

export function BdiText({ template, name = "time", value }: { template: string; name?: string; value: string }): ReactNode {
  const marker = `{${name}}`;
  const at = template.indexOf(marker);
  if (at < 0) return template;
  return (
    <>
      {template.slice(0, at)}
      <bdi>{value}</bdi>
      {template.slice(at + marker.length)}
    </>
  );
}

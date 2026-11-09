// Markdown: renders staff-written content (legal pages, help articles) as styled prose.
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/cn";

export type MarkdownProps = {
  /** The markdown source from the API (`body`). Raw HTML in it is escaped. */
  source: string;
  className?: string;
};

/** Server component: markdown → safe HTML inside `.prose` (see lib/markdown.ts and globals.css). */
export function Markdown({ source, className }: MarkdownProps) {
  return <div className={cn("prose", className)} dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />;
}

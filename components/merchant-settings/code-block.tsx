// A small read-only code sample (always left-to-right). Focusable so a long line can be scrolled with the keyboard.
export function CodeBlock({ children, label }: { children: string; label: string }) {
  return (
    <pre
      dir="ltr"
      tabIndex={0}
      role="region"
      aria-label={label}
      className="overflow-x-auto rounded-control bg-surface-sunken px-3.5 py-3 text-start font-mono text-small leading-relaxed text-ink"
    >
      <code>{children}</code>
    </pre>
  );
}

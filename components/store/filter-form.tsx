"use client";
// The catalog filter form: a plain GET form (works without JavaScript) that, with JavaScript, drops empty and default
// values from the URL (`/services?brand=Apple` instead of `?q=&brand=Apple&network=&country=&sort=featured`) and closes the
// drawer it may be in before navigating.
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function FilterForm({
  action,
  defaultSort,
  applyLabel,
  clearLabel,
  children,
}: {
  action: string;
  defaultSort: string;
  applyLabel: string;
  clearLabel: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      const text = typeof value === "string" ? value.trim() : "";
      if (!text || (key === "sort" && text === defaultSort)) continue;
      params.set(key, text);
    }
    form.closest("dialog")?.close();
    const query = params.toString();
    router.push(query ? `${action}?${query}` : action);
  }

  return (
    <form action={action} method="get" onSubmit={onSubmit} className="grid gap-4">
      {children}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="submit">{applyLabel}</Button>
        <Link
          href={action}
          onClick={(event) => event.currentTarget.closest("dialog")?.close()}
          className="inline-flex min-h-11 items-center rounded-badge px-1 text-body font-semibold text-ink underline underline-offset-4"
        >
          {clearLabel}
        </Link>
      </div>
    </form>
  );
}

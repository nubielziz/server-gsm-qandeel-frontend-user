"use client";
// "Try again" for an inline error: re-renders the current route with fresh data.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function RetryButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" loading={pending} onClick={() => start(() => router.refresh())}>
      {label}
    </Button>
  );
}

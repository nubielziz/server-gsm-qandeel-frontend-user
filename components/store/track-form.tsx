"use client";
// "Track an order": takes the whole tracking link or only its code and opens `/<lang>/track/<token>`.
import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localePath, type Locale } from "@/lib/i18n/config";

/** The token out of a pasted link (`…/track/<token>?x`) or a bare code; null when it does not look like one (16-128 URL-safe characters). */
export function parseTrackingToken(input: string): string | null {
  let value = input.trim();
  const marker = value.search(/\/track\//i);
  if (marker >= 0) value = value.slice(marker + "/track/".length);
  value = value.split(/[?#/]/)[0] ?? "";
  return /^[A-Za-z0-9_-]{16,128}$/.test(value) ? value : null;
}

export type TrackFormProps = {
  locale: Locale;
  labels: { label: string; hint: string; placeholder: string; submit: string; invalid: string };
};

export function TrackForm({ locale, labels }: TrackFormProps) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const id = useId();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const token = parseTrackingToken(value);
    if (!token) {
      setError(labels.invalid);
      document.getElementById(id)?.focus();
      return;
    }
    router.push(localePath(locale, `/track/${encodeURIComponent(token)}`));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <Input
        id={id}
        name="token"
        label={labels.label}
        hint={labels.hint}
        error={error}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (error) setError(undefined);
        }}
        placeholder={labels.placeholder}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        required
        dir="ltr"
        inputSize="lg"
        leading={<PackageSearch aria-hidden="true" />}
      />
      <div>
        <Button type="submit" size="lg">
          {labels.submit}
        </Button>
      </div>
    </form>
  );
}

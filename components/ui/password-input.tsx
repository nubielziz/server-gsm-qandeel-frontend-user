"use client";
// PasswordInput: an Input with a show/hide toggle. Client component (the only state is the visibility).
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input, type InputProps } from "./input";
import { useUiText } from "./ui-text";

export type PasswordInputProps = Omit<InputProps, "type" | "trailing"> & {
  /** Overrides the "Show password" button text. */
  showLabel?: string;
  /** Overrides the "Hide password" button text. */
  hideLabel?: string;
};

/** A password field with a show/hide button (`aria-pressed`). Defaults to `autoComplete="current-password"`. */
export function PasswordInput({ showLabel, hideLabel, autoComplete = "current-password", ...props }: PasswordInputProps) {
  const text = useUiText();
  const [visible, setVisible] = useState(false);
  const label = visible ? (hideLabel ?? text.hidePassword) : (showLabel ?? text.showPassword);
  return (
    <Input
      {...props}
      type={visible ? "text" : "password"}
      autoComplete={autoComplete}
      trailing={
        <button
          type="button"
          aria-label={label}
          aria-pressed={visible}
          title={label}
          onClick={() => setVisible((v) => !v)}
          className="relative inline-flex size-10 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink after:absolute after:-inset-0.5 after:content-['']"
        >
          {visible ? <EyeOff aria-hidden="true" className="size-[18px]" /> : <Eye aria-hidden="true" className="size-[18px]" />}
        </button>
      }
    />
  );
}

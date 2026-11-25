"use client";
// ThemeToggle: the one button that switches the site between the light and the dark theme (lib/theme/theme.ts).
// It draws BOTH icons (the moon, shown in the light theme; the sun, shown in the dark one) and lets the `dark:` variant pick
// one, so the server HTML is right in either theme and nothing differs at hydration. `aria-pressed` (pressed = dark) is
// read from <html data-theme> with `useSyncExternalStore`: the server snapshot is "light", so the first client render
// matches the server HTML, and the real theme (set by the guard script before the first paint) follows at once.
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { IconButton, type IconButtonSize } from "@/components/ui/icon-button";
import { cn } from "@/lib/cn";
import { readTheme, subscribeTheme, toggleTheme, type Theme } from "@/lib/theme/theme";

export type ThemeToggleProps = {
  /** Accessible name and tooltip ("Dark theme"): the button is a toggle, so the name stays the same in both themes. */
  label: string;
  /**
   * The look: `ghost` (default, a header's icon buttons), `quiet` (a muted icon for a corner that should not compete) or
   * `inverse` (on a dark surface such as the workspace rail: the colours of its links).
   */
  tone?: "ghost" | "quiet" | "inverse";
  /** `md` (44 px, default) or `lg` (48 px, the rail's links). */
  size?: IconButtonSize;
  /** Layout only (margins, the rail's short-screen sizes). */
  className?: string;
};

/** The colours of a rail link (`.rail-link`, app/globals.css), as important utilities so they win over the ghost button's ink. */
const INVERSE_TONE =
  "text-on-inverse-muted! hover:bg-inverse-raised! hover:text-on-inverse! active:bg-inverse-raised! active:text-on-inverse!";

const serverTheme = (): Theme => "light";

/** The theme switch: an icon button of at least 44 px, with the theme as `aria-pressed`. Client component. */
export function ThemeToggle({ label, tone = "ghost", size, className }: ThemeToggleProps) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
  return (
    <IconButton
      label={label}
      variant={tone === "quiet" ? "quiet" : "ghost"}
      size={size}
      aria-pressed={theme === "dark"}
      onClick={toggleTheme}
      className={cn(tone === "inverse" && INVERSE_TONE, className)}
    >
      <Moon aria-hidden="true" className="dark:hidden" />
      <Sun aria-hidden="true" className="hidden dark:block" />
    </IconButton>
  );
}

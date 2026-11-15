"use client";
// The "Notification sound" switch of the notifications page header (owner, 2026-11-15): turns the bell's arrival chime
// (lib/notifications/chime.ts) on or off for this browser; on by default (lib/notifications/sound-setting.ts). The server
// renders it on; a saved "off" shows right after hydration. The switch role says on/off to a screen reader, so the visible
// state word beside the label is hidden from it.
import { useSyncExternalStore } from "react";
import { Switch } from "@/components/ui/checkbox";
import { notificationSound } from "@/lib/notifications/sound-setting";

export type SoundToggleProps = {
  labels: { label: string; on: string; off: string };
};

export function SoundToggle({ labels }: SoundToggleProps) {
  const on = useSyncExternalStore(notificationSound.subscribe, notificationSound.isOn, () => true);
  return (
    <Switch
      label={
        <>
          {labels.label}
          <span aria-hidden="true" className="ms-2 text-small font-normal text-ink-subtle">
            {on ? labels.on : labels.off}
          </span>
        </>
      }
      checked={on}
      onChange={(event) => notificationSound.set(event.currentTarget.checked)}
    />
  );
}

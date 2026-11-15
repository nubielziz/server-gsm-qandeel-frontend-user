// The visitor's "Notification sound" switch (owner, 2026-11-15) on the notifications page header: on by default, kept in
// localStorage under `gsm.notification-sound` ("on" or "off"). Where storage is blocked (a private window, blocked site
// data) the choice lasts until the page is closed. The chime (chime.ts) asks it at each ring; the switch
// (components/notifications/sound-toggle.tsx) reads and sets it. `notificationSound` touches nothing at import.

export const SOUND_KEY = "gsm.notification-sound";

type SoundStorage = Pick<Storage, "getItem" | "setItem">;

export type SoundSetting = {
  /** True unless the visitor turned the sound off. */
  isOn(): boolean;
  set(on: boolean): void;
  /** For `useSyncExternalStore`: tells `listener` when this page changes the setting. */
  subscribe(listener: () => void): () => void;
};

export function createSoundSetting(storage: () => SoundStorage | null): SoundSetting {
  /** This page's choice while storage refuses it (undefined once storage holds the choice). */
  let session: boolean | undefined;
  const listeners = new Set<() => void>();
  return {
    isOn() {
      if (session !== undefined) return session;
      try {
        const saved = storage()?.getItem(SOUND_KEY);
        if (saved === "off") return false;
        if (saved === "on") return true;
      } catch {
        // blocked storage: the default
      }
      return true;
    },
    set(on) {
      session = on;
      try {
        const store = storage();
        if (store) {
          store.setItem(SOUND_KEY, on ? "on" : "off");
          session = undefined;
        }
      } catch {
        // blocked storage: the choice still holds until the page is closed
      }
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** `localStorage`, or null where it is missing or blocked (a private window, blocked site data, the server). */
function browserStorage(): SoundStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The browser's setting. */
export const notificationSound = createSoundSetting(browserStorage);

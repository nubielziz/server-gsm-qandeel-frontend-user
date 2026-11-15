import { describe, expect, it, vi } from "vitest";
import { createSoundSetting, SOUND_KEY } from "./sound-setting";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

describe("the notification sound setting", () => {
  it("is on by default and remembers off and on", () => {
    const storage = memoryStorage();
    const setting = createSoundSetting(() => storage);
    expect(setting.isOn()).toBe(true);
    setting.set(false);
    expect(storage.values.get(SOUND_KEY)).toBe("off");
    expect(setting.isOn()).toBe(false);
    // A new page reads what was saved.
    expect(createSoundSetting(() => storage).isOn()).toBe(false);
    setting.set(true);
    expect(storage.values.get(SOUND_KEY)).toBe("on");
    expect(setting.isOn()).toBe(true);
  });

  it("keeps the choice for the page when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    const setting = createSoundSetting(() => blocked);
    expect(setting.isOn()).toBe(true);
    setting.set(false);
    expect(setting.isOn()).toBe(false);
    expect(createSoundSetting(() => null).isOn()).toBe(true);
  });

  it("tells its listeners when it changes", () => {
    const setting = createSoundSetting(() => memoryStorage());
    const listener = vi.fn();
    const stop = setting.subscribe(listener);
    setting.set(false);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    setting.set(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { CHIME_NOTES, createChime, notificationChime, type ChimeContext, type ChimeEnv } from "./chime";

/** An AudioParam that records what it was told. */
class FakeParam {
  events: { kind: string; value: number; time: number }[] = [];
  setValueAtTime(value: number, time: number) {
    this.events.push({ kind: "set", value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ kind: "linear", value, time });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.events.push({ kind: "exponential", value, time });
    return this;
  }
}

class FakeOscillator {
  type = "square";
  frequency = new FakeParam();
  target: unknown = null;
  startAt: number | null = null;
  stopAt: number | null = null;
  onended: (() => void) | null = null;
  connect(node: unknown) {
    this.target = node;
    return node;
  }
  disconnect() {}
  start(time: number) {
    this.startAt = time;
  }
  stop(time: number) {
    this.stopAt = time;
  }
}

class FakeGain {
  gain = new FakeParam();
  target: unknown = null;
  connect(node: unknown) {
    this.target = node;
    return node;
  }
  disconnect() {}
}

/** An AudioContext: suspended until `resume`, which works only when the browser `allows` it (a real gesture). */
class FakeContext {
  state: AudioContextState = "suspended";
  currentTime = 12;
  destination = { name: "speakers" };
  allows = true;
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  resume = vi.fn(async () => {
    if (this.allows) this.state = "running";
  });
  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
}

/** A fake page: its gestures, whether it already had one, the mute setting and the contexts it created. */
function fakePage(options: { audio?: boolean; hadGesture?: boolean } = {}) {
  const listeners = new Set<() => void>();
  const contexts: FakeContext[] = [];
  let enabled = true;
  let allows = true;
  const env: ChimeEnv = {
    createContext() {
      if (options.audio === false) return null;
      const context = new FakeContext();
      context.allows = allows;
      contexts.push(context);
      return context as unknown as ChimeContext;
    },
    hadGesture: () => options.hadGesture ?? false,
    onGesture(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    enabled: () => enabled,
  };
  return {
    env,
    contexts,
    listening: () => listeners.size,
    /** A pointer or key press; waits for `resume` to settle. */
    async gesture() {
      for (const listener of [...listeners]) listener();
      await Promise.resolve();
      await Promise.resolve();
    },
    mute(next: boolean) {
      enabled = !next;
    },
    /** The browser refuses to start audio (a press it does not count, such as a touch that has not lifted yet). */
    refuse(next: boolean) {
      allows = !next;
      for (const context of contexts) context.allows = !next;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the chime", () => {
  it("plays two soft sine notes, about 880 Hz then 1320 Hz, under 400 ms, to the speakers", async () => {
    const page = fakePage();
    const chime = createChime(page.env);
    chime.arm();
    await page.gesture();
    expect(chime.play()).toBe(true);

    const [context] = page.contexts;
    expect(context.oscillators.map((oscillator) => oscillator.type)).toEqual(["sine", "sine"]);
    expect(context.oscillators.map((oscillator) => oscillator.frequency.events[0].value)).toEqual([880, 1320]);
    for (const [index, gain] of context.gains.entries()) {
      expect(context.oscillators[index].target).toBe(gain);
      expect(gain.target).toBe(context.destination);
      const [start, attack, release] = gain.gain.events;
      // A gentle attack from silence to a quiet peak, then a release back to silence.
      expect(start).toMatchObject({ kind: "set", value: 0 });
      expect(attack.kind).toBe("linear");
      expect(attack.value).toBeGreaterThanOrEqual(0.04);
      expect(attack.value).toBeLessThanOrEqual(0.08);
      expect(attack.time - start.time).toBeGreaterThan(0.005);
      expect(release).toMatchObject({ kind: "exponential" });
      expect(release.value).toBeLessThan(0.001);
    }
    const startsAt = Math.min(...context.oscillators.map((oscillator) => oscillator.startAt ?? Infinity));
    const endsAt = Math.max(...context.oscillators.map((oscillator) => oscillator.stopAt ?? 0));
    expect(startsAt).toBeGreaterThanOrEqual(context.currentTime);
    expect(endsAt - context.currentTime).toBeLessThan(0.4);
    expect(CHIME_NOTES).toHaveLength(2);
  });

  it("plays nothing before a gesture unlocked it: no context, no error", () => {
    const page = fakePage();
    const chime = createChime(page.env);
    chime.arm();
    expect(chime.play()).toBe(false);
    expect(page.contexts).toEqual([]);
  });

  it("creates one context on the first gesture and stops listening once it runs", async () => {
    const page = fakePage();
    const chime = createChime(page.env);
    chime.arm();
    chime.arm();
    expect(page.listening()).toBe(1);
    await page.gesture();
    expect(page.contexts).toHaveLength(1);
    expect(page.contexts[0].resume).toHaveBeenCalledTimes(1);
    expect(page.listening()).toBe(0);
    await page.gesture();
    expect(page.contexts).toHaveLength(1);
    chime.arm();
    expect(page.listening()).toBe(0);
  });

  it("keeps listening while the browser refuses to start it, and plays nothing meanwhile", async () => {
    const page = fakePage();
    const chime = createChime(page.env);
    chime.arm();
    page.refuse(true);
    await page.gesture();
    expect(page.contexts[0].state).toBe("suspended");
    expect(page.listening()).toBe(1);
    expect(chime.play()).toBe(false);
    expect(page.contexts[0].oscillators).toEqual([]);

    page.refuse(false);
    await page.gesture();
    expect(page.contexts).toHaveLength(1);
    expect(page.listening()).toBe(0);
    expect(chime.play()).toBe(true);
  });

  it("unlocks at once when the page already had a gesture (a click before the bell existed)", async () => {
    const page = fakePage({ hadGesture: true });
    const chime = createChime(page.env);
    chime.arm();
    await Promise.resolve();
    expect(page.contexts).toHaveLength(1);
    expect(page.listening()).toBe(0);
    expect(chime.play()).toBe(true);
  });

  it("plays nothing while the sound is off, and again once it is on", async () => {
    const page = fakePage();
    const chime = createChime(page.env);
    chime.arm();
    await page.gesture();
    page.mute(true);
    expect(chime.play()).toBe(false);
    expect(page.contexts[0].oscillators).toEqual([]);
    page.mute(false);
    expect(chime.play()).toBe(true);
  });

  it("plays nothing where the browser has no Web Audio", async () => {
    const page = fakePage({ audio: false });
    const chime = createChime(page.env);
    chime.arm();
    await page.gesture();
    expect(chime.play()).toBe(false);
  });

  it("waits for a new gesture when the browser suspended it meanwhile, without a retry of its own", async () => {
    const page = fakePage();
    const chime = createChime(page.env);
    chime.arm();
    await page.gesture();
    page.contexts[0].state = "suspended";
    expect(chime.play()).toBe(false);
    expect(page.contexts[0].resume).toHaveBeenCalledTimes(1);
    expect(page.listening()).toBe(1);
    await page.gesture();
    expect(page.contexts[0].resume).toHaveBeenCalledTimes(2);
    expect(chime.play()).toBe(true);
  });
});

describe("the browser's chime", () => {
  it("listens on the page with passive capture listeners for a press, and makes its context there", async () => {
    const added: { type: string; listener: () => void; options: unknown }[] = [];
    const removed: string[] = [];
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: () => void, options: unknown) => added.push({ type, listener, options }),
      removeEventListener: (type: string) => removed.push(type),
    });
    const contexts: FakeContext[] = [];
    vi.stubGlobal(
      "AudioContext",
      class extends FakeContext {
        constructor() {
          super();
          contexts.push(this);
        }
      },
    );
    notificationChime.arm();
    expect(added.map((entry) => entry.type)).toEqual(["pointerdown", "pointerup", "keydown"]);
    for (const entry of added) expect(entry.options).toEqual({ capture: true, passive: true });
    expect(contexts).toEqual([]);

    added[0].listener();
    await Promise.resolve();
    await Promise.resolve();
    expect(contexts).toHaveLength(1);
    expect(removed).toEqual(["pointerdown", "pointerup", "keydown"]);
    expect(notificationChime.play()).toBe(true);
  });
});

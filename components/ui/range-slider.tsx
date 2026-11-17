"use client";
// RangeSlider: two thumbs on one track (a price range). Two native `<input type="range">` (keyboard, screen readers and
// form posts work as usual), the dark bar between them, and the two values above the track like the mockup
// ("$0 … $200"). Thumb styles: `.range-input` in app/globals.css. A new `value` from the parent (the URL changed) resets
// it. `onCommit` runs 300 ms after the last change (a released thumb, or the last of several key presses), so holding
// an arrow key does not fire on every step.
import { useEffect, useRef, useState } from "react";

export type RangeSliderProps = {
  min: number;
  max: number;
  step?: number;
  /** The current [low, high]. */
  value: [number, number];
  /** Form field names of the two inputs. */
  names: [string, string];
  /** Accessible names of the two thumbs ("Minimum price", "Maximum price"). */
  labels: [string, string];
  /** How a value is shown and read out ("$25"). */
  format: (value: number) => string;
  /** Called after a change settles. */
  onCommit?: () => void;
  className?: string;
};

/** Half the thumb's width: the thumbs' centres run from 9px to (width − 9px), and the bars follow them. */
const HALF_THUMB = 9;
const at = (pct: number) => `calc(${pct}% + ${HALF_THUMB - (pct * 2 * HALF_THUMB) / 100}px)`;

export function RangeSlider({ min, max, step = 1, value, names, labels, format, onCommit, className }: RangeSliderProps) {
  const [current, setCurrent] = useState<[number, number]>(value);
  const [given, setGiven] = useState<[number, number]>(value);
  if (given[0] !== value[0] || given[1] !== value[1]) {
    setGiven(value);
    setCurrent(value);
  }

  const lowRef = useRef<HTMLInputElement>(null);
  const highRef = useRef<HTMLInputElement>(null);
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  // The native `change` event fires when a thumb is released and on each key press; React's onChange is `input`.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => commitRef.current?.(), 300);
    };
    const inputs = [lowRef.current, highRef.current];
    for (const input of inputs) input?.addEventListener("change", settle);
    return () => {
      clearTimeout(timer);
      for (const input of inputs) input?.removeEventListener("change", settle);
    };
  }, []);

  const span = max - min || 1;
  const startPct = ((current[0] - min) / span) * 100;
  const endPct = ((max - current[1]) / span) * 100;
  // A low thumb pushed past the middle lies over the high one, so it can be dragged back.
  const lowOnTop = current[0] > min + span / 2;

  return (
    <div className={className}>
      <div aria-hidden="true" className="flex items-center justify-between gap-3 text-small font-semibold text-ink">
        {/* Amounts are always laid out left-to-right, like <Money>, so "15 US$" keeps its order. */}
        <span dir="ltr" className="num inline-block whitespace-nowrap">
          {format(current[0])}
        </span>
        <span dir="ltr" className="num inline-block whitespace-nowrap">
          {format(current[1])}
        </span>
      </div>
      <div className="relative mt-2 h-5">
        <div className="absolute inset-x-[9px] top-1/2 h-1 -translate-y-1/2 rounded-full bg-line-strong" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-inverse"
          style={{ insetInlineStart: at(startPct), insetInlineEnd: at(endPct) }}
        />
        <input
          ref={lowRef}
          type="range"
          className="range-input"
          name={names[0]}
          min={min}
          max={max}
          step={step}
          value={current[0]}
          aria-label={labels[0]}
          aria-valuetext={format(current[0])}
          style={{ zIndex: lowOnTop ? 2 : 1 }}
          onChange={(event) => setCurrent([Math.min(Number(event.currentTarget.value), current[1]), current[1]])}
        />
        <input
          ref={highRef}
          type="range"
          className="range-input"
          name={names[1]}
          min={min}
          max={max}
          step={step}
          value={current[1]}
          aria-label={labels[1]}
          aria-valuetext={format(current[1])}
          style={{ zIndex: lowOnTop ? 1 : 2 }}
          onChange={(event) => setCurrent([current[0], Math.max(Number(event.currentTarget.value), current[0])])}
        />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * Count from the current value to `value` once, on mount.
 *
 * Later changes are applied in place: polling must not replay the animation
 * on every refresh.
 */
export function useCountUp(value: number, duration = 600): number {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const [finished, setFinished] = useState(reduced);
  const current = useRef(display);

  useEffect(() => {
    current.current = display;
  }, [display]);

  useEffect(() => {
    if (reduced) {
      setFinished(true);
      setDisplay(value);
      return;
    }
    if (finished) {
      setDisplay(value);
      return;
    }

    const from = current.current;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      // easeOutCubic matches the CSS ease-out used for the spool fill.
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setFinished(true);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced, finished, duration]);

  return display;
}

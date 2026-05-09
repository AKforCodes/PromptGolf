"use client";

import { useEffect, useRef, useState } from "react";

// Drives a per-second countdown from a server-stamped phase deadline.
// Returns the remaining seconds; calls `onElapsed` exactly once per deadline
// at the moment the countdown reaches zero. Resetting `phaseEndsAt` (new
// phase) re-arms the onElapsed callback so it can fire again next time.
export function usePhaseCountdown(
  phaseEndsAt: number | null,
  onElapsed?: () => void,
): number {
  // Tick a single timestamp; secondsLeft is derived from it. setNow inside
  // setInterval is the subscription pattern, not a direct effect-body setState.
  const [now, setNow] = useState<number>(() => Date.now());
  const firedForRef = useRef<number | null>(null);

  useEffect(() => {
    if (phaseEndsAt == null) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [phaseEndsAt]);

  const secondsLeft =
    phaseEndsAt == null
      ? 0
      : Math.max(0, Math.ceil((phaseEndsAt - now) / 1000));

  useEffect(() => {
    if (phaseEndsAt == null) return;
    if (secondsLeft !== 0) return;
    if (firedForRef.current === phaseEndsAt) return;
    firedForRef.current = phaseEndsAt;
    onElapsed?.();
  }, [phaseEndsAt, secondsLeft, onElapsed]);

  return secondsLeft;
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
} from "framer-motion";

type Mode = "ball" | "flag";

interface Ripple {
  x: number;
  y: number;
  id: number;
}

// Custom JS cursor: golf ball (default) with trailing echoes, swaps to a
// waving flag over interactive elements, and drops a green ripple on click.
// Hidden on touch / reduced-motion / non-fine-pointer (CSS cursor falls back).
export function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<Mode>("ball");
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const rippleIdRef = useRef(0);

  // Raw pointer position
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);

  // Main cursor — fast spring (snappy)
  const sx0 = useSpring(x, { stiffness: 1600, damping: 60, mass: 0.4 });
  const sy0 = useSpring(y, { stiffness: 1600, damping: 60, mass: 0.4 });
  // Trail springs — progressively laggier
  const sx1 = useSpring(x, { stiffness: 700, damping: 40, mass: 0.5 });
  const sy1 = useSpring(y, { stiffness: 700, damping: 40, mass: 0.5 });
  const sx2 = useSpring(x, { stiffness: 380, damping: 30, mass: 0.6 });
  const sy2 = useSpring(y, { stiffness: 380, damping: 30, mass: 0.6 });
  const sx3 = useSpring(x, { stiffness: 200, damping: 22, mass: 0.7 });
  const sy3 = useSpring(y, { stiffness: 200, damping: 22, mass: 0.7 });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!fine || reduced) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature-detection branch must run on client; lazy init would cause SSR/CSR hydration mismatch
    setEnabled(true);
    document.body.classList.add("has-js-cursor");

    const onMove = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const el = e.target as Element | null;
      const interactive = el?.closest(
        "button, a, [role='button'], .press, summary, label, [data-interactive='true']",
      );
      setMode(interactive ? "flag" : "ball");
    };

    const onDown = (e: PointerEvent) => {
      const id = ++rippleIdRef.current;
      setRipples((cur) => [...cur, { x: e.clientX, y: e.clientY, id }]);
      window.setTimeout(() => {
        setRipples((cur) => cur.filter((r) => r.id !== id));
      }, 650);
    };

    const onLeave = () => {
      x.set(-100);
      y.set(-100);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerleave", onLeave);

    return () => {
      document.body.classList.remove("has-js-cursor");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [x, y]);

  if (!enabled) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9999]"
      aria-hidden="true"
    >
      {/* Trailing echoes (back to front) */}
      <motion.span
        style={{
          x: sx3,
          y: sy3,
          position: "fixed",
          left: -7,
          top: -7,
          width: 14,
          height: 14,
        }}
        className="rounded-full border border-ink/60 bg-white/30"
      />
      <motion.span
        style={{
          x: sx2,
          y: sy2,
          position: "fixed",
          left: -6,
          top: -6,
          width: 12,
          height: 12,
        }}
        className="rounded-full border border-ink/70 bg-white/50"
      />
      <motion.span
        style={{
          x: sx1,
          y: sy1,
          position: "fixed",
          left: -5,
          top: -5,
          width: 10,
          height: 10,
        }}
        className="rounded-full border border-ink bg-white/75"
      />

      {/* Click ripples */}
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            initial={{ scale: 0, opacity: 0.85 }}
            animate={{ scale: 2.6, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{
              position: "fixed",
              left: r.x - 18,
              top: r.y - 18,
              width: 36,
              height: 36,
            }}
            className="rounded-full border-[3px] border-golf"
          />
        ))}
      </AnimatePresence>

      {/* Main cursor — single SVG, morphs in place. No remount, no scale, so the tip
          stays anchored on hover and the hotspot never visually shifts. */}
      <motion.div
        style={{
          x: sx0,
          y: sy0,
          position: "fixed",
          left: 0,
          top: 0,
          // Hotspot at SVG (3,3) — keep negative margin so the tip lands on the pointer.
          marginLeft: -3,
          marginTop: -3,
        }}
      >
        <motion.svg
          width="26"
          height="32"
          viewBox="0 0 26 32"
          // Rotate pivots around the tip so the hotspot does not drift.
          style={{ transformOrigin: "3px 3px", display: "block" }}
          animate={{ rotate: mode === "flag" ? -6 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 28 }}
        >
          {/* Arrow body — fill morphs between white and sun on hover */}
          <motion.path
            d="M3 3 L3 25 L9 19 L13 28 L16 27 L12 18 L20 18 Z"
            stroke="#0A0A0A"
            strokeWidth="2.5"
            strokeLinejoin="round"
            animate={{ fill: mode === "flag" ? "#FACC15" : "#FFFFFF" }}
            transition={{ duration: 0.15 }}
          />
        </motion.svg>
      </motion.div>
    </div>
  );
}

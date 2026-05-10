"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import type { ReactNode } from "react";

// Shared visual + motion frame for the game-intro slideshow.
// Wraps each slide in a chunky jklm-styled card and crossfades
// between them with spring physics. Floating decoration shapes drift in the
// backdrop for ambience.

interface IntroFrameProps {
  slide: number;
  totalSlides: number;
  /** Backdrop tint (Tailwind bg-* class). */
  backdrop?: string;
  /** Decoration glyphs to float in the background. */
  decorations?: string[];
  /** Optional accent color for the slide indicator dots. */
  accent?: string;
  children: ReactNode;
}

const slideVariants: Variants = {
  enter: { opacity: 0, y: 28, scale: 0.95 },
  center: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 260, damping: 22 },
  },
  exit: {
    opacity: 0,
    y: -16,
    scale: 0.97,
    transition: { duration: 0.18, ease: "easeIn" },
  },
};

export function IntroFrame({
  slide,
  totalSlides,
  backdrop = "bg-cream",
  decorations = [],
  accent = "bg-golf",
  children,
}: IntroFrameProps) {
  const reduce = useReducedMotion();

  return (
    <main
      className={`relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-6 ${backdrop}`}
    >
      {/* Floating decorations — purely ambient, hidden if reduced-motion */}
      {!reduce && decorations.length > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          {decorations.map((glyph, i) => (
            <motion.span
              key={i}
              className="absolute select-none text-5xl opacity-30 sm:text-6xl"
              initial={{
                x: `${(i * 17) % 100}%`,
                y: `${(i * 29) % 100}%`,
                rotate: 0,
              }}
              animate={{
                y: [`${(i * 29) % 100}%`, `${((i * 29) % 100) - 15}%`, `${(i * 29) % 100}%`],
                rotate: [0, i % 2 === 0 ? 14 : -14, 0],
              }}
              transition={{
                duration: 6 + (i % 3),
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.4,
              }}
            >
              {glyph}
            </motion.span>
          ))}
        </div>
      )}

      <div className="relative w-full max-w-3xl">
        <div className="rounded-3xl border-[3px] border-ink bg-white p-8 shadow-chunky-lg sm:p-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={slide}
              variants={reduce ? undefined : slideVariants}
              initial={reduce ? false : "enter"}
              animate={reduce ? undefined : "center"}
              exit={reduce ? undefined : "exit"}
              className="text-center"
            >
              {children}
            </motion.div>
          </AnimatePresence>

          {/* Slide indicator dots */}
          {totalSlides > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              {Array.from({ length: totalSlides }, (_, i) => (
                <motion.span
                  key={i}
                  aria-hidden="true"
                  animate={{
                    scale: i === slide ? 1.25 : 1,
                  }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  className={`h-2 rounded-full border-2 border-ink transition-colors ${
                    i === slide ? `w-6 ${accent}` : "w-2 bg-white"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

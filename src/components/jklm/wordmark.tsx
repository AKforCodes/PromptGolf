"use client";

import { motion, useReducedMotion } from "framer-motion";

interface WordmarkProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  sm: { plate: "px-4 py-2", title: "text-2xl", flag: "text-xl" },
  md: { plate: "px-6 py-3", title: "text-4xl", flag: "text-3xl" },
  lg: { plate: "px-8 py-4 sm:px-10 sm:py-5", title: "text-5xl sm:text-6xl", flag: "text-4xl sm:text-5xl" },
};

// Brand wordmark — chunky white plate badge with ink border + sun underline.
// Used across landing, lobby, end screens.
export function Wordmark({ size = "lg", className = "" }: WordmarkProps) {
  const reduce = useReducedMotion();
  const cls = SIZE_CLASSES[size];

  return (
    <div
      className={`relative inline-flex items-center gap-3 rounded-3xl border-[4px] border-ink bg-white shadow-chunky ${cls.plate} ${className}`}
    >
      <motion.span
        animate={reduce ? undefined : { rotate: [-6, 6, -6], y: [0, -2, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className={`${cls.flag} leading-none`}
        aria-hidden="true"
      >
        ⛳
      </motion.span>

      <span className="flex flex-col leading-none">
        <span
          className={`font-heading ${cls.title} font-extrabold uppercase tracking-tight`}
        >
          Prompt
        </span>
        <span className="relative inline-block">
          <span
            className={`font-heading ${cls.title} font-extrabold uppercase tracking-tight`}
          >
            Golf
          </span>
          <motion.span
            aria-hidden="true"
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
            style={{ transformOrigin: "left" }}
            className="absolute -bottom-1 left-0 right-0 block h-2 rounded-full bg-sun"
          />
        </span>
      </span>
    </div>
  );
}

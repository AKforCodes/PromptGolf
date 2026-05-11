"use client";

import { motion, useReducedMotion } from "framer-motion";

interface GolfMascotProps {
  size?: number;
  expression?: "happy" | "wink" | "shock";
  bouncing?: boolean;
  className?: string;
}

// Chunky golf-ball mascot with a face. Uses jklm DNA: ink outline, white fill,
// sun-yellow blush. Default expression "happy"; "wink" for hover, "shock" for errors.
export function GolfMascot({
  size = 96,
  expression = "happy",
  bouncing = true,
  className = "",
}: GolfMascotProps) {
  const reduce = useReducedMotion();
  const animate = bouncing && !reduce ? { y: [0, -6, 0] } : { y: 0 };

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      animate={animate}
      transition={{
        duration: 2.4,
        repeat: bouncing && !reduce ? Infinity : 0,
        ease: "easeInOut",
      }}
      className={className}
      role="img"
      aria-label="Prompt Golf mascot"
    >
      {/* Drop shadow on ground */}
      <ellipse cx="60" cy="110" rx="34" ry="6" fill="#0A0A0A" opacity="0.18" />

      {/* Ball body */}
      <circle
        cx="60"
        cy="56"
        r="44"
        fill="#FFFFFF"
        stroke="#0A0A0A"
        strokeWidth="5"
      />

      {/* Dimple cluster (top-left lighter region) */}
      <circle cx="38" cy="40" r="3" fill="#0A0A0A" opacity="0.22" />
      <circle cx="48" cy="32" r="3" fill="#0A0A0A" opacity="0.22" />
      <circle cx="32" cy="56" r="3" fill="#0A0A0A" opacity="0.22" />
      <circle cx="80" cy="36" r="3" fill="#0A0A0A" opacity="0.22" />
      <circle cx="88" cy="58" r="3" fill="#0A0A0A" opacity="0.22" />

      {/* Cheeks */}
      <circle cx="40" cy="64" r="6" fill="#FACC15" opacity="0.85" />
      <circle cx="80" cy="64" r="6" fill="#FACC15" opacity="0.85" />

      {/* Eyes */}
      {expression === "happy" && (
        <>
          <circle cx="48" cy="55" r="5" fill="#0A0A0A" />
          <circle cx="50" cy="53" r="1.6" fill="#FFFFFF" />
          <circle cx="72" cy="55" r="5" fill="#0A0A0A" />
          <circle cx="74" cy="53" r="1.6" fill="#FFFFFF" />
        </>
      )}
      {expression === "wink" && (
        <>
          <path
            d="M43 55 Q48 50 53 55"
            stroke="#0A0A0A"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="72" cy="55" r="5" fill="#0A0A0A" />
          <circle cx="74" cy="53" r="1.6" fill="#FFFFFF" />
        </>
      )}
      {expression === "shock" && (
        <>
          <circle cx="48" cy="55" r="5" fill="#0A0A0A" />
          <circle cx="72" cy="55" r="5" fill="#0A0A0A" />
        </>
      )}

      {/* Mouth */}
      {expression === "shock" ? (
        <ellipse
          cx="60"
          cy="72"
          rx="4"
          ry="5"
          fill="#0A0A0A"
        />
      ) : (
        <path
          d="M48 70 Q60 80 72 70"
          stroke="#0A0A0A"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </motion.svg>
  );
}

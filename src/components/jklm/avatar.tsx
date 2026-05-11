"use client";

import { motion, useReducedMotion, type TargetAndTransition } from "framer-motion";
import {
  avatarUrl,
  initials as toInitials,
  slotColor,
  type AvatarStyle,
} from "@/lib/avatar";

export type AvatarStatus =
  | "host"
  | "ready"
  | "prompting"
  | "voted"
  | "winner"
  | "spectator"
  | null;

const STATUS_BADGES: Record<
  Exclude<AvatarStatus, null>,
  { emoji: string; bg: string; label: string }
> = {
  host: { emoji: "👑", bg: "bg-orange", label: "Host" },
  ready: { emoji: "✓", bg: "bg-golf", label: "Ready" },
  prompting: { emoji: "✍", bg: "bg-sun", label: "Prompting" },
  voted: { emoji: "🗳", bg: "bg-pink", label: "Voted" },
  winner: { emoji: "🏆", bg: "bg-sun", label: "Round winner" },
  spectator: { emoji: "👀", bg: "bg-sky", label: "Spectator" },
};

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<AvatarSize, number> = {
  xs: 28,
  sm: 40,
  md: 56,
  lg: 72,
  xl: 112,
};

const BADGE_PX: Record<AvatarSize, number> = {
  xs: 14,
  sm: 18,
  md: 22,
  lg: 26,
  xl: 32,
};

export type AvatarBounce = "none" | "submit" | "win" | "wiggle" | "shake";

interface AvatarProps {
  seed: string;
  name?: string;
  styleOverride?: AvatarStyle;
  status?: AvatarStatus;
  slot?: number;
  size?: AvatarSize;
  bounce?: AvatarBounce;
  showInitials?: boolean;
  className?: string;
}

const BOUNCE_MAP: Record<Exclude<AvatarBounce, "none">, TargetAndTransition> = {
  submit: { y: [0, -8, 0] },
  win: { rotate: [0, -10, 10, -5, 5, 0], scale: [1, 1.12, 1] },
  wiggle: { rotate: [-4, 4, -4, 0] },
  shake: { x: [0, -4, 4, -4, 4, 0] },
};

export function Avatar({
  seed,
  name,
  styleOverride,
  status = null,
  slot,
  size = "md",
  bounce = "none",
  showInitials = false,
  className = "",
}: AvatarProps) {
  const reduce = useReducedMotion();
  const px = SIZE_PX[size];
  const badgePx = BADGE_PX[size];
  const ring = typeof slot === "number" ? slotColor(slot) : null;
  const animate =
    reduce || bounce === "none" ? undefined : BOUNCE_MAP[bounce];

  const ringPad = ring ? 4 : 0;

  return (
    <span
      className={`relative inline-block ${className}`}
      style={{ width: px + ringPad * 2, height: px + ringPad * 2 }}
    >
      {ring && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full"
          style={{ background: ring, boxShadow: "3px 3px 0 0 #0A0A0A" }}
        />
      )}

      <motion.span
        animate={animate}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="absolute overflow-hidden rounded-full border-[3px] border-ink bg-cream"
        style={{
          left: ringPad,
          top: ringPad,
          width: px,
          height: px,
          boxShadow: ring ? undefined : "3px 3px 0 0 #0A0A0A",
        }}
        role="img"
        aria-label={name ? `${name} avatar` : "avatar"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          // `key` forces a fresh <img> node when src changes so any inline
          // visibility style from a previous failed load can't persist across
          // re-renders (the bug: once an img errored once it stayed hidden
          // forever, masking every subsequent trait change).
          key={avatarUrl(seed, styleOverride)}
          src={avatarUrl(seed, styleOverride)}
          alt=""
          aria-hidden="true"
          className="h-full w-full"
          draggable={false}
          onLoad={(e) => {
            e.currentTarget.style.visibility = "";
          }}
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
        />
      </motion.span>

      {status && STATUS_BADGES[status] && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 z-10 inline-flex items-center justify-center rounded-full border-[2.5px] border-ink ${STATUS_BADGES[status].bg} font-heading font-extrabold leading-none shadow-chunky-sm`}
          style={{
            width: badgePx,
            height: badgePx,
            fontSize: Math.round(badgePx * 0.55),
          }}
          title={STATUS_BADGES[status].label}
          aria-label={STATUS_BADGES[status].label}
        >
          <span aria-hidden="true">{STATUS_BADGES[status].emoji}</span>
        </span>
      )}

      {showInitials && name && (
        <span className="absolute -bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border-2 border-ink bg-white px-1.5 py-0.5 font-heading text-[9px] font-extrabold uppercase tracking-wide tabular-nums shadow-chunky-sm">
          {toInitials(name)}
        </span>
      )}
    </span>
  );
}

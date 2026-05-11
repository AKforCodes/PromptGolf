"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { Player } from "@/lib/types";
import { Avatar } from "@/components/jklm/avatar";
import { Card } from "@/components/jklm/card";

interface LobbyPlayersListProps {
  players: Player[];
  hostId: string;
  selfId: string;
  maxPlayers: number;
}

// Vertical Gartic-style player list — one row per slot, host crown badge,
// ready check, slot color ring tied to joinedAt order. Empty slots shown
// explicitly so the room capacity is always visible.
export function LobbyPlayersList({
  players,
  hostId,
  selfId,
  maxPlayers,
}: LobbyPlayersListProps) {
  const reduce = useReducedMotion();
  const ordered = [...players].sort((a, b) => a.joinedAt - b.joinedAt);
  const empties = Math.max(0, maxPlayers - ordered.length);

  return (
    <Card className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-heading text-base font-extrabold uppercase tracking-wide">
          Players
        </h2>
        <span className="rounded-full border-2 border-ink bg-cream px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide tabular-nums">
          {ordered.length}/{maxPlayers}
        </span>
      </div>

      <motion.ul
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.04 } },
        }}
        className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1"
      >
        {ordered.map((p, idx) => {
          const isHost = p.userId === hostId;
          const isYou = p.userId === selfId;
          const isSpectator = p.role === "spectator";
          const offline = !p.connected;
          const status = isHost
            ? "host"
            : isSpectator
            ? "spectator"
            : p.ready
            ? "ready"
            : null;

          return (
            <motion.li
              key={p.userId}
              variants={{
                hidden: reduce
                  ? { opacity: 1 }
                  : { opacity: 0, x: -10 },
                visible: {
                  opacity: offline ? 0.55 : 1,
                  x: 0,
                  transition: { type: "spring", stiffness: 320, damping: 24 },
                },
              }}
              className={`flex items-center gap-3 rounded-2xl border-[3px] border-ink px-2.5 py-2 shadow-chunky-sm ${
                isYou
                  ? "bg-sun"
                  : isHost
                  ? "bg-white"
                  : p.ready && !isSpectator
                  ? "bg-golf/30"
                  : isSpectator
                  ? "bg-sky/30"
                  : "bg-cream"
              }`}
            >
              <Avatar
                seed={p.avatarSeed || p.userId}
                name={p.name}
                size="sm"
                slot={idx}
                status={status}
              />
              <div className="min-w-0 flex-1 leading-tight">
                <span className="block truncate font-heading text-sm font-extrabold uppercase tracking-tight">
                  {p.name}
                  {isYou && (
                    <span className="ml-1 text-[10px] font-bold text-ink/50">
                      (you)
                    </span>
                  )}
                </span>
                <span className="block font-heading text-[10px] font-bold uppercase tracking-wide text-ink/55">
                  {isSpectator
                    ? "spectator"
                    : isHost
                    ? "host"
                    : p.ready
                    ? "ready"
                    : "waiting…"}
                </span>
              </div>
              <span
                className={`h-3 w-3 shrink-0 rounded-full border-2 border-ink ${
                  offline ? "bg-ink/30" : "bg-golf"
                }`}
                aria-label={offline ? "offline" : "online"}
                title={offline ? "Offline" : "Online"}
              />
            </motion.li>
          );
        })}

        {Array.from({ length: empties }).map((_, i) => (
          <li
            key={`empty-${i}`}
            className="flex items-center gap-3 rounded-2xl border-[3px] border-dashed border-ink/30 bg-cream/50 px-2.5 py-2"
          >
            <span className="inline-block h-10 w-10 shrink-0 rounded-full border-[3px] border-dashed border-ink/30 bg-white/40" />
            <span className="font-heading text-xs font-bold uppercase tracking-wide text-ink/35">
              empty slot
            </span>
          </li>
        ))}
      </motion.ul>
    </Card>
  );
}

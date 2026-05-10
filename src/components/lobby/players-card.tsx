"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { Player } from "@/lib/types";
import { avatarUrl } from "@/lib/avatar";
import { Card } from "@/components/jklm/card";

interface PlayersCardProps {
  players: Player[];
  hostId: string;
  selfId: string;
  maxPlayers: number;
}

export function PlayersCard({
  players,
  hostId,
  selfId,
  maxPlayers,
}: PlayersCardProps) {
  const roomFull = players.length >= maxPlayers;
  const emptySlots = Math.max(0, maxPlayers - players.length);

  return (
    <Card className="mb-6">
      <div className="mb-4 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="font-heading text-2xl font-bold uppercase tracking-wide">
            Players
          </h2>
          <span className="rounded-full border-2 border-ink bg-cream px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide tabular-nums">
            {players.length}/{maxPlayers}
          </span>
        </div>
        {roomFull && (
          <span className="rounded-full border-2 border-ink bg-pink px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide">
            Full
          </span>
        )}
      </div>

      <motion.ul
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.04 } },
        }}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      >
        {players.map((p) => (
          <PlayerTile
            key={p.userId}
            player={p}
            isYou={p.userId === selfId}
            isHost={p.userId === hostId}
          />
        ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <EmptySlot key={`empty-${i}`} />
        ))}
      </motion.ul>
    </Card>
  );
}

interface PlayerTileProps {
  player: Player;
  isYou: boolean;
  isHost: boolean;
}

function PlayerTile({ player: p, isYou, isHost }: PlayerTileProps) {
  const reduce = useReducedMotion();
  const offline = !p.connected;
  const isSpectator = p.role === "spectator";
  const ringColor = isSpectator
    ? "var(--color-sky)"
    : p.ready
    ? "var(--color-golf)"
    : "var(--color-cream)";

  return (
    <motion.li
      variants={{
        hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 12, scale: 0.94 },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { type: "spring", stiffness: 320, damping: 22 },
        },
      }}
      whileHover={reduce ? undefined : { y: -2 }}
      className={`group relative rounded-2xl border-[3px] border-ink p-3 shadow-chunky-sm transition-shadow hover:shadow-chunky ${
        isYou
          ? "bg-sun"
          : p.ready
          ? "bg-[#bbf7d0]"
          : isSpectator
          ? "bg-sky/30"
          : "bg-cream"
      } ${offline ? "opacity-60" : ""}`}
    >
      {isHost && (
        <span
          className="absolute -top-2 -right-2 z-10 grid h-7 w-7 place-items-center rounded-full border-[3px] border-ink bg-sun text-sm shadow-chunky-sm"
          aria-label="Host"
          title="Host"
        >
          <span aria-hidden="true">👑</span>
        </span>
      )}

      <div className="flex flex-col items-center gap-2">
        {/* Avatar with status ring + connection dot */}
        <div className="relative">
          <span
            className="block h-20 w-20 rounded-full p-1"
            style={{
              background:
                p.ready && !isSpectator
                  ? `conic-gradient(${ringColor} 0deg 360deg)`
                  : ringColor,
            }}
            aria-hidden="true"
          >
            <span className="block h-full w-full overflow-hidden rounded-full border-[3px] border-ink bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarUrl(p.avatarSeed || p.userId)}
                alt={`${p.name} avatar`}
                className={`h-full w-full transition-transform duration-300 ${
                  reduce ? "" : "group-hover:scale-110"
                }`}
              />
            </span>
          </span>

          {/* Connection dot */}
          <span
            className={`absolute right-0 bottom-0 h-4 w-4 rounded-full border-[3px] border-ink ${
              offline ? "bg-ink/30" : "bg-golf"
            }`}
            aria-label={offline ? "offline" : "online"}
            title={offline ? "Offline" : "Online"}
          />

          {/* Pulsing ready halo */}
          {p.ready && !reduce && !isSpectator && (
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full border-[3px] border-golf"
              animate={{ scale: [1, 1.15, 1], opacity: [0.7, 0, 0.7] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
            />
          )}
        </div>

        <div className="flex w-full flex-col items-center leading-tight">
          <span className="w-full truncate text-center font-heading text-sm font-bold">
            {p.name}
          </span>
          {isYou && (
            <span className="font-heading text-[10px] font-bold uppercase tracking-wide text-ink/50">
              you
            </span>
          )}
        </div>

        <div className="flex h-5 flex-wrap items-center justify-center gap-1 font-heading text-[10px] font-bold uppercase tracking-wide">
          {isSpectator ? (
            <span className="rounded-full border-2 border-ink bg-sky px-2 py-0.5">
              Spectator
            </span>
          ) : p.ready ? (
            <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-golf px-2 py-0.5">
              <span aria-hidden="true">✓</span> Ready
            </span>
          ) : (
            <span className="rounded-full border-2 border-ink bg-white px-2 py-0.5 text-ink/60">
              Waiting…
            </span>
          )}
        </div>
      </div>
    </motion.li>
  );
}

function EmptySlot() {
  const reduce = useReducedMotion();
  return (
    <motion.li
      variants={{
        hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
      }}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border-[3px] border-dashed border-ink/30 bg-cream/40 p-3"
      aria-hidden="true"
    >
      <div className="grid h-20 w-20 place-items-center rounded-full border-[3px] border-dashed border-ink/30 bg-white/40">
        <span className="font-heading text-2xl text-ink/30">+</span>
      </div>
      <span className="font-heading text-[10px] font-bold uppercase tracking-wide text-ink/40">
        empty slot
      </span>
      <span className="h-5" />
    </motion.li>
  );
}

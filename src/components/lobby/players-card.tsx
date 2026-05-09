"use client";

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

  return (
    <Card className="mb-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-heading text-2xl font-bold uppercase tracking-wide">
          Players
        </h2>
        <span className="font-heading text-sm font-semibold text-ink/60">
          {players.length} / {maxPlayers}
          {roomFull && (
            <span className="ml-2 rounded-full border-2 border-ink bg-pink px-2 py-0.5 text-[10px] uppercase">
              Full
            </span>
          )}
        </span>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {players.map((p) => {
          const isYou = p.userId === selfId;
          const isHost = p.userId === hostId;
          return (
            <li
              key={p.userId}
              className={`relative rounded-2xl border-[3px] border-ink p-3 shadow-chunky-sm ${
                p.ready ? "bg-[#bbf7d0]" : "bg-cream"
              } ${!p.connected ? "opacity-60" : ""}`}
            >
              <div className="flex flex-col items-center gap-2">
                <div className="h-16 w-16 overflow-hidden rounded-full border-[3px] border-ink bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarUrl(p.avatarSeed || p.userId)}
                    alt={`${p.name} avatar`}
                    className="h-full w-full"
                  />
                </div>
                <div className="w-full truncate text-center font-heading text-sm font-bold">
                  {p.name}
                  {isYou && <span className="ml-1 text-ink/50">(you)</span>}
                </div>
                <div className="flex h-5 flex-wrap items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide">
                  {isHost && (
                    <span className="rounded-full border-2 border-ink bg-sun px-2 py-0.5">
                      Host
                    </span>
                  )}
                  {p.role === "spectator" && (
                    <span className="rounded-full border-2 border-ink bg-sky px-2 py-0.5">
                      Spec
                    </span>
                  )}
                  {p.ready ? (
                    <span className="rounded-full border-2 border-ink bg-golf px-2 py-0.5">
                      Ready
                    </span>
                  ) : (
                    <span className="rounded-full border-2 border-ink bg-white px-2 py-0.5 text-ink/60">
                      Waiting
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

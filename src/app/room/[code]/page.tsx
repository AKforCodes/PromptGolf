"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface RoomPageProps {
  params: Promise<{ code: string }>;
}

interface Player {
  id: string;
  name: string;
  ready: boolean;
  isHost: boolean;
  isYou: boolean;
}

const MOCK_REMOTE_PLAYERS: Omit<Player, "isYou">[] = [
  { id: "p2", name: "Sammy", ready: true, isHost: false },
  { id: "p3", name: "Lola", ready: false, isHost: false },
  { id: "p4", name: "Pip", ready: true, isHost: false },
];

function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${encodeURIComponent(seed)}&backgroundColor=fef3c7,fde68a,fef9c3,bbf7d0,bae6fd,fbcfe8`;
}

function RoomLobby({ code }: { code: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const isHost = search.get("host") === "1";
  const myName = search.get("name") || "Guest-01";

  const [ready, setReady] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const me: Player = useMemo(
    () => ({
      id: "you",
      name: myName,
      ready: isHost ? true : ready,
      isHost,
      isYou: true,
    }),
    [myName, isHost, ready]
  );

  const players: Player[] = useMemo(() => {
    const remotes = MOCK_REMOTE_PLAYERS.map((p) => ({ ...p, isYou: false }));
    if (isHost) {
      return [me, ...remotes];
    }
    const host: Player = {
      id: "p1",
      name: "Akin",
      ready: true,
      isHost: true,
      isYou: false,
    };
    return [host, ...remotes, me];
  }, [me, isHost]);

  const allReady = players.every((p) => p.ready);
  const canStart = isHost && allReady && players.length >= 2;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Clipboard failed:", err);
    }
  };

  const handleStart = () => {
    console.log("Start round (mock) — would broadcast to room", code);
  };

  const handleLeave = () => {
    router.push("/");
  };

  return (
    <main className="flex flex-1 flex-col px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={handleLeave}
            className="press rounded-2xl border-[3px] border-[#0A0A0A] bg-white px-4 py-2 font-heading text-sm font-bold uppercase tracking-wide shadow-chunky-sm cursor-pointer"
          >
            ← Leave
          </button>
          <div className="font-heading text-xl">⛳️ PROMPT GOLF</div>
        </div>

        <div className="mb-6 rounded-3xl border-[3px] border-[#0A0A0A] bg-white p-6 text-center shadow-chunky-lg">
          <p className="font-heading text-sm font-semibold uppercase tracking-wide text-[#0A0A0A]/60">
            room code
          </p>
          <div className="mt-2 font-heading text-7xl font-bold tracking-[0.3em] sm:text-8xl">
            {code}
          </div>
          <button
            onClick={handleCopy}
            className="press mt-4 rounded-2xl border-[3px] border-[#0A0A0A] bg-[#38BDF8] px-6 py-3 font-heading text-base font-bold uppercase tracking-wide shadow-chunky-sm cursor-pointer"
          >
            {copied ? "✓ Copied!" : "Copy Code"}
          </button>
        </div>

        <div className="mb-6 rounded-3xl border-[3px] border-[#0A0A0A] bg-white p-6 shadow-chunky-lg">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-heading text-2xl font-bold uppercase tracking-wide">
              Players
            </h2>
            <span className="font-heading text-sm font-semibold text-[#0A0A0A]/60">
              {players.filter((p) => p.ready).length} / {players.length} ready
            </span>
          </div>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {players.map((p) => (
              <li
                key={p.id}
                className={`relative rounded-2xl border-[3px] border-[#0A0A0A] p-3 shadow-chunky-sm ${
                  p.ready ? "bg-[#bbf7d0]" : "bg-[#FFF8E7]"
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="h-16 w-16 overflow-hidden rounded-full border-[3px] border-[#0A0A0A] bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={avatarUrl(p.id + p.name)}
                      alt={`${p.name} avatar`}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="w-full truncate text-center font-heading text-sm font-bold">
                    {p.name}
                    {p.isYou && (
                      <span className="ml-1 text-[#0A0A0A]/50">(you)</span>
                    )}
                  </div>
                  <div className="flex h-5 items-center gap-1 text-[10px] font-bold uppercase tracking-wide">
                    {p.isHost && (
                      <span className="rounded-full border-2 border-[#0A0A0A] bg-[#FACC15] px-2 py-0.5">
                        Host
                      </span>
                    )}
                    {p.ready ? (
                      <span className="rounded-full border-2 border-[#0A0A0A] bg-[#22C55E] px-2 py-0.5">
                        Ready
                      </span>
                    ) : (
                      <span className="rounded-full border-2 border-[#0A0A0A] bg-white px-2 py-0.5 text-[#0A0A0A]/60">
                        Waiting
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          {!isHost && (
            <button
              onClick={() => setReady((r) => !r)}
              className={`press rounded-2xl border-[3px] border-[#0A0A0A] py-5 font-heading text-2xl font-bold uppercase tracking-wide shadow-chunky cursor-pointer ${
                ready ? "bg-[#22C55E]" : "bg-[#FACC15]"
              }`}
            >
              {ready ? "✓ Ready" : "Tap to Ready Up"}
            </button>
          )}
          {isHost && (
            <button
              onClick={handleStart}
              disabled={!canStart}
              className="press rounded-2xl border-[3px] border-[#0A0A0A] bg-[#22C55E] py-5 font-heading text-2xl font-bold uppercase tracking-wide shadow-chunky cursor-pointer disabled:cursor-not-allowed disabled:bg-[#0A0A0A]/10 disabled:text-[#0A0A0A]/40 disabled:shadow-chunky-sm"
            >
              {canStart
                ? "Start Round"
                : players.length < 2
                ? "Waiting for players…"
                : "Waiting on ready up…"}
            </button>
          )}
          <p className="text-center font-heading text-xs text-[#0A0A0A]/50">
            share the room code so friends can join
          </p>
        </div>
      </div>
    </main>
  );
}

export default function RoomPage({ params }: RoomPageProps) {
  const { code } = use(params);
  const upper = code.toUpperCase();

  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <div className="font-heading text-2xl">Loading room…</div>
        </main>
      }
    >
      <RoomLobby code={upper} />
    </Suspense>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { tryCatch } from "@/lib/result";

type Mode = "menu" | "join";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomCode(): string {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

function randomGuestName(): string {
  const n = Math.floor(Math.random() * 99) + 1;
  return `Guest-${n.toString().padStart(2, "0")}`;
}

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState<string>("");
  const [mode, setMode] = useState<Mode>("menu");
  const [code, setCode] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(randomGuestName());
    const seed = async () => {
      const [err] = await tryCatch(fetch("/api/v1/user/seed"));
      if (err) {
        console.error("Failed to seed user:", err);
      }
    };
    seed();
  }, []);

  const handleStart = () => {
    if (!name.trim()) {
      setError("Pick a name first");
      return;
    }
    const newCode = randomCode();
    router.push(`/room/${newCode}?host=1&name=${encodeURIComponent(name)}`);
  };

  const handleJoin = () => {
    setError(null);
    setMode("join");
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = code.trim().toUpperCase();
    if (cleaned.length !== 4) {
      setError("Room code is 4 letters");
      return;
    }
    if (!name.trim()) {
      setError("Pick a name first");
      return;
    }
    router.push(`/room/${cleaned}?name=${encodeURIComponent(name)}`);
  };

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <div className="mb-2 text-6xl">⛳️</div>
          <h1 className="font-heading text-5xl font-bold tracking-tight sm:text-6xl">
            PROMPT GOLF
          </h1>
          <p className="mt-2 font-heading text-lg text-[#0A0A0A]/70">
            shortest prompt wins
          </p>
        </div>

        <div className="rounded-3xl border-[3px] border-[#0A0A0A] bg-white p-8 shadow-chunky-lg sm:p-10">
          <label className="mb-2 block font-heading text-sm font-semibold uppercase tracking-wide text-[#0A0A0A]/70">
            your name
          </label>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value.slice(0, 16));
              setError(null);
            }}
            maxLength={16}
            className="w-full rounded-2xl border-[3px] border-[#0A0A0A] bg-[#FFF8E7] px-5 py-4 text-center font-heading text-2xl font-semibold outline-none transition focus:bg-white"
            placeholder="Guest-01"
            aria-label="Player name"
          />

          {mode === "menu" ? (
            <div className="mt-6 flex flex-col gap-4">
              <button
                onClick={handleStart}
                className="press rounded-2xl border-[3px] border-[#0A0A0A] bg-[#22C55E] py-5 font-heading text-2xl font-bold uppercase tracking-wide text-[#0A0A0A] shadow-chunky cursor-pointer"
              >
                Start Game
              </button>
              <button
                onClick={handleJoin}
                className="press rounded-2xl border-[3px] border-[#0A0A0A] bg-[#FACC15] py-5 font-heading text-2xl font-bold uppercase tracking-wide text-[#0A0A0A] shadow-chunky cursor-pointer"
              >
                Join Game
              </button>
            </div>
          ) : (
            <form onSubmit={handleJoinSubmit} className="mt-6 flex flex-col gap-4">
              <label className="block font-heading text-sm font-semibold uppercase tracking-wide text-[#0A0A0A]/70">
                room code
              </label>
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4));
                  setError(null);
                }}
                autoFocus
                maxLength={4}
                inputMode="text"
                autoCapitalize="characters"
                spellCheck={false}
                className="w-full rounded-2xl border-[3px] border-[#0A0A0A] bg-[#FFF8E7] px-5 py-4 text-center font-heading text-4xl font-bold uppercase tracking-[0.5em] outline-none transition focus:bg-white"
                placeholder="ABCD"
                aria-label="Room code"
              />
              <button
                type="submit"
                className="press rounded-2xl border-[3px] border-[#0A0A0A] bg-[#22C55E] py-5 font-heading text-2xl font-bold uppercase tracking-wide text-[#0A0A0A] shadow-chunky cursor-pointer"
              >
                Enter Room
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("menu");
                  setCode("");
                  setError(null);
                }}
                className="press rounded-2xl border-[3px] border-[#0A0A0A] bg-white py-3 font-heading text-base font-semibold uppercase tracking-wide text-[#0A0A0A] shadow-chunky-sm cursor-pointer"
              >
                Back
              </button>
            </form>
          )}

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl border-[3px] border-[#0A0A0A] bg-[#F472B6] px-4 py-2 text-center font-heading text-sm font-semibold"
            >
              {error}
            </p>
          )}
        </div>

        <p className="mt-8 text-center font-heading text-sm text-[#0A0A0A]/50">
          tap fast · think short · win big
        </p>
      </div>
    </main>
  );
}

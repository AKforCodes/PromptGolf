"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { tryCatch } from "@/lib/result";
import {
  ApiError,
  createRoom,
  joinRoom,
  seedUser,
  DEFAULT_ROOM_SETTINGS,
} from "@/lib/api";
import { randomGuestName } from "@/lib/guest-name";
import { Button } from "@/components/jklm/button";
import { Card } from "@/components/jklm/card";

type Mode = "menu" | "join";

const NAME_MAX = 16;
const CODE_LEN = 4;

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [mode, setMode] = useState<Mode>("menu");
  const [code, setCode] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  useEffect(() => {
    setName(randomGuestName());
    const seed = async () => {
      const [err, data] = await tryCatch(seedUser());
      if (err) {
        console.error("Failed to seed user:", err);
        return;
      }
      setUserId(data.user_id);
    };
    void seed();
  }, []);

  const ensureUserId = async (): Promise<string | null> => {
    if (userId) return userId;
    const [err, data] = await tryCatch(seedUser());
    if (err) {
      setError("Could not start a session. Try again.");
      return null;
    }
    setUserId(data.user_id);
    return data.user_id;
  };

  const handleStart = async () => {
    if (busy) return;
    if (!name.trim()) {
      setError("Pick a name first");
      return;
    }
    setError(null);
    setBusy(true);

    const uid = await ensureUserId();
    if (!uid) {
      setBusy(false);
      return;
    }

    const [err, data] = await tryCatch(
      createRoom(name.trim(), uid, DEFAULT_ROOM_SETTINGS)
    );
    if (err) {
      setError(
        err instanceof ApiError ? `Couldn't create room (${err.status})` : "Network error"
      );
      setBusy(false);
      return;
    }

    router.push(`/room/${data.room.code}`);
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const cleaned = code.trim().toUpperCase();
    if (cleaned.length !== CODE_LEN) {
      setError(`Room code is ${CODE_LEN} letters`);
      return;
    }
    if (!name.trim()) {
      setError("Pick a name first");
      return;
    }
    setError(null);
    setBusy(true);

    const uid = await ensureUserId();
    if (!uid) {
      setBusy(false);
      return;
    }

    const [err] = await tryCatch(joinRoom(cleaned, name.trim(), uid));
    if (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("Room not found");
      } else if (err instanceof ApiError) {
        setError(`Couldn't join (${err.status})`);
      } else {
        setError("Network error");
      }
      setBusy(false);
      return;
    }

    router.push(`/room/${cleaned}`);
  };

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <div className="mb-2 text-6xl">⛳️</div>
          <h1 className="font-heading text-5xl font-bold tracking-tight sm:text-6xl">
            PROMPT GOLF
          </h1>
          <p className="mt-2 font-heading text-lg text-ink/70">
            shortest prompt wins
          </p>
        </div>

        <Card className="p-8 sm:p-10">
          <label className="mb-2 block font-heading text-sm font-semibold uppercase tracking-wide text-ink/70">
            your name
          </label>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value.slice(0, NAME_MAX));
              setError(null);
            }}
            maxLength={NAME_MAX}
            disabled={busy}
            className="w-full rounded-2xl border-[3px] border-ink bg-cream px-5 py-4 text-center font-heading text-2xl font-semibold outline-none transition focus:bg-white disabled:opacity-60"
            placeholder="Guest-01"
            aria-label="Player name"
          />

          {mode === "menu" ? (
            <div className="mt-6 flex flex-col gap-4">
              <Button
                variant="primary"
                size="lg"
                full
                onClick={handleStart}
                disabled={busy}
              >
                {busy ? "Creating…" : "Start Game"}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                full
                onClick={() => {
                  setError(null);
                  setMode("join");
                }}
                disabled={busy}
              >
                Join Game
              </Button>
            </div>
          ) : (
            <form onSubmit={handleJoinSubmit} className="mt-6 flex flex-col gap-4">
              <label className="block font-heading text-sm font-semibold uppercase tracking-wide text-ink/70">
                room code
              </label>
              <input
                value={code}
                onChange={(e) => {
                  setCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, CODE_LEN)
                  );
                  setError(null);
                }}
                autoFocus
                maxLength={CODE_LEN}
                inputMode="text"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={busy}
                className="w-full rounded-2xl border-[3px] border-ink bg-cream px-5 py-4 text-center font-heading text-4xl font-bold uppercase tracking-[0.5em] outline-none transition focus:bg-white disabled:opacity-60"
                placeholder="ABCD"
                aria-label="Room code"
              />
              <Button type="submit" variant="primary" size="lg" full disabled={busy}>
                {busy ? "Joining…" : "Enter Room"}
              </Button>
              <Button
                type="button"
                variant="neutral"
                size="md"
                full
                onClick={() => {
                  setMode("menu");
                  setCode("");
                  setError(null);
                }}
                disabled={busy}
              >
                Back
              </Button>
            </form>
          )}

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl border-[3px] border-ink bg-pink px-4 py-2 text-center font-heading text-sm font-semibold"
            >
              {error}
            </p>
          )}
        </Card>

        <p className="mt-8 text-center font-heading text-sm text-ink/50">
          tap fast · think short · win big
        </p>
      </div>
    </main>
  );
}

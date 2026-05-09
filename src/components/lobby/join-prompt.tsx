"use client";

import { useState } from "react";
import { Button } from "@/components/jklm/button";
import { Card } from "@/components/jklm/card";

interface JoinPromptProps {
  code: string;
  initialName: string;
  busy: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  onClearError: () => void;
}

const NAME_MAX = 16;

export function JoinPrompt({
  code,
  initialName,
  busy,
  error,
  onSubmit,
  onCancel,
  onClearError,
}: JoinPromptProps) {
  const [name, setName] = useState<string>(initialName);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(name.trim());
  };

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <div className="mb-2 text-5xl">⛳️</div>
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            JOINING ROOM
          </h1>

          <div className="mx-auto mt-5 inline-block rounded-3xl border-[3px] border-ink bg-white px-6 py-4 shadow-chunky-lg">
            <p className="font-heading text-xs font-semibold uppercase tracking-wide text-ink/60">
              game code
            </p>
            <div className="font-heading text-5xl font-bold tracking-[0.3em] sm:text-6xl">
              {code}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card elevation="lg" className="p-8 sm:p-10">
            <label className="mb-2 block font-heading text-sm font-semibold uppercase tracking-wide text-ink/70">
              your name
            </label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value.slice(0, NAME_MAX));
                onClearError();
              }}
              maxLength={NAME_MAX}
              autoFocus
              disabled={busy}
              className="w-full rounded-2xl border-[3px] border-ink bg-cream px-5 py-4 text-center font-heading text-2xl font-semibold outline-none transition focus:bg-white disabled:opacity-60"
              placeholder="Guest-01"
              aria-label="Player name"
            />

            <div className="mt-6 flex flex-col gap-3">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                full
                disabled={busy}
              >
                {busy ? "Joining…" : "Join Game"}
              </Button>
              <Button
                type="button"
                variant="neutral"
                size="md"
                full
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-xl border-[3px] border-ink bg-pink px-4 py-2 text-center font-heading text-sm font-semibold"
              >
                {error}
              </p>
            )}
          </Card>
        </form>
      </div>
    </main>
  );
}

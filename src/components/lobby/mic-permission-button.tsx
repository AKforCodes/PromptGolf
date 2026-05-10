"use client";

import { useEffect, useState } from "react";

type MicState = "unknown" | "granted" | "denied" | "requesting";

export function MicPermissionButton() {
  const [state, setState] = useState<MicState>("unknown");

  const supported =
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  // Check if permission was already granted in a prior session.
  useEffect(() => {
    if (!supported) return;
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((result) => {
        if (result.state === "granted") setState("granted");
        if (result.state === "denied") setState("denied");
        result.onchange = () => {
          if (result.state === "granted") setState("granted");
          if (result.state === "denied") setState("denied");
        };
      })
      .catch(() => {
        // permissions API not supported — stay "unknown"
      });
  }, [supported]);

  if (!supported || state === "granted") {
    return state === "granted" ? (
      <div className="flex items-center justify-center gap-2 rounded-2xl border-[3px] border-ink bg-golf px-4 py-2.5 font-heading text-sm font-bold shadow-chunky-sm">
        <span aria-hidden="true">🎤</span> Mic ready
      </div>
    ) : null;
  }

  const handleClick = async () => {
    if (state === "requesting") return;
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setState("granted");
    } catch {
      setState("denied");
    }
  };

  if (state === "denied") {
    return (
      <div className="rounded-2xl border-[3px] border-ink bg-pink px-4 py-2.5 text-center font-heading text-sm font-semibold">
        🎤 Mic blocked — allow access in browser settings to use voice prompting
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === "requesting"}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border-[3px] border-ink bg-white px-4 py-2.5 font-heading text-sm font-bold shadow-chunky-sm transition-colors hover:bg-cream press disabled:opacity-60"
    >
      <span aria-hidden="true">🎤</span>
      {state === "requesting" ? "Requesting access…" : "Enable mic for voice prompting"}
    </button>
  );
}

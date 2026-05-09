"use client";

import { useState } from "react";
import { tryCatch } from "@/lib/result";
import { Button } from "@/components/jklm/button";
import { Card } from "@/components/jklm/card";
import { CheckIcon, CopyIcon, LinkIcon } from "@/components/icons";

interface ShareCardProps {
  code: string;
  shareUrl: string;
}

const FEEDBACK_MS = 1500;

export function ShareCard({ code, shareUrl }: ShareCardProps) {
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const copy = async (text: string, setter: (v: boolean) => void) => {
    const [err] = await tryCatch(navigator.clipboard.writeText(text));
    if (err) {
      console.error("Clipboard failed:", err);
      return;
    }
    setter(true);
    setTimeout(() => setter(false), FEEDBACK_MS);
  };

  return (
    <Card className="mb-6 text-center">
      <p className="font-heading text-sm font-semibold uppercase tracking-wide text-ink/60">
        room code
      </p>
      <div className="mt-2 font-heading text-7xl font-bold tracking-[0.3em] sm:text-8xl">
        {code}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-center">
        <Button
          variant="secondary"
          size="md"
          onClick={() => copy(code, setCopiedCode)}
          aria-label="Copy room code"
        >
          {copiedCode ? <CheckIcon /> : <CopyIcon />}
          {copiedCode ? "Copied" : "Copy Code"}
        </Button>
        <Button
          variant="info"
          size="md"
          onClick={() => copy(shareUrl, setCopiedLink)}
          aria-label="Copy share link"
        >
          <LinkIcon />
          {copiedLink ? "Copied" : "Copy Link"}
        </Button>
      </div>

      <div className="mt-4 flex items-center justify-center">
        <div
          className="max-w-full truncate rounded-xl border-[3px] border-dashed border-ink/40 bg-cream px-3 py-2 font-mono text-xs text-ink/70 sm:text-sm"
          title={shareUrl}
        >
          {shareUrl || "…"}
        </div>
      </div>
    </Card>
  );
}

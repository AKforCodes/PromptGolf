"use client";

import {
  AVATAR_STYLES,
  BG_COLOR_SWATCHES,
  STYLE_TRAITS,
  cycleTrait,
  getTraitIndex,
  resetTraits,
  type AvatarOptions,
  type AvatarStyle,
} from "@/lib/avatar";
import { useSoundEffect } from "@/components/sound-provider";

interface AvatarEditorProps {
  style: AvatarStyle;
  options: AvatarOptions;
  onStyleChange: (s: AvatarStyle) => void;
  onOptionsChange: (next: AvatarOptions) => void;
  disabled?: boolean;
}

export function AvatarEditor({
  style,
  options,
  onStyleChange,
  onOptionsChange,
  disabled = false,
}: AvatarEditorProps) {
  const { playBubble } = useSoundEffect();
  const traitDefs = STYLE_TRAITS[style];

  const onCycle = (traitId: string, delta: number) => {
    playBubble();
    onOptionsChange(cycleTrait(style, traitId, delta, options));
  };

  const setBg = (color: string) => {
    playBubble();
    if (color === options.backgroundColor) {
      const { backgroundColor: _bg, ...rest } = options;
      void _bg;
      onOptionsChange(rest);
      return;
    }
    onOptionsChange({ ...options, backgroundColor: color });
  };

  return (
    <div className="w-full space-y-3">
      {/* Style family picker */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {AVATAR_STYLES.map((s) => {
          const active = s.id === style;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                playBubble();
                onStyleChange(s.id);
              }}
              disabled={disabled}
              aria-pressed={active}
              title={s.label}
              className={`press inline-flex h-9 items-center gap-1 rounded-xl border-[2.5px] border-ink px-2.5 font-heading text-xs font-extrabold uppercase tracking-wide cursor-pointer disabled:cursor-not-allowed ${
                active ? "bg-golf shadow-chunky-sm" : "bg-white"
              }`}
            >
              <span aria-hidden="true">{s.emoji}</span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Trait arrow rows */}
      <div>
        <div className="mb-1 flex items-baseline justify-between px-1">
          <span className="font-heading text-[10px] font-bold uppercase tracking-wide text-ink/55">
            Customize
          </span>
          <button
            type="button"
            onClick={() => {
              playBubble();
              onOptionsChange(resetTraits(options));
            }}
            disabled={disabled}
            className="press inline-flex items-center gap-1 rounded-full border-2 border-ink bg-white px-2 py-0.5 font-heading text-[9px] font-bold uppercase tracking-wide cursor-pointer disabled:cursor-not-allowed"
          >
            ↺ reset
          </button>
        </div>
        <div className="space-y-1.5">
          {traitDefs.map((t) => {
            const idx = getTraitIndex(style, t.id, options);
            return (
              <TraitRow
                key={t.id}
                label={t.label}
                current={idx + 1}
                total={t.values.length}
                disabled={disabled}
                onPrev={() => onCycle(t.id, -1)}
                onNext={() => onCycle(t.id, +1)}
              />
            );
          })}
        </div>
      </div>

      {/* Background swatches */}
      <div>
        <div className="mb-1 px-1 font-heading text-[10px] font-bold uppercase tracking-wide text-ink/55">
          Background
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {BG_COLOR_SWATCHES.map((c) => {
            const active = (options.backgroundColor ?? "") === c.value;
            const isRandom = c.value === "";
            return (
              <button
                key={c.value || "random"}
                type="button"
                onClick={() => setBg(c.value)}
                disabled={disabled}
                aria-pressed={active}
                title={c.label}
                className={`press inline-flex h-7 w-7 items-center justify-center rounded-full border-[2.5px] border-ink cursor-pointer disabled:cursor-not-allowed ${
                  active
                    ? "shadow-chunky-sm ring-2 ring-ink ring-offset-2 ring-offset-cream"
                    : ""
                }`}
                style={{
                  backgroundColor: isRandom ? "#FFFFFF" : `#${c.value}`,
                }}
              >
                {isRandom && (
                  <span aria-hidden="true" className="font-heading text-[10px] font-extrabold">
                    🎲
                  </span>
                )}
                <span className="sr-only">{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface TraitRowProps {
  label: string;
  current: number;
  total: number;
  disabled?: boolean;
  onPrev: () => void;
  onNext: () => void;
}

function TraitRow({
  label,
  current,
  total,
  disabled = false,
  onPrev,
  onNext,
}: TraitRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl border-[2.5px] border-ink bg-white px-2 py-1 shadow-chunky-sm">
      <span className="min-w-[3.5rem] font-heading text-[11px] font-extrabold uppercase tracking-wide text-ink/65">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          disabled={disabled}
          aria-label={`Previous ${label}`}
          className="press inline-flex h-7 w-7 items-center justify-center rounded-lg border-2 border-ink bg-cream font-heading text-sm font-bold cursor-pointer disabled:cursor-not-allowed"
        >
          ←
        </button>
        <span className="inline-flex min-w-[3.5rem] items-center justify-center rounded-lg border-2 border-ink bg-cream px-2 py-0.5 font-heading text-[11px] font-bold uppercase tracking-wide tabular-nums">
          {current} / {total}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={disabled}
          aria-label={`Next ${label}`}
          className="press inline-flex h-7 w-7 items-center justify-center rounded-lg border-2 border-ink bg-cream font-heading text-sm font-bold cursor-pointer disabled:cursor-not-allowed"
        >
          →
        </button>
      </div>
    </div>
  );
}

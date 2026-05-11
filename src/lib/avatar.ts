// jklm-saturated palette — no pastel washout. DiceBear picks one per seed
// unless an explicit backgroundColor option is set in the avatar's options.
const DEFAULT_BG_PALETTE = "22C55E,FACC15,38BDF8,F472B6,FFF8E7";

export type AvatarStyle =
  | "fun-emoji"
  | "bottts-neutral"
  | "pixel-art"
  | "croodles-neutral";

export const AVATAR_STYLES: ReadonlyArray<{
  id: AvatarStyle;
  label: string;
  emoji: string;
}> = [
  { id: "fun-emoji", label: "Emoji", emoji: "😀" },
  { id: "bottts-neutral", label: "Robot", emoji: "🤖" },
  { id: "pixel-art", label: "Pixel", emoji: "👾" },
  { id: "croodles-neutral", label: "Doodle", emoji: "✏️" },
];

const STYLE_IDS = new Set(AVATAR_STYLES.map((s) => s.id));

// ============================================================================
// Gallery seeds — a curated bank of distinctive seeds. Each one produces a
// visibly different avatar across all DiceBear styles, so a player can pick
// a "look" without us having to hand-tune individual eyes/mouth/etc params.
// Larger banks = more variety. Words chosen to be short + memorable.
// ============================================================================

export const GALLERY_SEEDS: ReadonlyArray<string> = [
  "Atlas", "Bolt", "Cosmo", "Disco", "Echo", "Fizz",
  "Glitch", "Hex", "Iris", "Jett", "Kiwi", "Lyra",
  "Maple", "Nova", "Onyx", "Pixel", "Quill", "Rune",
  "Sage", "Tango", "Umber", "Vex", "Whiz", "Xeno",
  "Yarn", "Zinc", "Blip", "Drift", "Ember", "Frost",
  "Gizmo", "Halo", "Indigo", "Jolt", "Kobalt", "Lumen",
];

// Map of DiceBear option params (eyes, mouth, backgroundColor, etc.) to chosen
// values. Declared here so the trait helpers below can reference it.
export type AvatarOptions = Record<string, string>;

// Trait dimensions per style. Each entry is a "knob" the user can cycle
// through. Trait values are sent to DiceBear as named query params so each
// click changes ONLY that one feature on the avatar. Values must match the
// DiceBear v9 schema exactly — listed values below have been verified.
export interface AvatarTraitDef {
  id: string;        // DiceBear v9 param name for this style
  label: string;
  values: string[];  // ordered list of valid option values
}

// Helper — build variant01..variantNN list
const variants = (start: number, end: number): string[] =>
  Array.from({ length: end - start + 1 }, (_, i) =>
    `variant${String(start + i).padStart(2, "0")}`,
  );

export const STYLE_TRAITS: Record<AvatarStyle, AvatarTraitDef[]> = {
  "fun-emoji": [
    {
      id: "eyes",
      label: "Eyes",
      values: [
        "closed", "closed2", "crying", "cute", "glasses", "love",
        "pissed", "plain", "sad", "shades", "sleepClose", "stars",
        "tearDrop", "wink", "wink2",
      ],
    },
    {
      id: "mouth",
      label: "Mouth",
      values: [
        "cute", "faceMask", "kissHeart", "lilSmile", "plain", "sad",
        "shout", "smileLol", "smileTeeth", "tongueOut", "wacky",
      ],
    },
  ],
  "bottts-neutral": [
    {
      id: "eyes",
      label: "Eyes",
      values: [
        "bulging", "dizzy", "eva", "frame1", "frame2", "glow",
        "happy", "hearts", "robocop", "round", "roundFrame01",
        "roundFrame02", "sensor", "shade01",
      ],
    },
    {
      id: "mouth",
      label: "Mouth",
      values: [
        "bite", "diagram", "grill01", "grill02", "grill03",
        "smile01", "smile02", "square01", "square02",
      ],
    },
    {
      id: "top",
      label: "Top",
      values: [
        "antenna", "antennaCrooked", "bulb01", "glowingBulb01",
        "glowingBulb02", "horns", "lights", "pyramid", "radar",
      ],
    },
    {
      id: "sides",
      label: "Sides",
      values: [
        "antenna01", "antenna02", "cables01", "cables02",
        "round", "square", "squareAssymetric",
      ],
    },
  ],
  "pixel-art": [
    { id: "eyes",        label: "Eyes",      values: variants(1, 12) },
    {
      id: "mouth",
      label: "Mouth",
      values: [
        "happy01", "happy02", "happy03", "happy04", "happy05",
        "happy06", "happy07", "happy08", "happy09", "happy10",
        "sad01", "sad02", "sad03", "sad04", "sad05",
        "sad06", "sad07", "sad08", "sad09",
      ],
    },
    { id: "hair",        label: "Hair",      values: variants(1, 20) },
    { id: "glasses",     label: "Glasses",   values: variants(1, 5)  },
    { id: "accessories", label: "Accessory", values: variants(1, 10) },
  ],
  "croodles-neutral": [
    { id: "eyes",  label: "Eyes",  values: variants(1, 15) },
    { id: "mouth", label: "Mouth", values: variants(1, 15) },
    { id: "top",   label: "Hair",  values: variants(1, 15) },
    { id: "nose",  label: "Nose",  values: variants(1, 8)  },
  ],
};

// Map state — current option value per trait, plus backgroundColor.
// We collapse traits + bg into one AvatarOptions record so there's a single
// source of truth that goes into the packed seed.

export function getTraitIndex(
  style: AvatarStyle,
  traitId: string,
  options: AvatarOptions,
): number {
  const def = STYLE_TRAITS[style].find((t) => t.id === traitId);
  if (!def) return 0;
  const current = options[traitId];
  if (!current) return 0;
  const idx = def.values.indexOf(current);
  return idx < 0 ? 0 : idx;
}

export function cycleTrait(
  style: AvatarStyle,
  traitId: string,
  delta: number,
  options: AvatarOptions,
): AvatarOptions {
  const def = STYLE_TRAITS[style].find((t) => t.id === traitId);
  if (!def) return options;
  const cur = getTraitIndex(style, traitId, options);
  const next = (cur + delta + def.values.length) % def.values.length;
  return { ...options, [traitId]: def.values[next]! };
}

export function resetTraits(options: AvatarOptions): AvatarOptions {
  // Keep only backgroundColor — clear every per-trait selection.
  const next: AvatarOptions = {};
  if (options.backgroundColor) next.backgroundColor = options.backgroundColor;
  return next;
}

// Background color swatches shown in the editor — drawn from brand palette.
export const BG_COLOR_SWATCHES: ReadonlyArray<{ value: string; label: string }> =
  [
    { value: "", label: "Random" },
    { value: "22C55E", label: "Green" },
    { value: "FACC15", label: "Sun" },
    { value: "38BDF8", label: "Sky" },
    { value: "F472B6", label: "Pink" },
    { value: "F97316", label: "Orange" },
    { value: "A855F7", label: "Purple" },
    { value: "FFF8E7", label: "Cream" },
  ];

// ============================================================================
// Seed packing — encodes style + options into a single string so it can
// travel through the existing `Player.avatarSeed` field without schema change.
//
// Format: "<style>:<rawSeed>?<query>"
// Examples:
//   "fun-emoji:abc"                            (style only)
//   "fun-emoji:abc?eyes=stars"                 (one option)
//   "pixel-art:abc?eyes=variant03&hair=variant07&backgroundColor=22C55E"
// ============================================================================

export function packAvatarSeed(
  rawSeed: string,
  style: AvatarStyle,
  options?: AvatarOptions,
): string {
  const base = `${style}:${rawSeed}`;
  if (!options) return base;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(options)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function unpackAvatarSeed(seed: string): {
  style: AvatarStyle;
  rawSeed: string;
  options: AvatarOptions;
} {
  let main = seed;
  const options: AvatarOptions = {};
  const qIdx = seed.indexOf("?");
  if (qIdx > 0) {
    main = seed.slice(0, qIdx);
    try {
      const params = new URLSearchParams(seed.slice(qIdx + 1));
      params.forEach((v, k) => {
        options[k] = v;
      });
    } catch {
      // bad query — ignore options
    }
  }
  const idx = main.indexOf(":");
  if (idx > 0) {
    const candidate = main.slice(0, idx);
    if (STYLE_IDS.has(candidate as AvatarStyle)) {
      return {
        style: candidate as AvatarStyle,
        rawSeed: main.slice(idx + 1),
        options,
      };
    }
  }
  return { style: "fun-emoji", rawSeed: main, options };
}

export function avatarUrl(seed: string, styleOverride?: AvatarStyle): string {
  const { style, rawSeed, options } = unpackAvatarSeed(seed);
  const finalStyle = styleOverride ?? style;

  // Build the query string manually. DiceBear expects multi-value params
  // (e.g. backgroundColor=22C55E,FACC15,...) with LITERAL commas. URLSearchParams
  // encodes commas to %2C in some runtimes, which DiceBear parses as a single
  // (invalid) color name → the SVG fails to load and the <img> falls back to
  // its alt text. We `encodeURIComponent` everything else but keep commas raw.
  const pairs: string[] = [];
  const push = (k: string, v: string) => {
    if (!v) return;
    pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v).replace(/%2C/g, ",")}`);
  };

  push("seed", rawSeed);
  push("radius", "50");
  push(
    "backgroundColor",
    options.backgroundColor || DEFAULT_BG_PALETTE,
  );

  for (const [k, v] of Object.entries(options)) {
    if (k === "backgroundColor") continue;
    if (!v) continue;
    push(k, v);
    // Probability-based traits need the matching <trait>Probability=100 so the
    // picked value is actually rendered (default probability is < 100).
    if (k === "glasses" || k === "accessories") {
      push(`${k}Probability`, "100");
    }
  }

  return `https://api.dicebear.com/9.x/${finalStyle}/svg?${pairs.join("&")}`;
}

// ============================================================================
// Slot colors + initials helpers (unchanged from prior).
// ============================================================================

const SLOT_COLORS = [
  "#22C55E", // golf
  "#FACC15", // sun
  "#38BDF8", // sky
  "#F472B6", // pink
  "#16A34A", // golf-dark
  "#A855F7", // purple
  "#F97316", // orange
  "#0EA5E9", // sky-dark
];

export function slotColor(index: number): string {
  return SLOT_COLORS[Math.abs(index) % SLOT_COLORS.length]!;
}

export function initials(name: string): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

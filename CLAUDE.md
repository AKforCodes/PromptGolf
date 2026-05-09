@AGENTS.md

# PromptGolf

Jackbox-style party game. Players see a target image, race to write the shortest prompt that recreates it via FLUX schnell. CLIP similarity gates qualification, char count breaks ties. 24hr hackathon, team of 3, demo-first.

## Locked Decisions

| Area | Decision |
|---|---|
| Game mode v1 | Showdown only (multiplayer race, configurable timer) |
| Modality | Image targets, FLUX schnell @ 4 steps, fixed seed per round |
| Scoring | Threshold gate (CLIP ≥0.78) + char count tiebreak |
| Tiebreak ladder | char count → token count → CLIP score → submission timestamp |
| Length unit | Chars primary, tokens secondary |
| CLIP location | Server-side via fal endpoint (no transformers.js — bundle risk on mobile) |
| Rounds per game | 1–5, default 3 |
| Max players | 1–8, default 8 |
| Prompt max length | 50–200 chars, default 200 |
| Timer | 30–120s, default 60 |
| Categories | animals, landmarks, food, celebrity, logos |
| Auth | Anon, user_id cookie + DiceBear avatar |
| Persistence | Upstash Redis only, 1hr TTL, no SQL |
| Realtime | Pusher (presence + private channels, pub/sub) |
| Role assignment | First N joiners = prompter, rest = spectator (host can swap) |
| Voice commentary | DROPPED — spectator + share card win the hour |
| Anti-cheese | Prompt max length cap, 3s resubmit debounce, target prompt never sent to client |
| Demo first | Every decision biases toward live-on-stage moment |

## Stack

- Framework: Next.js 15 App Router, TypeScript, Turbopack
- UI: Tailwind v4 + shadcn/ui (custom jklm theme replaces lyra)
- State: Upstash Redis (room state, attempts, leaderboard)
- Realtime: Pusher Channels
- Image gen: fal.ai FLUX schnell
- Scoring: fal CLIP endpoint (server-side)
- Animation: Framer Motion
- Sound: Howler.js
- Avatars: DiceBear API (URL-only)
- Validation: zod
- IDs/codes: nanoid
- Share cards: @vercel/og
- Deploy: Vercel + custom domain

## Visual Direction (jklm DNA)

- Cream bg `#FFF8E7`
- Golf-grass green accent `#22C55E`
- Ink black `#0A0A0A`
- Thick borders 3–4px, drop shadow `4px 4px 0 #0A0A0A` (no blur)
- `rounded-2xl` everywhere
- Buttons translate-y on `:active`
- Fonts: Fredoka (headings/buttons), Inter (body) via `next/font`
- Sound on every interaction: ding, fail buzz, victory fanfare
- Framer Motion: card flips, score count-up, stagger reveals

## Architecture

```
src/
  app/
    page.tsx                       # landing
    room/[code]/page.tsx           # lobby + game (mode-switched)
    room/[code]/spectate/page.tsx  # projector view, read-only
    api/
      rooms/route.ts               # POST create
      rooms/[code]/route.ts        # GET state, POST join/leave
      generate/route.ts            # POST prompt → image_url + CLIP score
      pusher/auth/route.ts         # presence + private channel auth
      og/[attemptId]/route.ts      # share card PNG
  lib/
    types.ts          # Room, Player, RoundState, Attempt, Scores
    redis.ts          # Upstash client
    pusher.ts         # client + server
    fal.ts            # FLUX gen + CLIP scoring wrappers
    rooms.ts          # room state CRUD
    targets.ts        # category lookup → FLUX prompt + seed picker
    scoring.ts        # threshold gate, tiebreak logic
    session.ts        # cookie-based playerId mint + read
    devBot.ts         # fake player for testing
  components/
    game/             # PromptInput, AttemptCard, Leaderboard, RevealScreen
    lobby/            # PlayerList, AvatarPicker, RoomCode, CategoryPicker
    spectator/        # BigScreen, JoinQR
    ui/               # shadcn primitives
  data/
    categories.json   # category id → {label, emoji, prompt, seedRange, demoSafe} — one fixed prompt per category
public/
  sounds/             # ding, buzz, fanfare
```

## Data Model

Defined in `lib/types.ts`. Stored in Redis as JSON strings, all keys 1h TTL.

```ts
type Room = {
  code: string;              // "ABCD"
  hostId: string;            // playerId of current host
  status: "lobby" | "generating" | "countdown" | "playing" | "reveal" | "ended";
  players: Player[];         // inline; ordered by joinedAt
  config: {
    maxPlayers: number;      // host-set, capped at 8
    categories: string[];    // host-picked category ids from data/categories.json
    totalRounds: number;     // default 3, max 5
    roundDurationMs: number; // 60000
    threshold: number;       // 0.78 — qualifying CLIP score
    maxPromptChars: number;  // 200
    disconnectGraceMs: number; // 30000
  };
  currentRound: number;      // 0 in lobby, 1+ in play
  round: RoundState | null;  // null in lobby, populated when round active
  createdAt: number;
  version: number;           // increments on every write — client reconciliation
};

type Player = {
  id: string;                // nanoid, from cookie, stable for the session
  name: string;
  avatarSeed: string;        // DiceBear seed
  ready: boolean;
  joinedAt: number;          // host succession order
  connected: boolean;        // Pusher presence-driven
  lastSeenAt: number;        // for 30s grace + idle GC
};

type RoundState = {
  number: number;
  category: string;          // chosen category id for this round
  targetImageUrl: string;    // public URL, safe to broadcast
  targetPrompt: string;      // SECRET — server-only until reveal payload
  seed: number;              // FLUX seed for this round
  startedAt: number;         // playing phase start
  endsAt: number;            // startedAt + roundDurationMs
};

type Attempt = {
  id: string;                // nanoid, used in /api/og/[id]
  playerId: string;
  playerName: string;        // denormalized for cheap reveal render
  prompt: string;
  imageUrl: string;          // fal-returned
  similarity: number;        // raw CLIP 0–1
  qualified: boolean;        // similarity >= threshold
  chars: number;
  tokens: number;            // Math.ceil(prompt.length / 4)
  submittedAt: number;
};

type Scores = {
  [playerId: string]: {
    totalChars: number;        // golf-style cumulative, lower is better
    qualifiedRounds: number;
    dnfRounds: number;
  };
};
```

### Redis keys

| Key | Type | Value | TTL |
|---|---|---|---|
| `room:{CODE}` | string (JSON) | `Room` | 1h |
| `room:{CODE}:attempts:{round}` | string (JSON) | `Attempt[]` (read → push → write) | 1h |
| `room:{CODE}:scores` | string (JSON) | `Scores` (updated only at round end) | 1h |
| `cache:fal:{seedhash}` | string | image url, optional hot-prompt cache | 5m |

### What does NOT live in Redis

- Category metadata (`data/categories.json`) and sound assets — bundled, faster than Redis.
- fal API responses long-term — only ephemeral 5m cache by seed hash.
- Player session — cookie holds `playerId`, validated against the room's `players[]` on each request.

### Why this shape

- **`players[]` inline on Room:** lobbies are ≤8 and we always read the full roster anyway. One read instead of N. Tradeoff: every player update rewrites the room — fine, players don't update often.
- **`ready` on Player:** "is everyone ready?" is `players.every(p => p.ready)`, no extra key.
- **`round` nullable:** clean separation between lobby and active play. When `status === 'playing'`, `room.round` has everything you need.
- **`targetPrompt` server-only:** treat like a DB secret. Strip it from every API response and Pusher event until the reveal payload at round end.
- **`version`:** every write increments. Clients compare local vs server; gap → refetch full state. Cheap reconciliation hatch.
- **Attempts in a separate key:** appending on every submission shouldn't rewrite room state. Read at round-end to compute winner, then leave alone.
- **Scores separate:** updated only at round-end, lets the leaderboard sidebar render between rounds without re-parsing attempts.

## Pusher Channels

- `presence-room-{CODE}` — auto-tracks lobby members
- `private-room-{CODE}-game` — round events, attempts, timer ticks

## Game Flow (Showdown)

1. Visitor lands on `/` → server mints `playerId` cookie if missing → name input + DiceBear avatar editable → `[CREATE LOBBY]` or `[JOIN: ____]`
2. Create lobby → host picks max players + one or more categories from `data/categories.json` → 4-letter code → `/room/ABCD`
3. Players join via code or shared link → lobby, avatars, names, ready toggle. Host has Start button.
4. Host clicks Start → status flips to `generating` → server picks a category from the room's pool, looks up that category's fixed FLUX prompt in `data/categories.json`, picks a fresh seed from the category's `seedRange`, calls FLUX schnell → stores `targetPrompt` server-side → broadcasts `{targetImageUrl, category}` + countdown. Category id is fine to show — golf rewards short prompts, so knowing the genre is a hint, not an exploit. Only `targetPrompt` is server-only.
5. `countdown(3)` → `playing(60)`. Players submit prompts → server calls fal FLUX with prompt → CLIP score vs target image → broadcast attempt → leaderboard updates live
6. Timer ends → `reveal(15)`: target on left, all attempts in stroke order, prompts (including target prompt) revealed with stagger animation, winner fanfare
7. Next round (3 default) → final reveal → share card → return to lobby

Round state machine in Redis: `lobby → generating → countdown(3) → playing(60) → reveal(15) → (next round | ended)`. The `generating` phase masks FLUX cold-start before the timer starts so players never wait on a black screen. Server-authoritative timer, broadcast tick events.

## Conventions

- `playerId` is the unit of identity. Minted on landing, stored in an httpOnly cookie, never trusted blindly — every request validates it against the room's `players[]`.
- `roomCode` travels in the request body (not the URL or cookie) so a single player can spectate one room while playing in another tab.
- 4-letter room codes via nanoid custom alphabet, no profanity, no `0/O 1/I`.
- zod schemas on every API input.
- 1h TTL on every Redis key.
- `tokens = Math.ceil(prompt.length / 4)` — no real tokenizer, only a tiebreak proxy.
- Anti-cheese: reject `>200` chars, debounce identical resubmits within 3s.
- Target prompt never sent to client — only image URL — until the reveal payload.
- `Room.version` increments on every write; clients reconcile on gap.
- Pre-warm fal: dummy generation request fires when lobby mounts (mask cold start).
- Disconnect grace: Pusher `member_removed` flips `connected: false` + sets `lastSeenAt`; server-side timer DNFs the player only if they don't return within `disconnectGraceMs` (30s default). Host succession runs off the same event using `joinedAt` order.
- Per-room rate limit, $20 hard cap, debounce to keep cost bounded.

## Env Vars

```bash
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
FAL_KEY=
PUSHER_APP_ID=
PUSHER_SECRET=
NEXT_PUBLIC_PUSHER_KEY=
NEXT_PUBLIC_PUSHER_CLUSTER=
NEXT_PUBLIC_APP_URL=
```

No `DATABASE_URL`, no Anthropic, no ElevenLabs — all dropped.

## Implementation timeline

See `PLAN.md` for the staged 24hr build plan, hour schedule, risks, and first actions.

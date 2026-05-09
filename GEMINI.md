@AGENTS.md

# PromptGolf

Jackbox-style party game. Players see a target image, race to write the shortest prompt that recreates it via FLUX schnell. CLIP similarity gates qualification, char count breaks ties. 24hr hackathon, team of 3, demo-first.

## Locked Decisions

| Area | Decision |
|---|---|---|
| Game mode v1 | Showdown only (multiplayer race, configurable timer) |
| Modality | Image targets, FLUX schnell @ 4 steps, fixed seed per round |
| Target source | On-demand FLUX gen per round. Host picks one or more categories at lobby creation; **each category has a single pre-defined FLUX prompt** in `data/categories.json`. Round variety comes from a fresh seed each round, not prompt mixing. |
| Scoring | Threshold gate (CLIP ≥0.78) + char count tiebreak |
| Tiebreak ladder | char count → token count → CLIP score → submission timestamp |
| Length unit | Chars primary, tokens secondary (`Math.ceil(prompt.length / 4)` estimate, no real tokenizer) |
| CLIP location | Server-side via fal endpoint (no transformers.js — bundle risk on mobile) |
| Rounds per game | 1–5, default 3 |
| Max players | 1–8, default 8 |
| Prompt max length | 50–200 chars, default 200 |
| Timer | 30–120s, default 60 |
| Categories | animals, landmarks, food, celebrity, logos |
| Auth | Anon. `userId` cookie + DiceBear avatar editable on landing. |
| Persistence | Upstash Redis only, 1hr TTL, no SQL |
| Realtime | Pusher (presence channels, pub/sub) |
| Role assignment | First N joiners = prompter, rest = spectator (host can swap) |
| Disconnect grace | 30s — Pusher `member_removed` flips `connected: false`, server DNFs only if not back in 30s |
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
    api/v1/
      rooms/route.ts               # POST create
      rooms/[code]/route.ts        # GET state, POST join/leave
      user/seed/route.ts           # GET mint user_id cookie
      pusher/auth/route.ts         # POST presence channel auth
      generate/route.ts            # POST prompt → image_url + CLIP score
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
// src/lib/types.ts — source of truth
type RoomSettings = {
  gameMode: "showdown";
  rounds: number;           // 1–5, default 3
  maxPlayers: number;       // 1–8, default 8
  timer: number;            // 30–120s, default 60
  promptMaxLength: number;  // 50–200, default 200
  category: "animals" | "landmarks" | "food" | "celebrity" | "logos";
};

type Player = {
  userId: string;           // from httpOnly cookie, crypto.randomUUID()
  name: string;
  avatarSeed: string;       // DiceBear seed
  role: "prompter" | "spectator";
  ready: boolean;
  joinedAt: number;         // host succession order
  connected: boolean;       // Pusher presence-driven
  lastSeenAt: number;       // for 30s grace + idle GC
};

type RoomState = {
  code: string;             // "ABCD"
  hostId: string;           // userId of current host
  settings: RoomSettings;
  players: Player[];        // inline; ordered by joinedAt
  status: "lobby" | "countdown" | "playing" | "reveal" | "ended";
  currentRound: number;     // 0 in lobby, 1+ in play
  targetId: string | null;  // current round target image id
  seed: number | null;      // FLUX seed for current round
  createdAt: number;
};
```

### Redis keys

| Key | Type | Value | TTL |
|---|---|---|---|
| `room:{CODE}` | string (JSON) | `RoomState` | 1h |

### Why this shape

- **`players[]` inline on Room:** lobbies are ≤8 and we always read the full roster anyway. One read instead of N.
- **`settings` as a single object:** clean encapsulation of room config, validated by zod on every API input.
- **Role assignment:** first `settings.maxPlayers` joiners get `prompter`, rest get `spectator` — checked in `joinRoom()`.

## API + Pusher: How real-time works

Two layers, one purpose:

**REST APIs** (`/api/v1/...`) — mutate state in Redis (create room, join, leave, submit prompt). These are the source of truth. They handle auth via the httpOnly `user_id` cookie and validate with zod.

**Pusher** — broadcasts the result of those mutations to every connected client in real time. Clients never poll — they subscribe once and receive events.

```
Client A                   Server (Next.js)            Client B
  │                              │                        │
  │── POST /api/v1/rooms ──────► │                        │
  │  (cookie: user_id=abc)       │                        │
  │                              ├── Redis: createRoom()  │
  │◄──── { room } ───────────────┤                        │
  │                              │                        │
  │── subscribe presence-room-X ─┼───────────────────────►│
  │  (auto-POSTs /pusher/auth)   │                        │
  │◄── auth token ───────────────┤                        │
  │                              │                        │
  │── POST /api/v1/rooms/X ────► │                        │
  │  { action: "join" }         │                        │
  │                              ├── Redis: joinRoom()    │
  │                              ├── pusher.trigger(      │
  │                              │   "presence-room-X",   │
  │                              │   "player-joined",     │
  │                              │   { userId, name }     │
  │                              │ )                      │
  │                              │                        │
  │                              ├──── "player-joined" ──►│
  │◄──── { room, role } ─────────┤                        │
```

### Pusher Auth — the gatekeeper

When a client calls `pusher.subscribe("presence-room-ABCD")`, Pusher.js **automatically** POSTs to `/api/v1/pusher/auth` with `socket_id` and `channel_name`. The server:

1. Reads the httpOnly `user_id` cookie (cannot be faked by client JS)
2. Extracts room code from the channel name (`presence-room-ABCD` → `ABCD`)
3. Checks Redis: is this user actually in this room?
4. If yes, calls `pusher.authorizeChannel()` to sign a token with `{ user_id, user_info: { name, avatarSeed, role } }`
5. Returns the signed token → Pusher verifies it → client is subscribed

Without this check, anyone could subscribe to any room's channel by guessing the code.

### Presence channel — auto member tracking

`presence-room-{CODE}` is a **Pusher presence channel**. It automatically:
- Tracks who's connected: `channel.members` is always up to date
- Fires `pusher:member_added` when someone subscribes
- Fires `pusher:member_removed` when they disconnect (tab close, network drop)
- Includes `user_info` (name, avatarSeed, role) with each member

This means the lobby roster updates itself — no custom join/leave events needed for connectivity. The `player-joined` / `player-left` custom events are for the *action* of joining/leaving the room (name change, role assignment), while `pusher:member_added/removed` handles the *WebSocket connection* state.

### When to use each

| Event type | Example | Channel | Who triggers |
|---|---|---|---|
| Member connected | Player opened the app | presence (auto) | Pusher |
| Member disconnected | Tab closed, network lost | presence (auto) | Pusher |
| Player joined room | Clicked "Join" | presence-room (custom) | Server after API |
| Player left room | Clicked "Leave" | presence-room (custom) | Server after API |
| Round starting | Host clicked Start | presence-room (custom) | Server after API |
| Attempt submitted | Player typed a prompt | presence-room (custom) | Server after API |
| Timer tick | Every second during play | presence-room (custom) | Server interval |

### Summary

- **Room APIs** = state (Redis). Who is in the room, what round is it, what's the score.
- **Pusher** = notification. When state changes, tell everyone instantly.
- **Auth** = security. Only let subscribed users into channels they belong to.
- **Presence** = auto-connectivity. Pusher tells you when someone's WebSocket drops.

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

- `userId` is the unit of identity. Minted on landing, stored in an httpOnly cookie, never trusted blindly — every request validates it against the room's `players[]`.
- `roomCode` travels in the request body (not the URL or cookie) so a single player can spectate one room while playing in another tab.
- 4-letter room codes via nanoid custom alphabet, no profanity, no `0/O 1/I`.
- zod schemas on every API input.
- 1h TTL on every Redis key.
- `tokens = Math.ceil(prompt.length / 4)` — no real tokenizer, only a tiebreak proxy.
- Anti-cheese: reject `> promptMaxLength` chars, debounce identical resubmits within 3s.
- Target prompt never sent to client — only image URL — until the reveal payload.
- `Room.version` increments on every write; clients reconcile on gap.
- Pre-warm fal: dummy generation request fires when lobby mounts (mask cold start).
- Disconnect grace: Pusher `member_removed` flips `connected: false` + sets `lastSeenAt`; server-side timer DNFs the player only if they don't return within `disconnectGraceMs` (30s default). Host succession runs off the same event using `joinedAt` order.
- Per-room rate limit, $20 hard cap, debounce to keep cost bounded.

## Env Vars

```bash
# Redis (Upstash)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Image generation (fal.ai)
FAL_KEY=

# Realtime (Pusher)
PUSHER_APP_ID=
PUSHER_SECRET=
NEXT_PUBLIC_PUSHER_KEY=
NEXT_PUBLIC_PUSHER_CLUSTER=

# LLM for commentary (optional)
ANTHROPIC_API_KEY=

# Voice commentary (optional)
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# App
NEXT_PUBLIC_APP_URL=
```

## Implementation timeline

See `PLAN.md` for the staged 24hr build plan, hour schedule, risks, and first actions.

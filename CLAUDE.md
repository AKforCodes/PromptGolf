@AGENTS.md

# PromptGolf

Jackbox-style party game. Players see a target image, race to write prompts that recreate it via FLUX schnell, then pick their best attempt to submit. Each round, voting screen shows the target alongside every player's pick; each voter casts ONE vote for the image (not their own) they think comes closest. Round score = number of votes received; cumulative highest score wins. The target is a shared anchor for voters — there's no algorithmic scoring against it. 24hr hackathon, team of 3, demo-first.

## Locked Decisions

| Area | Decision |
|---|---|
| Game mode v1 | Showdown only (multiplayer race, configurable timer) |
| Modality | Image targets, FLUX schnell @ 4 steps, fixed seed per round |
| Scoring | Single-vote per voter, cumulative across rounds, highest total wins. Each player has ONE vote per round for the image (not their own) they think is closest to the target. Each vote = 1 point. With 8 players, per-round max ≈ 7 (everyone except the recipient votes for them). CLIP scoring was investigated and dropped 2026-05-09 — target image is now a shared anchor for voters, not an algorithmic reference. |
| Tiebreak ladder | Cumulative score → char count → token count → submission timestamp. Used only when totals literally tie (`tiebreak()` in `lib/scoring.ts`). |
| Attempts per round | Host-configurable 1–5, default 3. Players submit multiple, then **pick** which one is their "final" submission shown to voters. |
| Picks | Player-driven before voting starts. Fallback if no pick: last-submitted attempt (most recent `submittedAt`). |
| Vestigial fields | `Attempt.similarity` and `Attempt.qualified` always 0/false. `RoomSettings.difficulty` ignored by scoring. Kept for forward-compat in case CLIP returns later. |
| CLIP location | DROPPED 2026-05-09. Replicate `andreasjansson/clip-features` was previously used for image-similarity scoring; replaced by pure player voting. `lib/replicate.ts` deleted. The `replicate` npm package + `REPLICATE_API_TOKEN` env are unused but left in place for easy revert. |
| Rounds per game | 1–5, default 3 |
| Max players | 1–8, default 8 |
| Prompt max length | 50–200 chars, default 200 |
| Timer | 30–120s, default 60 |
| Categories | animals, landmarks, foods, nature, characters |
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
- Scoring: pure player voting (no CLIP — dropped 2026-05-09)
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
      rooms/route.ts                       # POST create
      rooms/[code]/route.ts                # GET state, POST join/leave/update/ready/unready/start/advance/pick
      rooms/[code]/round/[n]/route.ts      # GET round details (finalAttempts, votes, target — for voting + reveal screens)
      user/seed/route.ts                   # GET mint user_id cookie
      pusher/auth/route.ts                 # POST presence channel auth
      generate/route.ts                    # POST player prompt → FLUX + CLIP scoring → Attempt
      vote/route.ts                        # POST vote on another player's final attempt
      og/[attemptId]/route.ts              # share card PNG
  lib/
    types.ts          # RoomSettings, Player, RoomState, Attempt, Vote, VoteValue (zod schemas)
    redis.ts          # Upstash client
    pusher.ts         # client + server
    fal.ts            # FLUX gen wrapper (target image + per-submission candidate gen)
    rooms.ts          # room state CRUD
    targets.ts        # category lookup → FLUX prompt + seed picker
    scoring.ts        # tiebreak, selectFinalAttempts, awardRoundScores (single-vote tally)
    session.ts        # cookie-based playerId mint + read
    devBot.ts         # fake player for testing
  components/
    game/             # PromptInput, AttemptCard, Leaderboard, RevealScreen
    lobby/            # PlayerList, AvatarPicker, RoomCode, CategoryPicker
    spectator/        # BigScreen, JoinQR
    ui/               # shadcn primitives
  data/
    categories.json   # category id → {label, emoji, prompts[], seedRange} — pre-generated prompt pool per category (built offline via Vertex AI Gemini, see src/app/_scripts/generate-targets.ts)
public/
  sounds/             # ding, buzz, fanfare
```

## Data Model

Defined in `lib/types.ts` as zod schemas (TypeScript types are inferred). Stored in Redis via the Upstash SDK (auto-serializes objects), 1h TTL on every key.

```ts
// src/lib/types.ts — source of truth (simplified, see file for zod definitions)

type RoomSettings = {
  gameMode: "showdown";
  rounds: number;            // 1–5, default 3
  maxPlayers: number;        // 1–8, default 8
  timer: number;             // 30–120s, default 60 (playing-phase duration)
  promptMaxLength: number;   // 50–200, default 200
  attemptsPerRound: number;  // 1–5, default 3 (host-set cap on submissions per player per round)
  category: "animals" | "landmarks" | "foods" | "nature" | "characters";
  difficulty: "easy" | "normal" | "hard";
};

type Player = {
  userId: string;       // from httpOnly cookie, crypto.randomUUID()
  name: string;
  avatarSeed: string;
  role: "prompter" | "spectator";
  ready: boolean;
  joinedAt: number;     // host succession order
  connected: boolean;   // Pusher presence-driven
  lastSeenAt: number;   // for 30s grace + idle GC
};

type RoomStatus =
  | "lobby"
  | "generating"   // server runs FLUX + CLIP; UI shows loading
  | "countdown"    // (reserved — currently unused; start jumps lobby → generating → playing)
  | "playing"     // players submit + pick; phaseEndsAt = now + settings.timer * 1000
  | "voting"      // 20s; players vote bad/ok/good/excellent on each other's final attempt
  | "reveal"      // 15s; targetPrompt + per-round scores broadcast
  | "ended";       // game over; final scores stand

type RoomState = {
  code: string;
  hostId: string;
  settings: RoomSettings;
  players: Player[];                      // inline; ordered by joinedAt
  status: RoomStatus;
  currentRound: number;                   // 0 in lobby, 1+ in play
  targetId: string | null;
  seed: number | null;                    // FLUX seed for current round
  targetImageUrl: string | null;          // safe to broadcast
  targetPrompt: string | null;            // SECRET — server-only until reveal
  scores: Record<string, number>;         // userId → cumulative vote points
  picks: Record<string, string>;          // userId → attemptId for current round; cleared on next round
  phaseEndsAt: number | null;             // server-stamped epoch ms; clients render countdown to this
  createdAt: number;
};

type Attempt = {
  id: string;            // nanoid (12 chars)
  userId: string;
  prompt: string;
  imageUrl: string;      // candidate image returned by FLUX
  similarity: number;    // VESTIGIAL — always 0 since CLIP scoring was dropped
  qualified: boolean;    // VESTIGIAL — always false since CLIP scoring was dropped
  chars: number;
  tokens: number;        // ceil(chars / 4)
  submittedAt: number;
};

type Vote = {
  voterId: string;     // each voter has exactly one Vote per round (upserted)
  targetId: string;    // the player they're voting for
  submittedAt: number;
};
```

### Redis keys

| Key | Type | Value | TTL |
|---|---|---|---|
| `room:{CODE}` | string (JSON) | `RoomState` | 1h |
| `room:{CODE}:attempts:{round}` | string (JSON) | `Attempt[]` (read → push → write per submission) | 1h |
| `room:{CODE}:votes:{round}` | string (JSON) | `Vote[]` (read → push → write per vote) | 1h |
| `room:{CODE}:debounce:{userId}` | string | `"1"` with 3s TTL — atomic NX-EX rate limit on `/api/v1/generate` | 3s |

### Why this shape

- **`players[]` inline on Room:** lobbies are ≤8 and we always read the full roster anyway. One read instead of N.
- **`settings` as a single object:** clean encapsulation of room config, validated by zod on every API input.
- **Role assignment:** first `settings.maxPlayers` joiners get `prompter`, rest get `spectator` — checked in `joinRoom()`.
- **Attempts/votes in separate keys** to avoid rewriting full RoomState on every submission/vote (each round can hit 8 × 3 = 24 attempts plus 8 × 7 = 56 votes).
- **`picks` inline** because they're tiny (≤8 entries, ~30 bytes each) and read together with the rest of RoomState during the voting → reveal transition.
- **`phaseEndsAt` server-stamped:** clients can't lie about timer expiry. Server-side `advance` rejects early calls with 409 + the real `phaseEndsAt`.

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

1. **Landing.** Visitor on `/` → client calls `/api/v1/user/seed` → server mints `userId` httpOnly cookie if missing → name input + DiceBear avatar (re-rollable) → `[CREATE LOBBY]` or `[JOIN: ____]`.
2. **Create lobby.** Host picks settings (rounds, max players, timer, prompt cap, category, difficulty, **attempts per round**) → `POST /api/v1/rooms` → 4-letter code → `/room/ABCD`.
3. **Join.** Players land on `/room/ABCD` → `POST /api/v1/rooms/[code] { action: "join", name, avatarSeed }` → first N joiners get `prompter`, rest `spectator`. Lobby shows avatars, names, ready toggle. Host has Start button.
4. **Ready up.** Non-host players `POST { action: "ready" }` (toggleable via `unready`). Host doesn't ready themselves. Server fires `player-ready` over Pusher; clients refetch.
5. **Start.** Host fires `POST { action: "start" }` → validations (host, ≥1 non-host, all non-host ready) → server runs the **keystone composition** (status flips `lobby → generating`, broadcasts `round-generating`, then runs `getCategoryPrompt → falGenerate`, caches `targetImageUrl` + `targetPrompt` (server-only) on the room, flips `generating → playing`, stamps `phaseEndsAt = now + settings.timer * 1000`, broadcasts `round-starting` with `{targetImageUrl, category, phaseEndsAt}`). Total wall time ≈ 1s warm.
6. **Playing phase** (timer-bounded). Players submit prompts via `POST /api/v1/generate { roomCode, prompt }`. Each submission is FLUX'd with **a random seed** (no longer shares the round's seed — identical prompts now produce different images, no duplicate-image vote-splitting). Persisted as an `Attempt` (with placeholder `similarity: 0, qualified: false`), broadcast as `attempt-submitted`. Per-player cap: `settings.attemptsPerRound`. Per-player debounce: 3s atomic Redis NX-EX. Players also `POST { action: "pick", attemptId }` to lock in which attempt is shown to voters (changeable any time during playing; if no pick, server falls back to last-submitted).
7. **Voting phase** (20s). When the playing-phase countdown hits zero, any client fires `POST { action: "advance" }`. Server validates `Date.now() >= phaseEndsAt`, flips to `voting`, stamps a new `phaseEndsAt`, broadcasts `voting-starting`. Clients fetch `GET /api/v1/rooms/[code]/round/[n]` to populate the voting screen — the target image alongside every player's pick. Each voter `POST /api/v1/vote { roomCode, targetUserId }` to vote for the image they think is closest. Anti-self-vote. Each voter has exactly ONE vote per round; voting again upserts (last vote wins). Server broadcasts `vote-submitted { voterId }` (target stays private until reveal).
8. **Reveal phase** (15s). `advance` again → server reads attempts + votes from Redis → `selectFinalAttempts(attempts, room.picks)` → `awardRoundScores(room.scores, finals, votes)` (each vote = 1 point) → flips to `reveal` → broadcasts `reveal-starting` with `{targetPrompt, scores, phaseEndsAt}`. UI shows target prompt, per-player finals, who-voted-for-whom, leaderboard.
9. **Next round or end.** `advance` from `reveal`: if `currentRound >= settings.rounds` → status `ended`, broadcast `game-ended` with final scores. Else → `generateRoundTarget` runs again (FLUX + CLIP for round N+1's target), loop back to step 6.

### State machine

```
lobby
  ↓ start
generating ───────── (FLUX target gen, ~1s)
  ↓ on success
playing  ─────────── (settings.timer s; players submit + pick)
  ↓ advance (after phaseEndsAt)
voting   ─────────── (20s; vote on others' finals)
  ↓ advance (after phaseEndsAt)
reveal   ─────────── (15s; targetPrompt + scores broadcast)
  ↓ advance (after phaseEndsAt)
{ next round → generating  OR  ended }
```

`phaseEndsAt` is server-stamped on every transition with a timer. Clients render `Math.max(0, phaseEndsAt - Date.now())` and call `advance` when it hits zero. Server rejects early calls with 409 + the real `phaseEndsAt` — clients can't shave time.

### Pusher events

| Event | When | Payload (key fields) |
|---|---|---|
| `player-joined` / `player-left` | join/leave action | `{ userId, name, avatarSeed, role }` |
| `player-ready` | ready/unready | `{ userId, ready }` |
| `settings-updated` | host changes settings | `{ settings }` |
| `round-generating` | start of any round | `{ status, round }` |
| `round-starting` | FLUX+CLIP done | `{ status, round, targetImageUrl, category, phaseEndsAt }` |
| `round-failed` | FLUX/CLIP throws | `{ error }` (room reverts to lobby) |
| `attempt-submitted` | each gen completes | full `Attempt` |
| `pick-changed` | player picks/repicks | `{ userId, round }` (value private) |
| `voting-starting` | playing → voting | `{ status, round, phaseEndsAt }` |
| `vote-submitted` | each vote received | `{ voterId, round }` (value private) |
| `reveal-starting` | voting → reveal | `{ status, round, phaseEndsAt, targetPrompt, scores }` |
| `game-ended` | last round reveal ends | `{ status, scores }` |

## Conventions

- `userId` is the unit of identity. Minted on landing via `/api/v1/user/seed`, stored in an httpOnly cookie, never trusted blindly — every request validates it against the room's `players[]`.
- Role assignment: first `settings.maxPlayers` joiners get `prompter`, rest get `spectator`. Host can swap in lobby.
- `roomCode` travels in the request body (not the URL or cookie) so a single player can spectate one room while playing in another tab.
- 4-letter room codes via nanoid custom alphabet, no profanity, no `0/O 1/I`.
- zod schemas on every API input.
- 1h TTL on every Redis key.
- `tokens = Math.ceil(prompt.length / 4)` — no real tokenizer; only meaningful as a deep-tiebreak rung.
- Anti-cheese: reject prompts >`promptMaxLength`, per-player 3s debounce on `/generate` via Redis NX-EX, per-round attempt cap (`attemptsPerRound`).
- `targetPrompt` never sent to client; only surfaces on the `reveal-starting` Pusher event.
- Pre-warm fal: dummy generation request when lobby mounts (mask cold start).
- Disconnect grace: Pusher `member_removed` flips `connected: false` + sets `lastSeenAt`; server-side timer DNFs the player only if they don't return within `disconnectGraceMs` (30s default). Host succession runs off the same event using `joinedAt` order.
- Per-room rate limit, $20 hard cap, debounce to keep cost bounded.

## Env Vars

```bash
# runtime
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Image generation (fal.ai)
FAL_KEY=

# Unused since 2026-05-09 (CLIP dropped). Left in case the team reverts.
REPLICATE_API_TOKEN=

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

# build-time only (npm run gen:targets — uses ADC, not bundled into the app)
GCP_PROJECT_ID=
GCP_LOCATION=europe-west2
```

## Implementation timeline

See `PLAN.md` for the staged 24hr build plan, hour schedule, risks, and first actions.

@AGENTS.md

# PromptGolf

Jackbox-style party game. Players see a target image, race to write the shortest prompt that recreates it via FLUX schnell. CLIP similarity gates qualification, char count breaks ties. 24hr hackathon, team of 3, demo-first.

## Locked Decisions

| Area | Decision |
|---|---|
| Game mode v1 | Showdown only (multiplayer race, 60s timer) |
| Modality | Image targets, FLUX schnell @ 4 steps, fixed seed per round |
| Scoring | Threshold gate (CLIP ≥0.78) + char count tiebreak |
| Tiebreak ladder | char count → token count → CLIP score → submission timestamp |
| Length unit | Chars primary, tokens secondary |
| CLIP location | Server-side via fal endpoint (no transformers.js — bundle risk on mobile) |
| Rounds per game | 3 default, host can extend up to 5 |
| Auth | Anon, name + DiceBear avatar |
| Persistence | Upstash Redis only, 1hr TTL, no SQL |
| Realtime | Pusher (presence + private channels) |
| Voice commentary | DROPPED — spectator + share card win the hour |
| Anti-cheese | 200-char prompt cap, 3s resubmit debounce, target prompt never sent to client |
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
    redis.ts          # Upstash client
    pusher.ts         # client + server
    fal.ts            # FLUX gen + CLIP scoring wrappers
    rooms.ts          # room state CRUD
    scoring.ts        # threshold gate, tiebreak logic
    devBot.ts         # fake player for testing
  components/
    game/             # PromptInput, AttemptCard, Leaderboard, RevealScreen
    lobby/            # PlayerList, AvatarPicker, RoomCode
    spectator/        # BigScreen, JoinQR
    ui/               # shadcn primitives
  data/
    targets.json      # 30 curated target metadata
public/
  targets/            # 30 pre-generated FLUX images
  sounds/             # ding, buzz, fanfare
```

## Redis Schema

| Key | Type | Value | TTL |
|---|---|---|---|
| `room:{CODE}` | JSON | `{hostId, players[], mode, status, currentRound, targetId, seed}` | 1h |
| `room:{CODE}:attempts:{round}` | JSON array | `[{playerId, prompt, imageUrl, sim, chars, qualified, submittedAt}]` | 1h |
| `room:{CODE}:scores` | JSON | `{playerId: cumulativeStrokes}` | 1h |

## Pusher Channels

- `presence-room-{CODE}` — auto-tracks lobby members
- `private-room-{CODE}-game` — round events, attempts, timer ticks

## Game Flow (Showdown)

1. Host creates room → 4-letter code → `/room/ABCD`
2. Players join via code → lobby, avatars, names, ready toggle
3. Host clicks Start → server picks target from `targets.json` → broadcasts target image only (prompt secret)
4. 60s timer starts. Players submit prompts → server calls fal → CLIP score vs target → broadcast attempt → leaderboard updates live
5. Timer ends → reveal screen: target on left, all attempts in stroke order, prompts revealed with stagger animation, winner fanfare
6. Next round (3 total) → final reveal → share card → return to lobby

Round state machine in Redis: `idle → countdown(3) → playing(60) → reveal(15) → next | end`. Server-authoritative timer, broadcast tick events.

## Conventions

- 4-letter room codes via nanoid custom alphabet, no profanity, no `0/O 1/I`
- zod schemas on every API input
- 1h TTL on every Redis key
- Anti-cheese: reject `>200` chars, debounce identical resubmits within 3s
- Target prompt never sent to client — only image URL
- Pre-warm fal: dummy generation request fires when lobby mounts (mask cold start)
- Per-room rate limit, $20 hard cap, debounce to keep cost bounded

## Env Vars

```
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

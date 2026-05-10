# Prompt Golf ⛳️

Jackbox-style party game. Players see a target image, then race to write prompts that recreate it using AI image generation. After the round, everyone votes for the image they think is closest to the target — most votes wins.

Built at a 24-hour hackathon.

## How it works

1. Host creates a room, shares the 4-letter code
2. Players join and ready up in the lobby
3. A target image is revealed — memorize it before it disappears
4. Everyone writes prompts; each generates a real image via FLUX schnell
5. Players pick their best attempt to show voters
6. Voting: each player casts one vote for the image (not their own) closest to the target
7. Scores tallied, repeat for N rounds — highest cumulative score wins

## Features

- **Push-to-talk voice prompting** — hold the mic button to dictate your prompt (ElevenLabs Scribe v2)
- **Configurable rooms** — rounds, timer, prompt length cap, attempts per round, category
- **Tiebreaker rounds** — automatic when players are tied after the final round
- **Spectator mode** — join as observer when room is full
- **Share cards** — OG image per attempt for social sharing

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15 App Router, TypeScript, Turbopack |
| UI | Tailwind v4 + shadcn/ui (jklm theme) |
| Persistence | Upstash Redis (1h TTL, no SQL) |
| Realtime | Pusher Channels (presence + private) |
| Image gen | fal.ai FLUX schnell (4 steps) |
| Voice STT | ElevenLabs Scribe v2 |
| Animation | Framer Motion |
| Avatars | DiceBear (URL-only) |
| Deploy | Vercel |

## Getting started

### Prerequisites

- Node.js 20+
- [Upstash Redis](https://upstash.com) account (free tier)
- [fal.ai](https://fal.ai) API key
- [Pusher](https://pusher.com) app
- [ElevenLabs](https://elevenlabs.io) API key (for voice prompting)

### Setup

```bash
npm install
cp .env.example .env.local   # fill in vars below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

```bash
# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# fal.ai (image generation)
FAL_KEY=

# Pusher
PUSHER_APP_ID=
PUSHER_SECRET=
NEXT_PUBLIC_PUSHER_KEY=
NEXT_PUBLIC_PUSHER_CLUSTER=

# ElevenLabs (push-to-talk voice prompting)
ELEVENLABS_API_KEY=

# App
NEXT_PUBLIC_APP_URL=
```

## Scripts

```bash
npm run dev        # dev server (turbopack)
npm run build      # production build
npm run lint       # eslint
npm run test       # vitest unit tests
npm run gen:targets  # regenerate categories.json prompts (requires GCP creds)
```

## Architecture

```
src/
  app/
    page.tsx                          # landing — create or join room
    room/[code]/page.tsx              # lobby + all game screens (mode-switched)
    room/[code]/spectate/page.tsx     # projector/spectator view
    api/v1/
      rooms/route.ts                  # POST create room
      rooms/[code]/route.ts           # GET state; POST join/leave/ready/start/advance/pick
      rooms/[code]/round/[n]/route.ts # GET round details for voting + reveal screens
      generate/route.ts               # POST prompt → FLUX → Attempt
      vote/route.ts                   # POST vote on a player's attempt
      transcribe/route.ts             # POST audio → ElevenLabs Scribe → text
      pusher/auth/route.ts            # POST presence channel auth
      user/seed/route.ts              # GET mint user_id cookie
      og/[attemptId]/route.ts         # GET share card PNG
  lib/
    types.ts      # zod schemas (RoomSettings, Player, RoomState, Attempt, Vote)
    redis.ts      # Upstash client
    pusher.ts     # server + client Pusher helpers
    fal.ts        # FLUX generation wrapper
    rooms.ts      # room state CRUD
    targets.ts    # category → prompt + seed picker
    scoring.ts    # tiebreak, selectFinalAttempts, awardRoundScores
    session.ts    # user_id cookie mint + read
  components/
    lobby/        # ShareCard, PlayersCard, GameSetupCard, MicPermissionButton
    play/         # PlayingView, MicButton, usePushToTalk, VotingView, RevealView
    spectator/    # SpectatorView
  data/
    categories.json   # 5 categories × N prompts, built offline
```

## Scoring

Pure player voting — no algorithmic image similarity.

- Each player casts **one vote** per round for the image (not their own) they think is closest to the target
- Each vote = `POINTS_PER_VOTE` (10) points to that player
- Cumulative across rounds; highest total wins
- Tiebreaker: additional rounds with only tied players until one remains

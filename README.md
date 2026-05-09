# Prompt Golf ⛳️

Jackbox-style party game where players race to write the **shortest prompt** that recreates a target image. Type prompt → AI generates image → score by similarity to target. Fewest characters wins.

Built at [Hackathon Name] in 24 hours.

## How it works

Join a room with a 4-letter code. Everyone gets the same target image. You have 60 seconds to write a prompt that recreates it. Shortest prompt closest to the target wins the round. Reveal at the end gets laughs.

## Modes

- **Showdown** — All players, same target, race timer, fewest tokens wins. ✅
- **HoleInOne** — Daily target, async leaderboard. _coming soon_
- **Whisper** — Telephone with prompts and images. _coming soon_

## Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Tailwind v4** + **shadcn/ui** for components
- **Drizzle ORM** + **Neon Postgres** for persistence
- **Pusher** for realtime room sync
- **fal.ai** (FLUX schnell) for image generation
- **Anthropic Claude** for commentary
- **ElevenLabs** for voice commentary
- **Howler.js** for sound effects
- **Framer Motion** for animations

## Getting started

### Prerequisites

- Node.js 20+
- A Neon Postgres database ([free tier](https://neon.tech))
- A fal.ai API key ([fal.ai](https://fal.ai))
- A Pusher app ([pusher.com](https://pusher.com))

### Setup

```bash
# install
npm install

# env vars
cp .env.example .env.local
# fill in DATABASE_URL, FAL_KEY, PUSHER_*, etc.

# push schema to db
npm run db:push

# run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev        # dev server (turbopack)
npm run build      # production build
npm run start      # run production build
npm run lint       # eslint
npm run db:push    # push drizzle schema to db
npm run db:studio  # open drizzle studio
```

## Architecture

```
src/
  app/
    page.tsx                 # landing — create or join room
    room/[code]/page.tsx     # lobby + game screens
    api/
      rooms/                 # create, join, state
      generate/              # prompt → image + score
      pusher/auth/           # private channel auth
  db/
    schema.ts                # drizzle schema
  lib/
    fal.ts                   # image generation
    scoring.ts               # CLIP similarity
    pusher.ts                # client + server
  components/
    game/                    # game-specific UI
    ui/                      # shadcn primitives
```
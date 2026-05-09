# PromptGolf — 24hr Implementation Plan

Team of 3 (A backend, B UI, C content). Demo-first. Project context lives in `CLAUDE.md`.

---

## Stage 0 — Foundations (Hr 0–2) — A + B + C parallel

**Person A — backend setup**
- Strip `DATABASE_URL` from env, add Upstash + Pusher + fal vars
- `npm install @upstash/redis @fal-ai/client pusher pusher-js nanoid zod framer-motion howler @vercel/og`
- `npm install -D @types/howler`
- `/lib/redis.ts`, `/lib/pusher.ts`, `/lib/fal.ts` skeletons
- Smoke-test all three credentials with throwaway endpoints

**Person B — theme + primitives**
- Replace lyra preset → custom jklm tokens in `globals.css`
- Fredoka + Inter via `next/font`
- `npx shadcn@latest add button input textarea card dialog sonner badge skeleton avatar`
- Override shadcn to chunky borders + drop shadow + active translate-y
- Build `<JklmButton>`, `<JklmCard>`, `<RoomCodeDisplay>` primitives

**Person C — target curation (Hr 0–4)**
- Generate 30 targets via FLUX schnell, fixed seeds
- Mix: object, scene, character, abstract, style-specific
- `/public/targets/{id}.png` + `/data/targets.json {id, file, secretPrompt, seed, par, category}`
- Diversity > perfection. Demo shows ≤5 of these.

**Domain decision (Hr 0, 5min timebox):** try `prompt.golf → promptgolf.fun → pgolf.fun → playpromptgolf.com`. First available wins. Move on.

---

## Stage 1 — Threshold + bot (Hr 2–3) — A ⚠️ CRITICAL

- `/lib/scoring.ts` — fal CLIP scoring wrapper, threshold gate, tiebreak fn
- Calibrate threshold against 5 sample targets:
  - Submit obvious-correct prompt → expect ≥0.85
  - Submit obvious-wrong prompt → expect ≤0.5
  - Submit fuzzy-close prompt → expect 0.7–0.8
- Land threshold in 0.72–0.82 range, default 0.78
- `/lib/devBot.ts` — fake player, joins room via API, submits random short prompts. Toggle via `?bot=3`
- **Gate:** if fal CLIP latency >1s or threshold uncalibratable → escalate immediately

---

## Stage 2 — Rooms core (Hr 2–6) — A

- `/lib/rooms.ts` — Redis CRUD: `createRoom`, `joinRoom`, `leaveRoom`, `getState`, `setState`
- 4-letter code via nanoid custom alphabet, no profanity, no `0/O 1/I`
- `/api/rooms` POST create
- `/api/rooms/[code]` GET state, POST join/leave
- `/api/pusher/auth` presence + private auth
- zod schemas on every input
- TTL 1h on every key

---

## Stage 3 — Landing + lobby (Hr 2–6) — B

- `/` landing: `PROMPT GOLF ⛳️` logo, `[PLAY]` `[JOIN: ____]`
- `/room/[code]` lobby:
  - DiceBear avatars (URL with `seed = playerId`)
  - Name input, ready toggle, host-only Start button
  - Pusher presence channel auto-syncs roster
  - Sounds on join/leave/ready
- Pre-warm fal: dummy generation request fires when lobby mounts (mask cold start)

---

## Stage 4 — Showdown loop (Hr 6–14) — A + B

**A — server**
- `/api/generate` POST `{roomCode, prompt}`:
  1. Validate len ≤200, debounce 3s
  2. Fetch room state, current target, seed
  3. fal FLUX schnell with prompt + seed → image url
  4. fal CLIP target_image vs generated → similarity
  5. Compute `{chars, qualified, rank}`
  6. Append to `room:{CODE}:attempts:{round}` in Redis
  7. Broadcast via Pusher `attempt-submitted`
  8. Return result to caller
- Round state machine in Redis: `idle → countdown(3) → playing(60) → reveal(15) → next | end`
- Server-authoritative timer, broadcast tick events
- Anti-cheese: reject >200 chars, debounce identical resubmits

**B — UI**
- Target image reveal w/ countdown
- `<PromptInput>` — live char counter, color shifts as cap approaches
- Submit → skeleton → image fades in → score animates count-up
- `<Leaderboard>` — qualified players sorted by char count, DNF below, rank pills
- `<RevealScreen>` — target left, attempts stagger in by stroke order, prompts revealed last, fanfare

---

## Stage 5 — Spectator view (Hr 12–14) — B

- `/room/[code]/spectate` — projector layout
- Read-only Pusher subscriber, no controls
- Big target image left, live leaderboard right
- Current attempts stream in with thumbnails
- QR code top-right linking to `/room/[code]` for crowd to join
- This is the big-screen demo upgrade

---

## Stage 6 — Polish (Hr 14–18) — A + B

- Framer Motion: button presses, card flips, score count-up, stagger reveals
- Mobile: sticky prompt input, keyboard handling, test iOS Safari + Android Chrome
- Loading skeletons, error toasts (sonner)
- Edge cases: 1 player, host disconnect → promote next, fal failure (retry once → DNF)
- Sound layer: submit ding, qualified chime, DNF buzz, round-end fanfare

---

## Stage 7 — Share card (Hr 18–20) — C

- `/api/og/[attemptId]` via `@vercel/og`
- Layout: target image + winner's generated image + prompt + char count + "PromptGolf"
- "Share" button on reveal screen → copy link + auto-tweet w/ prefilled text
- OG meta tags on `/room/[code]` for social previews
- Twitter post-hackathon = free reach

---

## Stage 8 — Deploy + domain (Hr 20–22) — A

- Custom domain → Vercel
- Production env vars
- Final deploy, smoke test prod end-to-end on real phones
- Cache headers on `/public/targets/`
- Verify Pusher prod cluster, Upstash prod region

---

## Stage 9 — Demo prep (Hr 22–24) — All

- Decide pitcher (calmest under pressure)
- Rehearse 30s pitch 5×
- 3× full demo run-through on real phones
- Pre-create demo room w/ memorable code
- Pre-warm fal w/ scheduled background ping
- Backup plan: 90s pre-recorded video if realtime breaks
- Hotspot ready in case venue Wi-Fi flakes

---

## Hour Schedule

| Hr | Person A (backend) | Person B (UI) | Person C (content) |
|---|---|---|---|
| 0–2 | env, deps, smoke tests, domain | jklm theme, shadcn primitives | FLUX target gen |
| 2–3 | Threshold spike + host bot | Landing page | Continue targets |
| 2–6 | Rooms API + Redis | Lobby + presence | Finish 30 targets |
| 6–14 | Generate API + scoring + state machine | Game UI + reveal screen | Help test, start spectator if A/B blocked |
| 12–14 | — | Spectator view | — |
| 14–18 | Polish, edge cases | Polish, sounds, animations | Share card / OG route |
| 18–20 | Pre-warm + cache + fal optim | Mobile pass | Share card finalize |
| 20–22 | Deploy + domain | Demo run-through | Pitch rehearsal |
| 22–24 | Buffer + smoke test | Buffer | Buffer |

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| fal latency >2s breaks pacing | HIGH | FLUX schnell 4 steps, fixed seed, loading anim masks. Pre-warm on lobby mount. |
| CLIP threshold mis-tuned | MED | Stage 1 calibration on 5 targets. Show live sim score so players self-tune. |
| Demo Wi-Fi flakes | HIGH | Hotspot backup. Pre-recorded video fallback. |
| Pusher free tier cap | MED | Cap rooms to 8 players. One demo room only. |
| Mobile keyboard covers UI | MED | Test Hr 6 not Hr 22. Sticky input bar. |
| Boring target images | MED | Person C curation real work. Diverse, evocative. |
| Cost runaway | LOW | Per-room rate limit, $20 hard cap, debounce |
| Host disconnects mid-game | MED | Promote next player as host on Pusher leave event |

---

## What's Already Done

- Next.js 15 + TS + Tailwind v4 + shadcn (lyra preset) scaffold
- `.gitignore`, `.env.example`, README, initial commit

---

## First Actions on Go

- **Person A:** drop lyra → install deps → set env → smoke test Pusher/Upstash/fal credentials → buy domain (5min)
- **Person B:** write jklm theme tokens in `globals.css` → install fonts → add shadcn primitives → start landing
- **Person C:** kick off FLUX target generation script, target 30 by Hr 4

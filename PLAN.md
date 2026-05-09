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

**Person C — category curation (Hr 0–4)**
- Targets are generated **on-demand per round** from a host-picked category. Person C's job: write one good FLUX prompt per category and verify it produces solid images across seeds.
- ~8–12 categories: e.g. `object`, `scene`, `character`, `abstract`, `food`, `animal`, `style-pastiche`, `unhinged`. Each evocative, demo-friendly.
- `/data/categories.json` shape: `{id, label, emoji, prompt: string, seedRange: [min, max], demoSafe: boolean}`. **One fixed prompt per category.** Round variety comes from sampling a fresh seed from `seedRange` each round.
- Prompt design tips: short enough that golfing it is plausible (~10–25 words), specific enough that CLIP scores correlate with player skill, but not so locked-down that every seed produces an identical image.
- Test gen quality: run each category's prompt across 5 seeds, confirm outputs are recognizable and varied (not identical, not mush). If a prompt produces same image regardless of seed, widen the prompt; if it produces unrecognizable variety, tighten it.
- Demo-first: at least 3 categories must be **bulletproof** (every seed yields a clear, prompt-able image). Mark these `demoSafe: true` so the lobby UI can default to them.

**Domain decision (Hr 0, 5min timebox):** try `prompt.golf → promptgolf.fun → pgolf.fun → playpromptgolf.com`. First available wins. Move on.

---

## Stage 1 — Threshold + bot (Hr 2–3) — A ⚠️ CRITICAL → ✅ DONE 2026-05-09

**Status:** scoring path validated via `src/app/api/smoke/replicate-clip/route.ts`. fal CLIP path was investigated and rejected (only fal endpoint exposing image embeddings is SAM-3, which is a 1.3M-dim segmentation feature map — doesn't discriminate semantic similarity). Pivoted to **Replicate `andreasjansson/clip-features`** (version-pinned), which returns the standard openai/clip-vit-large-patch14 768-dim embedding. Calibration result on 4-image test (red apple target, identical regen, fuzzy "red apple on table", wrong "yellow banana on grass"):

| Pair | Cosine | Notes |
|---|---|---|
| target ↔ identical regen | **1.000** | confirms FLUX is deterministic with fixed seed |
| target ↔ fuzzy (golfer-style short prompt) | **0.978** | qualifying ceiling |
| target ↔ wrong (different concept) | **0.849** | unrelated baseline |

**Important:** image-image CLIP cosine has a high floor (~0.85 even for unrelated natural photos — the embedding space isn't packed in [0, 1]). Separation is what matters, not absolute. We have ≈+0.13 separation between fuzzy and wrong.

- **Threshold default: 0.88** (between wrong and fuzzy). Recheck per category — different visual styles may shift the band.
- Latency: FLUX gen ~1s, CLIP embed ~0.9s/image. Round-start budget: 1× FLUX (~1s) + 1× CLIP target embed (~0.9s) ≈ 2s, masked by `generating` phase.
- Per-submission budget: 1× FLUX (~1s) + 1× CLIP candidate embed (~0.9s) + cosine in JS (free) ≈ 2s.

**Shipped 2026-05-09:**
- `src/lib/replicate.ts` — `clipEmbed(imageUrl): Promise<number[]>`. Lazy singleton `Replicate` client, version-pinned to `75b33f25...`, throws on missing env or unexpected output shape.
- `src/lib/scoring.ts` — `cosine(a, b)`, `qualifies(sim, threshold)`, `tiebreak<T extends Rankable>(attempts)` implementing `chars → tokens → similarity → submittedAt`.
- `src/lib/fal.ts` — `falGenerate(prompt, seed): Promise<{imageUrl, seed}>`. FLUX schnell @ 4 steps, square_hd, throws on missing env or empty image array.
- `src/lib/__tests__/scoring.test.ts` — 13 vitest cases covering identical/parallel/orthogonal/anti-parallel cosine, length-mismatch throw, qualifies edges, all four tiebreak rungs, immutability.
- `src/app/api/smoke/whoami/` and `src/app/api/smoke/fal/` (SAM-3 path) deleted. `src/app/api/smoke/replicate-clip/` kept until Stage 4 lands.

**Still to do:**
- `/lib/devBot.ts` — fake player, joins room via API, submits random short prompts. Toggle via `?bot=3`.

**Originally-planned escalation gate:** if fal CLIP latency >1s or threshold uncalibratable → escalate. Triggered. Resolved by pivoting to Replicate.

---

## Stage 2 — Rooms core (Hr 2–6) — A

- `/lib/types.ts` — `Room`, `Player`, `RoundState`, `Attempt`, `Scores` (mirror CLAUDE.md → Data Model)
- `/lib/session.ts` — `getOrMintPlayerId()` reads/writes httpOnly cookie; called by every API route + landing page
- `/lib/rooms.ts` — Redis CRUD: `createRoom`, `joinRoom`, `leaveRoom`, `getState`, `setState`. Every write increments `Room.version`.
- 4-letter code via nanoid custom alphabet, no profanity, no `0/O 1/I`
- `/api/rooms` POST create — body: `{ maxPlayers: 1–8, categories, totalRounds: 1–5, timer: 30–120, promptMaxLength: 50–200 }`. Returns `{ code }`.
- `/api/rooms/[code]` GET state, POST join/leave. Every body carries `roomCode` (per convention) — but the path param `[code]` is the source of truth; body `roomCode` must match or 400.
- `/api/pusher/auth` presence + private auth, validates cookie playerId is in the room
- zod schemas on every input
- TTL 1h on every key

---

## Stage 3 — Landing + lobby (Hr 2–6) — B

- `/` landing:
  - On first visit, server mints `playerId` cookie + default name (`Guest-XXXX`) + random `avatarSeed`
  - Editable name input + DiceBear avatar preview (re-rolls seed on click)
  - `[CREATE LOBBY]` opens dialog: max-players slider (1–8), category multi-select from `data/categories.json`, total rounds 1/2/3/4/5, timer 30–120s, prompt max length 50–200
  - `[JOIN: ____]` 4-char input → `/room/[code]`
- `/room/[code]` lobby:
  - DiceBear avatars (URL with `seed = avatarSeed`, not `playerId`, so re-rolls work)
  - Name input, ready toggle, host-only Start button
  - Display chosen categories as badges so players know what kind of target to expect
  - Pusher presence channel auto-syncs roster + populates `connected` / `lastSeenAt`
  - Sounds on join/leave/ready
- Pre-warm fal: dummy generation request fires when lobby mounts (mask cold start) — doubly important now that round target gen is live per round

---

## Stage 4 — Showdown loop (Hr 6–14) — A + B

**Composing primitives.** The scoring/gen building blocks are already shipped (`lib/fal.ts`, `lib/replicate.ts`, `lib/scoring.ts`). The two API routes below are now compositions of existing functions, no new external integration:

```ts
// /api/round/start
const { imageUrl: targetImageUrl } = await falGenerate(category.prompt, seed)
const targetEmbedding = await clipEmbed(targetImageUrl)
// persist {targetImageUrl, targetEmbedding, seed} on RoomState

// /api/generate
const { imageUrl: candidateUrl } = await falGenerate(playerPrompt, room.seed)
const candidateEmbedding = await clipEmbed(candidateUrl)
const similarity = cosine(room.targetEmbedding, candidateEmbedding)
const ok = qualifies(similarity, room.settings.threshold ?? 0.88)
```

**A — server**
- `/api/round/start` POST `{roomCode}` (host-only):
  1. Validate caller is host via cookie playerId
  2. Pick category from `room.settings.category` (or rotate through if multi-category)
  3. Look up category's prompt in `data/categories.json` via `/lib/targets.ts`
  4. Pick fresh `seed` from category's `seedRange`
  5. fal FLUX schnell with category prompt + seed → `targetImageUrl`
  6. **Embed target once via `clipEmbed(targetImageUrl)` → 768d `targetEmbedding`. Cache on `RoomState.targetEmbedding`.** This is the keystone of the per-submission cost model: target is embedded once, reused for every player's cosine.
  7. Write round state into `RoomState`, flip status `lobby|reveal → generating → countdown`
  8. Broadcast `round-starting` over Pusher with `{targetImageUrl, category}` — never `targetPrompt`, never `targetEmbedding`. Category id is safe to send: it's a genre hint, not the answer key. Knowing the prompt verbatim doesn't help players golf — the char-count tiebreak punishes long prompts even if they hit threshold.
  9. Server timer drives `countdown(3) → playing(60) → reveal(15)`
- `/api/generate` POST `{roomCode, prompt}` (player submission):
  1. Validate cookie playerId is in room, status === `playing`, prompt len ≤ `room.settings.promptMaxLength`, debounce 3s
  2. Fetch `RoomState` → reuse the round's `seed` so player's gen and target gen share latent space
  3. fal FLUX schnell with player's prompt + seed → candidate image url
  4. `clipEmbed(candidateImageUrl)` → 768d candidate embedding
  5. `similarity = cosine(targetEmbedding, candidateEmbedding)` — pure JS, no extra API call
  6. Compute `{chars, tokens: Math.ceil(prompt.length / 4), qualified: similarity >= room.settings.threshold (default 0.88), rank}`
  7. Append `Attempt` to `room:{CODE}:attempts:{round}` in Redis (read → push → write)
  8. Broadcast via Pusher `attempt-submitted`
  9. Return result to caller
- Round state machine in Redis: `lobby → generating → countdown(3) → playing(60) → reveal(15) → (next round | ended)`
- Server-authoritative timer, broadcast tick events
- Reveal payload includes `targetPrompt` (the only time it leaves the server)
- Anti-cheese: reject >200 chars, debounce identical resubmits
- Disconnect handling: Pusher webhook → flip `connected: false` + `lastSeenAt = now()`. Server reaper checks at round end: if `!connected && now - lastSeenAt > disconnectGraceMs`, treat as DNF for the current round.

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
| 0–2 | env, deps, smoke tests, domain, `lib/types.ts` + `lib/session.ts` | jklm theme, shadcn primitives | Category taxonomy + first FLUX gen tests |
| 2–3 | Threshold + round-gen spike + host bot | Landing page (cookie mint, name/avatar editor) | Continue category tuning |
| 2–6 | Rooms API + Redis + `/api/round/start` skeleton | Lobby + category badges + presence | Finalize `categories.json`, mark `demoSafe` |
| 6–14 | Generate API + scoring + state machine + disconnect reaper | Game UI + reveal screen (incl. `generating` phase) | Help test gens, start spectator if A/B blocked |
| 12–14 | — | Spectator view | — |
| 14–18 | Polish, edge cases | Polish, sounds, animations | Share card / OG route |
| 18–20 | Pre-warm + cache + fal optim | Mobile pass | Share card finalize |
| 20–22 | Deploy + domain | Demo run-through | Pitch rehearsal |
| 22–24 | Buffer + smoke test | Buffer | Buffer |

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| fal latency >2s breaks per-submission pacing | HIGH | FLUX schnell 4 steps, fixed seed, loading anim masks. Pre-warm on lobby mount. |
| Round-target gen latency stalls round start | HIGH | Now: 1× FLUX (~1s) + 1× Replicate CLIP target embed (~0.9s) = ~2s. Below 5s p50 budget. `generating` phase still masks the wait. |
| Replicate cold start on first round | MED | New risk from CLIP pivot. Replicate community models can spin up cold (5–30s). Mitigation: fire a tiny pre-warm clip-features call when lobby mounts; keep a hot path by hitting CLIP at least once per minute during lobby idle. |
| CLIP threshold mis-tuned | MED | Calibrated to 0.88 against image-image baseline (see Stage 1). Recheck per category — different visual styles shift the band. Show live sim score so players self-tune. |
| Category produces unrecognizable images | MED | Person C tests each category 5× during Hr 0–4. Mark `demoSafe: true` only after passing. Demo defaults to safe categories. |
| Demo Wi-Fi flakes | HIGH | Hotspot backup. Pre-recorded video fallback. |
| Pusher free tier cap | MED | Cap rooms to 8 players (`settings.maxPlayers`). One demo room only. |
| Mobile keyboard covers UI | MED | Test Hr 6 not Hr 22. Sticky input bar. |
| Cost runaway from on-demand gen | MED | Was LOW with pre-gen targets — bumped because every round is now a paid call. Per-room rate limit, $20 hard cap, debounce. Cap rooms per session. |
| Host disconnects mid-game | MED | 30s grace via `disconnectGraceMs`. On expiry, promote next player by `joinedAt` order. |
| Player exploits reveal-after-reconnect | LOW | 30s grace doesn't extend past round end — DNF reaper runs at `reveal` transition, no second chance. |

---

## What's Already Done

- Next.js 15 + TS + Tailwind v4 + shadcn (lyra preset) scaffold
- `.gitignore`, `.env.example`, README, initial commit

---

## First Actions on Go

- **Person A:** drop lyra → install deps → set env → smoke test Pusher/Upstash/fal credentials → buy domain (5min) → scaffold `lib/types.ts` + `lib/session.ts` (cookie playerId)
- **Person B:** write jklm theme tokens in `globals.css` → install fonts → add shadcn primitives → start landing with name editor + avatar re-roll
- **Person C:** draft 8–12 categories with prompt fragments → run each 5× through FLUX schnell → mark winners `demoSafe: true` → land in `data/categories.json` by Hr 4

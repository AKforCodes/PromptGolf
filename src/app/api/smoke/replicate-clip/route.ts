import { fal } from '@fal-ai/client'
import Replicate from 'replicate'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Smoke variant: same 4-image test as /api/smoke/fal, but scoring via Replicate's
// andreasjansson/clip-features instead of fal SAM-3. Sends all 4 image URLs in
// one CLIP call (newline-separated `inputs`); the production game flow will
// instead embed target once at round start and embed each candidate per submission.

const TARGET_PROMPT = 'a red apple on a wooden table'
const FUZZY_PROMPT = 'red apple on table'
const WRONG_PROMPT = 'a yellow banana on grass'
const SEED = 42

type FluxOutput = {
  images: Array<{ url: string }>
  seed: number
  prompt: string
}

type ClipFeaturesOutput = Array<{
  input: string
  embedding: number[]
}>

async function timed<T>(label: string, fn: () => Promise<T>) {
  const t0 = Date.now()
  const value = await fn()
  return { label, ms: Date.now() - t0, value }
}

async function generate(prompt: string, seed: number) {
  const out = await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt,
      seed,
      num_inference_steps: 4,
      image_size: 'square_hd',
      num_images: 1,
    },
  })
  return out.data as FluxOutput
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`embedding length mismatch: ${a.length} vs ${b.length}`)
  }
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'disabled in production' }, { status: 403 })
  }
  if (!process.env.FAL_KEY) {
    return NextResponse.json({ error: 'FAL_KEY missing' }, { status: 500 })
  }
  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json({ error: 'REPLICATE_API_TOKEN missing' }, { status: 500 })
  }

  try {
    return await runSmoke()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const name = err instanceof Error ? err.name : 'UnknownError'
    const apiErr = err as { status?: number; body?: unknown; requestId?: string }
    return NextResponse.json(
      {
        error: 'smoke run failed',
        name,
        message,
        sdkStatus: apiErr.status ?? null,
        sdkBody: apiErr.body ?? null,
        sdkRequestId: apiErr.requestId ?? null,
      },
      { status: 500 },
    )
  }
}

async function runSmoke() {
  const totalStart = Date.now()
  const log: Array<{ label: string; ms: number }> = []

  // Force-refresh the fal singleton in case dev-server state is stale
  fal.config({ credentials: process.env.FAL_KEY })

  // 4 FLUX gens: target, repeat (determinism), fuzzy (golfer-style), wrong (different)
  const target = await timed('flux:target', () => generate(TARGET_PROMPT, SEED))
  log.push({ label: target.label, ms: target.ms })
  const repeat = await timed('flux:repeat', () => generate(TARGET_PROMPT, SEED))
  log.push({ label: repeat.label, ms: repeat.ms })
  const fuzzy = await timed('flux:fuzzy', () => generate(FUZZY_PROMPT, SEED))
  log.push({ label: fuzzy.label, ms: fuzzy.ms })
  const wrong = await timed('flux:wrong', () => generate(WRONG_PROMPT, SEED))
  log.push({ label: wrong.label, ms: wrong.ms })

  const urls = [
    target.value.images[0].url,
    repeat.value.images[0].url,
    fuzzy.value.images[0].url,
    wrong.value.images[0].url,
  ]

  // One CLIP call with all 4 URLs newline-separated. Output array order matches input order.
  // Version-pinned (Replicate community models can't run by bare owner/name)
  const CLIP_FEATURES =
    'andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a' as const
  const replicate = new Replicate()
  const clip = await timed('clip:batch', async () => {
    const out = await replicate.run(CLIP_FEATURES, {
      input: { inputs: urls.join('\n') },
    })
    return out as unknown as ClipFeaturesOutput
  })
  log.push({ label: clip.label, ms: clip.ms })

  const result = clip.value
  if (!Array.isArray(result) || result.length !== 4) {
    return NextResponse.json(
      {
        error: 'unexpected clip-features output shape',
        got: result,
      },
      { status: 500 },
    )
  }

  const eTarget = result[0].embedding
  const eRepeat = result[1].embedding
  const eFuzzy = result[2].embedding
  const eWrong = result[3].embedding

  const similarities = {
    deterministic: cosine(eTarget, eRepeat),
    fuzzy: cosine(eTarget, eFuzzy),
    wrong: cosine(eTarget, eWrong),
  }

  const determinismOk = similarities.deterministic >= 0.99
  const orderingOk = similarities.fuzzy > similarities.wrong + 0.1
  const wrongLowEnough = similarities.wrong < 0.7

  const verdict =
    determinismOk && orderingOk && wrongLowEnough
      ? `PASS — Replicate CLIP discriminates. Suggested threshold floor: ${((similarities.fuzzy + similarities.wrong) / 2).toFixed(2)}`
      : 'INCONCLUSIVE — recheck test prompts or model output'

  return NextResponse.json({
    totalMs: Date.now() - totalStart,
    embeddingDim: eTarget.length,
    log,
    images: {
      target: urls[0],
      repeat: urls[1],
      fuzzy: urls[2],
      wrong: urls[3],
    },
    similarities,
    checks: { determinismOk, orderingOk, wrongLowEnough },
    verdict,
  })
}

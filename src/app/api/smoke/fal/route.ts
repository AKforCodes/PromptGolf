import { fal } from '@fal-ai/client'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const TARGET_PROMPT = 'a red apple on a wooden table'
const FUZZY_PROMPT = 'red apple on table'
const WRONG_PROMPT = 'a yellow banana on grass'
const SEED = 42

type FluxOutput = {
  images: Array<{ url: string }>
  seed: number
  prompt: string
}

type EmbedOutput = {
  embedding_b64: string
}

async function timed<T>(label: string, fn: () => Promise<T>) {
  const t0 = Date.now()
  const value = await fn()
  return { label, ms: Date.now() - t0, value }
}

// Force-refresh credentials on every call. The fal singleton is created at
// module load — if FAL_KEY changed in env after dev-server start, the singleton
// can hold stale state. Re-config'ing each time is cheap and decisive.
function refreshFalAuth() {
  if (process.env.FAL_KEY) {
    fal.config({ credentials: process.env.FAL_KEY })
  }
}

async function generate(prompt: string, seed: number) {
  refreshFalAuth()
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

async function embed(imageUrl: string) {
  refreshFalAuth()
  const out = await fal.subscribe('fal-ai/sam-3/image/embed', {
    input: { image_url: imageUrl },
  })
  return out.data as EmbedOutput
}

function decodeEmbedding(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64')
  if (buf.byteLength % 4 !== 0) {
    throw new Error(`embedding byte length ${buf.byteLength} not divisible by 4 — not a Float32 buffer`)
  }
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}

function cosine(a: Float32Array, b: Float32Array): number {
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
    return NextResponse.json(
      { error: 'smoke route disabled in production' },
      { status: 403 },
    )
  }
  if (!process.env.FAL_KEY) {
    return NextResponse.json(
      { error: 'FAL_KEY missing — set it in .env.local before running this' },
      { status: 500 },
    )
  }

  try {
    return await runSmoke()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const name = err instanceof Error ? err.name : 'UnknownError'
    // ApiError from @fal-ai/client carries .status, .body, .requestId — expose them
    const apiErr = err as { status?: number; body?: unknown; requestId?: string }
    return NextResponse.json(
      {
        error: 'smoke run failed',
        name,
        message,
        sdkStatus: apiErr.status ?? null,
        sdkBody: apiErr.body ?? null,
        sdkRequestId: apiErr.requestId ?? null,
        falKeyLength: (process.env.FAL_KEY ?? '').length,
      },
      { status: 500 },
    )
  }
}

async function runSmoke() {
  const totalStart = Date.now()
  const log: Array<{ label: string; ms: number }> = []

  // 4 generations: target, target-repeat (determinism), fuzzy (golfer-style), wrong (different)
  const target = await timed('flux:target', () => generate(TARGET_PROMPT, SEED))
  log.push({ label: target.label, ms: target.ms })
  const repeat = await timed('flux:repeat', () => generate(TARGET_PROMPT, SEED))
  log.push({ label: repeat.label, ms: repeat.ms })
  const fuzzy = await timed('flux:fuzzy', () => generate(FUZZY_PROMPT, SEED))
  log.push({ label: fuzzy.label, ms: fuzzy.ms })
  const wrong = await timed('flux:wrong', () => generate(WRONG_PROMPT, SEED))
  log.push({ label: wrong.label, ms: wrong.ms })

  // 4 embeddings via SAM-3 — note: SAM-3 is a segmentation model, not CLIP.
  // This smoke test is checking whether its embeddings happen to discriminate
  // semantic similarity well enough to use as a CLIP stand-in. If the verdict
  // is ESCALATE, swap in a real CLIP path (transformers.js server-side, or
  // Replicate openai/clip-vit-large-patch14).
  const eTarget = await timed('embed:target', () => embed(target.value.images[0].url))
  log.push({ label: eTarget.label, ms: eTarget.ms })
  const eRepeat = await timed('embed:repeat', () => embed(repeat.value.images[0].url))
  log.push({ label: eRepeat.label, ms: eRepeat.ms })
  const eFuzzy = await timed('embed:fuzzy', () => embed(fuzzy.value.images[0].url))
  log.push({ label: eFuzzy.label, ms: eFuzzy.ms })
  const eWrong = await timed('embed:wrong', () => embed(wrong.value.images[0].url))
  log.push({ label: eWrong.label, ms: eWrong.ms })

  const vTarget = decodeEmbedding(eTarget.value.embedding_b64)
  const vRepeat = decodeEmbedding(eRepeat.value.embedding_b64)
  const vFuzzy = decodeEmbedding(eFuzzy.value.embedding_b64)
  const vWrong = decodeEmbedding(eWrong.value.embedding_b64)

  const similarities = {
    deterministic: cosine(vTarget, vRepeat),
    fuzzy: cosine(vTarget, vFuzzy),
    wrong: cosine(vTarget, vWrong),
  }

  const determinismOk = similarities.deterministic >= 0.99
  const orderingOk = similarities.fuzzy > similarities.wrong + 0.1
  const wrongLowEnough = similarities.wrong < 0.7

  const verdict =
    determinismOk && orderingOk && wrongLowEnough
      ? `PASS — SAM-3 discriminates. Suggested threshold floor: ${((similarities.fuzzy + similarities.wrong) / 2).toFixed(2)}`
      : 'ESCALATE — SAM-3 embeddings do not separate semantic similarity well. Try a real CLIP path before continuing.'

  return NextResponse.json({
    totalMs: Date.now() - totalStart,
    embeddingDim: vTarget.length,
    log,
    images: {
      target: target.value.images[0].url,
      repeat: repeat.value.images[0].url,
      fuzzy: fuzzy.value.images[0].url,
      wrong: wrong.value.images[0].url,
    },
    similarities,
    checks: { determinismOk, orderingOk, wrongLowEnough },
    verdict,
  })
}


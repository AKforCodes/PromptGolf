import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { ElevenLabsClient } from "elevenlabs"
import { redis } from "@/lib/redis"
import { getRequiredEnv } from "@/lib/env"

// Push-to-talk transcription. Browser records audio (webm/opus or mp4 depending
// on platform), POSTs the blob here as multipart/form-data; we forward to
// ElevenLabs Scribe and return the recognised text. The client populates the
// prompt input with the result and the player edits/submits manually.
//
// Request: multipart/form-data with one file field `audio`
// Response: { text: string, durationMs: number, languageCode: string }

// 30s @ 256 kbps ≈ 1MB. 2MB cap allows headroom + a slow encode without
// rejecting legitimate recordings. UI enforces a 30s hard cap on capture.
const MAX_BYTES = 2 * 1024 * 1024
const DEBOUNCE_SECONDS = 3

export const maxDuration = 60

function debounceKey(userId: string): string {
  return `transcribe:debounce:${userId}`
}

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const userId = cookieStore.get("user_id")?.value
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }

  // Per-user debounce. Bounds credit usage if a client misbehaves.
  const debounced = await redis.set(debounceKey(userId), "1", {
    nx: true,
    ex: DEBOUNCE_SECONDS,
  })
  if (debounced !== "OK") {
    return NextResponse.json(
      { error: `transcribing too fast — wait ${DEBOUNCE_SECONDS}s` },
      { status: 429 },
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: "expected multipart/form-data with an 'audio' field" },
      { status: 400 },
    )
  }

  const file = formData.get("audio")
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "missing 'audio' file field" },
      { status: 400 },
    )
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "audio file is empty" }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `audio too large (max ${MAX_BYTES} bytes / ~30s)` },
      { status: 413 },
    )
  }

  const apiKey = getRequiredEnv("ELEVENLABS_API_KEY")
  const client = new ElevenLabsClient({ apiKey })

  const t0 = Date.now()
  try {
    const result = await client.speechToText.convert({
      file,
      model_id: "scribe_v2",
      // Don't tag (laughter), (footsteps) etc — they'd land in the prompt verbatim.
      tag_audio_events: false,
    })

    return NextResponse.json({
      text: result.text,
      durationMs: Date.now() - t0,
      languageCode: result.language_code,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: "transcription failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    )
  }
}

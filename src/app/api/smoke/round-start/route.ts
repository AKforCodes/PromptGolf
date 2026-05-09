import { NextResponse } from "next/server"
import { getCategoryPrompt } from "@/lib/targets"
import { falGenerate } from "@/lib/fal"
import { clipEmbed } from "@/lib/replicate"
import type { RoomSettings } from "@/lib/types"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// Smoke test for the round-start composition only (no Pusher, no Redis).
// Mirrors the slow-path of the "start" action in /api/v1/rooms/[code]:
//   getCategoryPrompt → falGenerate → clipEmbed
// Confirms FAL_KEY + REPLICATE_API_TOKEN + categories.json all align.
//
// GET /api/smoke/round-start?category=animals  (default: animals)

type CategoryId = RoomSettings["category"]

function isCategory(s: string): s is CategoryId {
  return ["animals", "landmarks", "foods", "nature", "characters"].includes(s)
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled in production" }, { status: 403 })
  }

  const url = new URL(request.url)
  const categoryParam = url.searchParams.get("category") ?? "animals"
  if (!isCategory(categoryParam)) {
    return NextResponse.json(
      { error: `unknown category: ${categoryParam}` },
      { status: 400 }
    )
  }

  const totalStart = Date.now()
  const log: Array<{ label: string; ms: number }> = []

  try {
    const t0 = Date.now()
    const { prompt, seed } = getCategoryPrompt(categoryParam)
    log.push({ label: "targets:pickPrompt", ms: Date.now() - t0 })

    const t1 = Date.now()
    const { imageUrl } = await falGenerate(prompt, seed)
    log.push({ label: "fal:generate", ms: Date.now() - t1 })

    const t2 = Date.now()
    const targetEmbedding = await clipEmbed(imageUrl)
    log.push({ label: "replicate:clipEmbed", ms: Date.now() - t2 })

    return NextResponse.json({
      totalMs: Date.now() - totalStart,
      log,
      category: categoryParam,
      seed,
      prompt, // dev-only: in production this stays server-side
      imageUrl,
      embeddingDim: targetEmbedding.length,
      embeddingPreview: targetEmbedding.slice(0, 3),
      verdict:
        targetEmbedding.length === 768
          ? "PASS — composition works, target is generated and embedded."
          : `UNEXPECTED — embedding has ${targetEmbedding.length} dims, expected 768`,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: "round-start composition failed",
        name: err instanceof Error ? err.name : "UnknownError",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}

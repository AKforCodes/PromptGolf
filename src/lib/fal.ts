import { fal } from '@fal-ai/client'
import { isRateLimitError, jitter, withJitterRetry } from './jitter'

const FLUX_SCHNELL = 'fal-ai/flux/schnell' as const

type FluxOutput = {
  images: Array<{ url: string }>
  seed: number
}

export async function falGenerate(
  prompt: string,
  seed: number,
): Promise<{ imageUrl: string; seed: number }> {
  if (!process.env.FAL_KEY) {
    throw new Error('FAL_KEY is not set')
  }

  // Pre-call jitter spreads concurrent submissions across a small window so
  // they don't all land on fal at the same instant.
  await jitter(50, 300)

  const out = await withJitterRetry(
    () =>
      fal.subscribe(FLUX_SCHNELL, {
        input: {
          prompt,
          seed,
          num_inference_steps: 4,
          image_size: 'square_hd',
          num_images: 1,
        },
      }),
    { maxAttempts: 3, baseMs: 500, shouldRetry: isRateLimitError },
  )
  const data = out.data as FluxOutput

  if (!data?.images?.[0]?.url) {
    throw new Error('flux/schnell returned unexpected shape')
  }
  return { imageUrl: data.images[0].url, seed: data.seed }
}

import Replicate from 'replicate'

// Pinned: bare `andreasjansson/clip-features` returns 404 on Replicate;
// community models require a version hash.
const CLIP_FEATURES_MODEL =
  'andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a' as const

type ClipFeaturesOutput = Array<{ input: string; embedding: number[] }>

let client: Replicate | null = null

function getClient(): Replicate {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN is not set')
  }
  if (!client) client = new Replicate()
  return client
}

export async function clipEmbed(imageUrl: string): Promise<number[]> {
  const replicate = getClient()
  const out = (await replicate.run(CLIP_FEATURES_MODEL, {
    input: { inputs: imageUrl },
  })) as unknown as ClipFeaturesOutput

  if (!Array.isArray(out) || !Array.isArray(out[0]?.embedding)) {
    throw new Error('clip-features returned unexpected shape')
  }
  return out[0].embedding
}

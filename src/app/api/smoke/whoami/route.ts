import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Bypasses the @fal-ai/client SDK entirely. Hits fal's queue REST endpoint
// directly with the env-loaded FAL_KEY. Lets us tell whether Forbidden is:
//   (a) the key being rejected by fal (bad key), or
//   (b) the SDK doing something we didn't expect.
// We submit a real (cheap) FLUX schnell request — auth is checked before
// generation kicks off, so a 401/403 here is definitively an auth failure.

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'disabled in production' }, { status: 403 })
  }
  const key = process.env.FAL_KEY
  if (!key) {
    return NextResponse.json({ error: 'FAL_KEY missing in env' }, { status: 500 })
  }

  // Surface non-content characters in the env value without leaking the key.
  const trimmed = key.trim()
  const envHygiene = {
    rawLength: key.length,
    trimmedLength: trimmed.length,
    hadSurroundingWhitespace: key !== trimmed,
    startsWithQuote: /^["']/.test(key),
    endsWithQuote: /["']$/.test(key),
    containsCR: key.includes('\r'),
    containsNewline: key.includes('\n'),
    colonCount: (key.match(/:/g) ?? []).length,
    keyIdPreview: trimmed.split(':')[0]?.slice(0, 8) ?? null,
  }

  // Direct fetch — exactly what the SDK does, minus any SDK-level config.
  const t0 = Date.now()
  const res = await fetch('https://queue.fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${trimmed}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: 'whoami probe — do not generate',
      seed: 1,
      num_inference_steps: 4,
      image_size: 'square_hd',
      num_images: 1,
    }),
  })
  const ms = Date.now() - t0
  const text = await res.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // not json — leave as text
  }

  return NextResponse.json({
    ms,
    status: res.status,
    statusText: res.statusText,
    falRequestId: res.headers.get('x-fal-request-id'),
    body,
    envHygiene,
    interpretation:
      res.status === 401 || res.status === 403
        ? 'Key is rejected by fal. It is invalid, revoked, or for a different account. Generate a new one at https://fal.ai/dashboard/keys.'
        : res.status === 422 || (res.status >= 200 && res.status < 300)
          ? 'Auth OK — the key is valid. The earlier SDK Forbidden must be coming from somewhere else (proxy, env caching, etc).'
          : `Unexpected status ${res.status} — see body for details.`,
  })
}

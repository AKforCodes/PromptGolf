export function cosine(a: number[], b: number[]): number {
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

export function qualifies(similarity: number, threshold: number): boolean {
  return similarity >= threshold
}

type Rankable = {
  chars: number
  tokens: number
  similarity: number
  submittedAt: number
}

// Golf ranking: lower chars wins, then lower tokens, then higher similarity,
// then earlier submission. Caller is responsible for partitioning DNFs below.
export function tiebreak<T extends Rankable>(attempts: readonly T[]): T[] {
  return [...attempts].sort((a, b) => {
    if (a.chars !== b.chars) return a.chars - b.chars
    if (a.tokens !== b.tokens) return a.tokens - b.tokens
    if (a.similarity !== b.similarity) return b.similarity - a.similarity
    return a.submittedAt - b.submittedAt
  })
}

type ScorableAttempt = {
  userId: string
  similarity: number
  qualified: boolean
}

type PickableAttempt = ScorableAttempt & { id: string }

type ScorableVote = {
  targetId: string
  value: "bad" | "ok" | "good" | "excellent"
}

// CLIP component: 60 points × similarity for qualifying attempts; 0 for DNFs.
// 1.0 sim = 60 pts; 0.9 sim = 54 pts; sub-threshold = 0 pts.
export const CLIP_POINTS_MAX = 60

export function clipPoints(similarity: number, qualified: boolean): number {
  return qualified ? Math.round(CLIP_POINTS_MAX * similarity) : 0
}

// Vote component: per-vote points received from other players.
// Per-round vote bonus = sum over all votes targeting you.
export const VOTE_POINTS: Record<ScorableVote["value"], number> = {
  bad: 0,
  ok: 3,
  good: 6,
  excellent: 10,
}

// Resolve each player's "final" attempt for the round.
// Priority: explicit pick → highest-similarity qualified → highest-similarity overall.
// Players with zero attempts are simply absent from the result.
// Pure.
export function selectFinalAttempts<T extends PickableAttempt>(
  attempts: readonly T[],
  picks: Record<string, string>
): T[] {
  const byUser = new Map<string, T[]>()
  for (const a of attempts) {
    const arr = byUser.get(a.userId) ?? []
    arr.push(a)
    byUser.set(a.userId, arr)
  }

  const finals: T[] = []
  for (const [userId, userAttempts] of byUser) {
    const explicit = userAttempts.find((a) => a.id === picks[userId])
    if (explicit) {
      finals.push(explicit)
      continue
    }
    const qualified = userAttempts.filter((a) => a.qualified)
    if (qualified.length > 0) {
      finals.push(qualified.reduce((b, a) => (a.similarity > b.similarity ? a : b)))
      continue
    }
    finals.push(userAttempts.reduce((b, a) => (a.similarity > b.similarity ? a : b)))
  }
  return finals
}

// Award per-round CLIP + vote points into the cumulative scores map.
// Caller must pre-dedup attempts to one-per-player via selectFinalAttempts.
// DNFs (qualified === false) contribute 0 CLIP but can still receive vote points.
// Pure: returns a new object.
export function awardRoundScores<A extends ScorableAttempt, V extends ScorableVote>(
  currentScores: Record<string, number>,
  finalAttempts: readonly A[],
  votes: readonly V[] = []
): Record<string, number> {
  const next = { ...currentScores }

  for (const a of finalAttempts) {
    next[a.userId] = (next[a.userId] ?? 0) + clipPoints(a.similarity, a.qualified)
  }

  for (const v of votes) {
    next[v.targetId] = (next[v.targetId] ?? 0) + VOTE_POINTS[v.value]
  }

  return next
}

// Vote-only scoring. CLIP was investigated and dropped 2026-05-09 in favour of
// pure player-voting — target images now serve as a shared anchor for voters,
// not as an algorithmic scoring reference. See CLAUDE.md → Locked Decisions.

type Rankable = {
  chars: number
  tokens: number
  similarity: number
  submittedAt: number
}

// In-round attempt ranking — used for display order, not for scoring.
// Lower chars wins, then lower tokens, then higher similarity (vestigial
// since CLIP was dropped — always 0 — but harmless), then earlier submission.
export function tiebreak<T extends Rankable>(attempts: readonly T[]): T[] {
  return [...attempts].sort((a, b) => {
    if (a.chars !== b.chars) return a.chars - b.chars
    if (a.tokens !== b.tokens) return a.tokens - b.tokens
    if (a.similarity !== b.similarity) return b.similarity - a.similarity
    return a.submittedAt - b.submittedAt
  })
}

type PickableAttempt = {
  id: string
  userId: string
  submittedAt: number
}

type ScorableVote = {
  targetId: string
  value: "bad" | "ok" | "good" | "excellent"
}

// Vote points received per vote. Spec: 4 excellents = 40 pts.
export const VOTE_POINTS: Record<ScorableVote["value"], number> = {
  bad: 0,
  ok: 3,
  good: 6,
  excellent: 10,
}

// Resolve each player's "final" attempt for the round.
// Priority: explicit pick → last-submitted (most recent submittedAt).
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
    finals.push(
      userAttempts.reduce((b, a) => (a.submittedAt > b.submittedAt ? a : b))
    )
  }
  return finals
}

// Award per-round vote points into the cumulative scores map.
// `finalAttempts` is currently unused for scoring but retained in the signature
// so callers can pass it without rewiring; it lets us reintroduce a CLIP
// component later without changing the call sites if the team changes their mind.
// Pure: returns a new object.
export function awardRoundScores<A extends { userId: string }, V extends ScorableVote>(
  currentScores: Record<string, number>,
  _finalAttempts: readonly A[],
  votes: readonly V[] = []
): Record<string, number> {
  const next = { ...currentScores }
  for (const v of votes) {
    next[v.targetId] = (next[v.targetId] ?? 0) + VOTE_POINTS[v.value]
  }
  return next
}

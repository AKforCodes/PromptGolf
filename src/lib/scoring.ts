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

// Each vote on a player's image awards them POINTS_PER_VOTE.
export const POINTS_PER_VOTE = 10

// Returns the userIds tied for the highest score, restricted to `eligible`.
// Returns [] if eligible is empty or every eligible player has score 0.
// Used at end-of-round to detect ties:
//   - main rounds done with 2+ tied → enter tiebreaker
//   - tiebreaker round done with 2+ still tied → another tiebreaker
//   - exactly 1 → that player wins, game ends
export function findTopTiedPlayers(
  scores: Record<string, number>,
  eligible: readonly string[]
): string[] {
  if (eligible.length === 0) return []
  const list = eligible.map((uid) => ({ uid, score: scores[uid] ?? 0 }))
  const max = Math.max(0, ...list.map((s) => s.score))
  if (max === 0) return []
  return list.filter((s) => s.score === max).map((s) => s.uid)
}

// Award per-round vote counts into the cumulative scores map.
// Each player has exactly one vote per round; each vote = POINTS_PER_VOTE
// points to that target. `finalAttempts` is unused for scoring but retained
// in the signature so callers don't need to rewire if the scoring rule grows
// back later.
// Pure: returns a new object.
export function awardRoundScores<A extends { userId: string }, V extends ScorableVote>(
  currentScores: Record<string, number>,
  _finalAttempts: readonly A[],
  votes: readonly V[] = []
): Record<string, number> {
  const next = { ...currentScores }
  for (const v of votes) {
    next[v.targetId] = (next[v.targetId] ?? 0) + POINTS_PER_VOTE
  }
  return next
}

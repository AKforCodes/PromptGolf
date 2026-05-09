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

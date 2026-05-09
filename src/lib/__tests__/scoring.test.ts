import { describe, it, expect } from "vitest"
import { cosine, qualifies, tiebreak } from "../scoring"

describe("cosine", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10)
  })

  it("returns 1 for parallel vectors of different magnitude", () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10)
  })

  it("returns 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBe(0)
  })

  it("returns -1 for anti-parallel vectors", () => {
    expect(cosine([1, 2], [-1, -2])).toBeCloseTo(-1, 10)
  })

  it("throws on length mismatch", () => {
    expect(() => cosine([1, 2], [1, 2, 3])).toThrow(/length mismatch/)
  })
})

describe("qualifies", () => {
  it("returns true when similarity equals threshold", () => {
    expect(qualifies(0.88, 0.88)).toBe(true)
  })

  it("returns true when similarity exceeds threshold", () => {
    expect(qualifies(0.95, 0.88)).toBe(true)
  })

  it("returns false when similarity is below threshold", () => {
    expect(qualifies(0.87, 0.88)).toBe(false)
  })
})

describe("tiebreak", () => {
  const sim = 0.95
  const t = 1000

  it("orders by chars ascending first", () => {
    const ranked = tiebreak([
      { chars: 30, tokens: 8, similarity: sim, submittedAt: t },
      { chars: 10, tokens: 3, similarity: sim, submittedAt: t },
      { chars: 20, tokens: 5, similarity: sim, submittedAt: t },
    ])
    expect(ranked.map((a) => a.chars)).toEqual([10, 20, 30])
  })

  it("breaks chars ties by tokens ascending", () => {
    const ranked = tiebreak([
      { chars: 20, tokens: 7, similarity: sim, submittedAt: t },
      { chars: 20, tokens: 5, similarity: sim, submittedAt: t },
      { chars: 20, tokens: 6, similarity: sim, submittedAt: t },
    ])
    expect(ranked.map((a) => a.tokens)).toEqual([5, 6, 7])
  })

  it("breaks chars+tokens ties by similarity descending (higher wins)", () => {
    const ranked = tiebreak([
      { chars: 20, tokens: 5, similarity: 0.85, submittedAt: t },
      { chars: 20, tokens: 5, similarity: 0.95, submittedAt: t },
      { chars: 20, tokens: 5, similarity: 0.9, submittedAt: t },
    ])
    expect(ranked.map((a) => a.similarity)).toEqual([0.95, 0.9, 0.85])
  })

  it("breaks all-tied by submittedAt ascending (earlier wins)", () => {
    const ranked = tiebreak([
      { chars: 20, tokens: 5, similarity: sim, submittedAt: 3000 },
      { chars: 20, tokens: 5, similarity: sim, submittedAt: 1000 },
      { chars: 20, tokens: 5, similarity: sim, submittedAt: 2000 },
    ])
    expect(ranked.map((a) => a.submittedAt)).toEqual([1000, 2000, 3000])
  })

  it("does not mutate the input array", () => {
    const input = [
      { chars: 30, tokens: 8, similarity: sim, submittedAt: t },
      { chars: 10, tokens: 3, similarity: sim, submittedAt: t },
    ]
    const original = [...input]
    tiebreak(input)
    expect(input).toEqual(original)
  })
})

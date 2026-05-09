import { describe, it, expect } from "vitest"
import {
  cosine,
  qualifies,
  tiebreak,
  awardRoundScores,
  selectFinalAttempts,
} from "../scoring"

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

describe("selectFinalAttempts", () => {
  it("returns the explicit pick when set", () => {
    const finals = selectFinalAttempts(
      [
        { id: "a1", userId: "alice", similarity: 0.95, qualified: true },
        { id: "a2", userId: "alice", similarity: 0.7, qualified: false },
      ],
      { alice: "a2" }
    )
    expect(finals).toHaveLength(1)
    expect(finals[0].id).toBe("a2")
  })

  it("falls back to highest-similarity qualified when no pick", () => {
    const finals = selectFinalAttempts(
      [
        { id: "a1", userId: "alice", similarity: 0.91, qualified: true },
        { id: "a2", userId: "alice", similarity: 0.95, qualified: true },
        { id: "a3", userId: "alice", similarity: 0.99, qualified: false },
      ],
      {}
    )
    expect(finals[0].id).toBe("a2")
  })

  it("falls back to highest-similarity overall when no qualified", () => {
    const finals = selectFinalAttempts(
      [
        { id: "a1", userId: "alice", similarity: 0.5, qualified: false },
        { id: "a2", userId: "alice", similarity: 0.7, qualified: false },
      ],
      {}
    )
    expect(finals[0].id).toBe("a2")
  })

  it("returns one per player across multiple players", () => {
    const finals = selectFinalAttempts(
      [
        { id: "a1", userId: "alice", similarity: 0.95, qualified: true },
        { id: "a2", userId: "alice", similarity: 0.85, qualified: true },
        { id: "b1", userId: "bob", similarity: 0.9, qualified: true },
      ],
      { alice: "a2" }
    )
    expect(finals).toHaveLength(2)
    expect(finals.find((a) => a.userId === "alice")?.id).toBe("a2")
    expect(finals.find((a) => a.userId === "bob")?.id).toBe("b1")
  })

  it("ignores stale pick id (player deleted attempt or wrong id)", () => {
    const finals = selectFinalAttempts(
      [{ id: "a1", userId: "alice", similarity: 0.9, qualified: true }],
      { alice: "non-existent-id" }
    )
    // Falls back to best-qualified (a1) instead of failing
    expect(finals[0].id).toBe("a1")
  })

  it("returns empty when no attempts", () => {
    expect(selectFinalAttempts([], { alice: "a1" })).toEqual([])
  })
})

describe("awardRoundScores", () => {
  it("awards CLIP points (60 × similarity) for one final per player", () => {
    const next = awardRoundScores({}, [
      { userId: "alice", similarity: 0.95, qualified: true },
      { userId: "bob", similarity: 0.9, qualified: true },
    ])
    expect(next).toEqual({ alice: 57, bob: 54 })
  })

  it("DNF (qualified=false) contributes 0 CLIP", () => {
    const next = awardRoundScores({}, [
      { userId: "alice", similarity: 1.0, qualified: true },
      { userId: "bob", similarity: 0.7, qualified: false },
    ])
    expect(next).toEqual({ alice: 60, bob: 0 })
  })

  it("accumulates onto existing scores across rounds", () => {
    const round1 = awardRoundScores({}, [
      { userId: "alice", similarity: 0.9, qualified: true }, // 54
    ])
    const round2 = awardRoundScores(round1, [
      { userId: "alice", similarity: 0.85, qualified: true }, // 51
      { userId: "bob", similarity: 0.92, qualified: true }, // 55
    ])
    expect(round2).toEqual({ alice: 54 + 51, bob: 55 })
  })

  it("does not mutate the input scores", () => {
    const before = { alice: 50 }
    const snapshot = { ...before }
    awardRoundScores(before, [
      { userId: "alice", similarity: 0.95, qualified: true },
    ])
    expect(before).toEqual(snapshot)
  })

  it("adds vote points: spec example (60 CLIP + 4 excellents = 100)", () => {
    const next = awardRoundScores(
      {},
      [{ userId: "alice", similarity: 1.0, qualified: true }],
      [
        { targetId: "alice", value: "excellent" },
        { targetId: "alice", value: "excellent" },
        { targetId: "alice", value: "excellent" },
        { targetId: "alice", value: "excellent" },
      ]
    )
    expect(next).toEqual({ alice: 100 })
  })

  it("vote points scale: bad/ok/good/excellent = 0/3/6/10", () => {
    const next = awardRoundScores({}, [], [
      { targetId: "alice", value: "bad" },
      { targetId: "alice", value: "ok" },
      { targetId: "alice", value: "good" },
      { targetId: "alice", value: "excellent" },
    ])
    expect(next).toEqual({ alice: 0 + 3 + 6 + 10 })
  })

  it("DNF players still receive vote points (carousel rule)", () => {
    const next = awardRoundScores(
      {},
      [{ userId: "bob", similarity: 0.5, qualified: false }],
      [
        { targetId: "bob", value: "excellent" },
        { targetId: "bob", value: "good" },
      ]
    )
    // 0 CLIP (DNF) + 10 + 6 = 16
    expect(next).toEqual({ bob: 16 })
  })

  it("votes default to empty when omitted", () => {
    const next = awardRoundScores({}, [
      { userId: "alice", similarity: 0.9, qualified: true },
    ])
    expect(next).toEqual({ alice: 54 })
  })
})

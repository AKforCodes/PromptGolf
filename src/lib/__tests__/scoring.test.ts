import { describe, it, expect } from "vitest"
import {
  tiebreak,
  awardRoundScores,
  findTopTiedPlayers,
  selectFinalAttempts,
} from "../scoring"

describe("tiebreak", () => {
  const sim = 0
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
        { id: "a1", userId: "alice", submittedAt: 1000 },
        { id: "a2", userId: "alice", submittedAt: 2000 },
      ],
      { alice: "a1" }
    )
    expect(finals).toHaveLength(1)
    expect(finals[0].id).toBe("a1")
  })

  it("falls back to last-submitted when no pick", () => {
    const finals = selectFinalAttempts(
      [
        { id: "a1", userId: "alice", submittedAt: 1000 },
        { id: "a2", userId: "alice", submittedAt: 3000 },
        { id: "a3", userId: "alice", submittedAt: 2000 },
      ],
      {}
    )
    expect(finals[0].id).toBe("a2")
  })

  it("returns one per player across multiple players", () => {
    const finals = selectFinalAttempts(
      [
        { id: "a1", userId: "alice", submittedAt: 1000 },
        { id: "a2", userId: "alice", submittedAt: 2000 },
        { id: "b1", userId: "bob", submittedAt: 1500 },
      ],
      { alice: "a1" }
    )
    expect(finals).toHaveLength(2)
    expect(finals.find((a) => a.userId === "alice")?.id).toBe("a1")
    expect(finals.find((a) => a.userId === "bob")?.id).toBe("b1")
  })

  it("ignores stale pick id (falls back to last-submitted)", () => {
    const finals = selectFinalAttempts(
      [
        { id: "a1", userId: "alice", submittedAt: 1000 },
        { id: "a2", userId: "alice", submittedAt: 2000 },
      ],
      { alice: "non-existent-id" }
    )
    expect(finals[0].id).toBe("a2")
  })

  it("returns empty when no attempts", () => {
    expect(selectFinalAttempts([], { alice: "a1" })).toEqual([])
  })
})

describe("awardRoundScores", () => {
  it("awards 10 points per vote received", () => {
    const next = awardRoundScores(
      {},
      [],
      [
        { targetId: "alice" },
        { targetId: "alice" },
        { targetId: "alice" },
      ]
    )
    expect(next).toEqual({ alice: 30 })
  })

  it("counts votes for multiple targets independently", () => {
    const next = awardRoundScores({}, [], [
      { targetId: "alice" },
      { targetId: "alice" },
      { targetId: "bob" },
    ])
    expect(next).toEqual({ alice: 20, bob: 10 })
  })

  it("accumulates onto existing scores across rounds", () => {
    const round1 = awardRoundScores({}, [], [
      { targetId: "alice" },
      { targetId: "alice" },
    ])
    const round2 = awardRoundScores(round1, [], [
      { targetId: "alice" },
      { targetId: "bob" },
      { targetId: "bob" },
    ])
    expect(round2).toEqual({ alice: 30, bob: 20 })
  })

  it("does not mutate the input scores", () => {
    const before = { alice: 50 }
    const snapshot = { ...before }
    awardRoundScores(before, [], [{ targetId: "alice" }])
    expect(before).toEqual(snapshot)
  })

  it("votes default to empty when omitted", () => {
    const next = awardRoundScores({ alice: 20 }, [])
    expect(next).toEqual({ alice: 20 })
  })

  it("ignores finalAttempts (vestigial — kept in signature for forward-compat)", () => {
    const next = awardRoundScores(
      {},
      [{ userId: "alice" }, { userId: "bob" }],
      [{ targetId: "alice" }]
    )
    expect(next).toEqual({ alice: 10 })
    expect(next.bob).toBeUndefined()
  })
})

describe("findTopTiedPlayers", () => {
  it("returns the single leader when there is no tie", () => {
    const tied = findTopTiedPlayers(
      { alice: 30, bob: 20, carol: 10 },
      ["alice", "bob", "carol"]
    )
    expect(tied).toEqual(["alice"])
  })

  it("returns all players tied for the top score", () => {
    const tied = findTopTiedPlayers(
      { alice: 30, bob: 30, carol: 10 },
      ["alice", "bob", "carol"]
    )
    expect(tied.sort()).toEqual(["alice", "bob"])
  })

  it("ignores players outside the eligible set", () => {
    const tied = findTopTiedPlayers(
      { alice: 30, bob: 30, carol: 50 },
      ["alice", "bob"]
    )
    expect(tied.sort()).toEqual(["alice", "bob"])
  })

  it("returns [] when nobody scored", () => {
    expect(findTopTiedPlayers({}, ["alice", "bob"])).toEqual([])
    expect(
      findTopTiedPlayers({ alice: 0, bob: 0 }, ["alice", "bob"])
    ).toEqual([])
  })

  it("returns [] when eligible is empty", () => {
    expect(findTopTiedPlayers({ alice: 30 }, [])).toEqual([])
  })

  it("treats missing scores as 0", () => {
    const tied = findTopTiedPlayers({ alice: 10 }, ["alice", "bob"])
    expect(tied).toEqual(["alice"])
  })
})

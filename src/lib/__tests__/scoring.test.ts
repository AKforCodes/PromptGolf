import { describe, it, expect } from "vitest"
import {
  tiebreak,
  awardRoundScores,
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



// ─────────────────────────────────────────────────────────────────────
// Ruthless scoring tests — these probe permissive helpers that lack
// internal validation. Server-side gating typically catches these,
// but the helpers themselves don't.
// ─────────────────────────────────────────────────────────────────────

describe("scoring.ts — ruthless edge cases", () => {
  it("BUG: awardRoundScores accepts votes targeting userIds NOT in the room", () => {
    // The helper trusts its inputs. If the server forgets to gate target ∈
    // room.players, the helper will happily award points to a stranger.
    const next = awardRoundScores({}, [], [
      { targetId: "ghost-from-mars" },
      { targetId: "another-stranger" },
    ])
    expect(next).toEqual({ "ghost-from-mars": 10, "another-stranger": 10 })
  })

  it("BUG: awardRoundScores does not deduplicate votes from the same voter", () => {
    // Vote schema includes voterId but awardRoundScores ignores it. A bug
    // in the vote endpoint that produces two votes from one voter would
    // double-count silently here.
    const next = awardRoundScores({}, [], [
      { targetId: "alice" },
      { targetId: "alice" }, // hypothetically same voter — helper can't tell
    ])
    expect(next).toEqual({ alice: 20 })
  })

  it("BUG: awardRoundScores accepts negative-result vote arrays via duck typing", () => {
    // Helper signature is `<V extends ScorableVote>` — only `targetId` is
    // required. Extra fields are ignored. A future refactor that adds a
    // `weight` or `multiplier` field would not be honoured by this helper.
    const next = awardRoundScores({}, [], [
      { targetId: "alice", weight: -100 } as { targetId: string; weight: number },
    ])
    expect(next).toEqual({ alice: 10 }) // weight ignored
  })



  it("BUG: tiebreak ranking uses similarity (vestigial, always 0) — could mis-sort if it ever returns", () => {
    // The sort comparator references similarity. If CLIP scoring is ever
    // re-introduced and similarity becomes non-zero, ties on chars+tokens
    // will sort by similarity DESC, which may or may not be intended.
    // Currently safe (similarity always 0) but a footgun.
    const sorted = tiebreak([
      { chars: 50, tokens: 10, similarity: 0.3, submittedAt: 100 },
      { chars: 50, tokens: 10, similarity: 0.9, submittedAt: 200 }, // higher sim wins
      { chars: 50, tokens: 10, similarity: 0.6, submittedAt: 50 },
    ])
    expect(sorted.map((a) => a.similarity)).toEqual([0.9, 0.6, 0.3])
  })

  it("BUG: selectFinalAttempts picks the LATEST submitted, not the highest-quality, when there's no explicit pick", () => {
    // If a player rage-submits a bad final attempt right at the buzzer, the
    // server uses that one (latest submittedAt) — not their best earlier
    // attempt. Documented in the helper but worth a regression pin.
    const finals = selectFinalAttempts(
      [
        { id: "good", userId: "alice", submittedAt: 100 },
        { id: "bad-rage-submit", userId: "alice", submittedAt: 200 },
      ],
      {} // no pick
    )
    expect(finals[0].id).toBe("bad-rage-submit")
  })

  it("BUG: selectFinalAttempts treats `picks[userId]` pointing to another player's attempt as 'no explicit pick'", () => {
    // If somehow the picks map has user → wrong-attempt-id, the helper falls
    // back silently to last-submitted. No error, no warning. A bug in the
    // pick endpoint that miswrote the map would be invisible here.
    const finals = selectFinalAttempts(
      [
        { id: "alice-1", userId: "alice", submittedAt: 100 },
        { id: "bob-1", userId: "bob", submittedAt: 100 },
      ],
      { alice: "bob-1" } // alice "picked" bob's attempt
    )
    // alice falls through to her last-submitted, which is alice-1
    expect(finals.find((a) => a.userId === "alice")?.id).toBe("alice-1")
  })

  it("BUG: awardRoundScores allows the same target to be voted on by themselves via raw input", () => {
    // The vote endpoint rejects voter === target, but if you call the helper
    // directly with a self-vote it counts. Tests that the helper has no
    // internal sanity check.
    const next = awardRoundScores({ alice: 30 }, [], [
      { targetId: "alice" }, // imagine the voter was also alice
    ])
    expect(next).toEqual({ alice: 40 })
  })



  it("CONFIRMS-CURRENT: float scores are preserved (no rounding in helper)", () => {
    // POINTS_PER_VOTE is integer 10 so this is moot today, but if anyone
    // changes it to a non-integer multiplier (e.g. similarity-weighted),
    // this surfaces.
    const next = awardRoundScores({ alice: 0.1 }, [], [{ targetId: "alice" }])
    expect(next.alice).toBe(10.1)
  })
})

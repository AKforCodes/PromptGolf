import { describe, it, expect } from "vitest"
import type { Player, RoomState } from "@/lib/types"
import { MIN_PLAYERS } from "@/lib/room-constants"

function deriveLobbyGates(
  players: Player[],
  hostId: string,
  userId: string,
) {
  const myRole = players.find((p) => p.userId === userId)?.role ?? null
  const isHost = userId === hostId
  const isSpectator = myRole === "spectator"
  const nonHostPrompters = players.filter(
    (p) => p.userId !== hostId && p.role === "prompter",
  )
  const allReady =
    nonHostPrompters.length > 0 &&
    nonHostPrompters.every((p) => p.ready)
  const canStart = isHost && allReady && players.length >= MIN_PLAYERS
  const canReady = !isHost && !isSpectator
  return { myRole, isHost, isSpectator, nonHostPrompters, allReady, canStart, canReady }
}

describe("lobby role gating", () => {
  const host: Player = {
    userId: "host-1",
    name: "Host",
    avatarSeed: "s1",
    role: "prompter",
    ready: false,
    joinedAt: 1000,
    connected: true,
    lastSeenAt: 1000,
  }
  const prompter: Player = {
    userId: "prompter-1",
    name: "P1",
    avatarSeed: "s2",
    role: "prompter",
    ready: true,
    joinedAt: 2000,
    connected: true,
    lastSeenAt: 2000,
  }
  const spectator: Player = {
    userId: "spec-1",
    name: "S1",
    avatarSeed: "s3",
    role: "spectator",
    ready: false,
    joinedAt: 3000,
    connected: true,
    lastSeenAt: 3000,
  }

  it("spectator cannot ready", () => {
    const gates = deriveLobbyGates(
      [host, prompter, spectator],
      "host-1",
      "spec-1",
    )
    expect(gates.isHost).toBe(false)
    expect(gates.isSpectator).toBe(true)
    expect(gates.canReady).toBe(false)
  })

  it("prompter can ready", () => {
    const gates = deriveLobbyGates(
      [host, prompter, spectator],
      "host-1",
      "prompter-1",
    )
    expect(gates.isHost).toBe(false)
    expect(gates.isSpectator).toBe(false)
    expect(gates.canReady).toBe(true)
  })

  it("nonHostPrompters excludes host and spectators", () => {
    const gates = deriveLobbyGates(
      [host, prompter, spectator],
      "host-1",
      "prompter-1",
    )
    expect(gates.nonHostPrompters).toHaveLength(1)
    expect(gates.nonHostPrompters[0].userId).toBe("prompter-1")
  })

  it("allReady is true when all prompters are ready (spectators ignored)", () => {
    const readyPrompter: Player = { ...prompter, ready: true }
    const gates = deriveLobbyGates(
      [host, readyPrompter, spectator],
      "host-1",
      "host-1",
    )
    expect(gates.allReady).toBe(true)
    expect(gates.canStart).toBe(true)
  })

  it("allReady is false when unready prompter exists", () => {
    const unreadyPrompter: Player = { ...prompter, ready: false }
    const gates = deriveLobbyGates(
      [host, unreadyPrompter, spectator],
      "host-1",
      "host-1",
    )
    expect(gates.allReady).toBe(false)
    expect(gates.canStart).toBe(false)
  })

  it("allReady is false when no prompters in room", () => {
    const gates = deriveLobbyGates(
      [host, spectator],
      "host-1",
      "host-1",
    )
    expect(gates.allReady).toBe(false)
    expect(gates.canStart).toBe(false)
  })
})

function computeRanks(scores: Record<string, number>, players: Player[]) {
  const rows = players
    .map((p) => ({
      userId: p.userId,
      name: p.name,
      score: scores[p.userId] ?? 0,
    }))
    .sort((a, b) => b.score - a.score)

  let prevRank = 0
  let prevScore: number | undefined
  return rows.map((r, i) => {
    const rank =
      prevScore !== undefined && r.score === prevScore ? prevRank : i + 1
    prevScore = r.score
    prevRank = rank
    return { ...r, rank }
  })
}

describe("ScoreList competition ranking", () => {
  const alice: Player = {
    userId: "a",
    name: "Alice",
    avatarSeed: "s1",
    role: "prompter",
    ready: true,
    joinedAt: 1000,
    connected: true,
    lastSeenAt: 1000,
  }
  const bob: Player = {
    userId: "b",
    name: "Bob",
    avatarSeed: "s2",
    role: "prompter",
    ready: true,
    joinedAt: 2000,
    connected: true,
    lastSeenAt: 2000,
  }
  const carol: Player = {
    userId: "c",
    name: "Carol",
    avatarSeed: "s3",
    role: "prompter",
    ready: true,
    joinedAt: 3000,
    connected: true,
    lastSeenAt: 3000,
  }
  const dave: Player = {
    userId: "d",
    name: "Dave",
    avatarSeed: "s4",
    role: "prompter",
    ready: true,
    joinedAt: 4000,
    connected: true,
    lastSeenAt: 4000,
  }

  it("all different scores: ranks 1,2,3,4", () => {
    const ranks = computeRanks({ a: 40, b: 30, c: 20, d: 10 }, [alice, bob, carol, dave])
    expect(ranks.map((r) => ({ name: r.name, rank: r.rank, score: r.score }))).toEqual([
      { name: "Alice", rank: 1, score: 40 },
      { name: "Bob", rank: 2, score: 30 },
      { name: "Carol", rank: 3, score: 20 },
      { name: "Dave", rank: 4, score: 10 },
    ])
  })

  it("two tied at top: ranks 1,1,3 (competition ranking)", () => {
    const ranks = computeRanks({ a: 30, b: 30, c: 0 }, [alice, bob, carol])
    expect(ranks.map((r) => ({ name: r.name, rank: r.rank, score: r.score }))).toEqual([
      { name: "Alice", rank: 1, score: 30 },
      { name: "Bob", rank: 1, score: 30 },
      { name: "Carol", rank: 3, score: 0 },
    ])
  })

  it("three-way tie at top: ranks 1,1,1,4", () => {
    const ranks = computeRanks({ a: 25, b: 25, c: 25, d: 10 }, [alice, bob, carol, dave])
    expect(ranks.map((r) => ({ name: r.name, rank: r.rank, score: r.score }))).toEqual([
      { name: "Alice", rank: 1, score: 25 },
      { name: "Bob", rank: 1, score: 25 },
      { name: "Carol", rank: 1, score: 25 },
      { name: "Dave", rank: 4, score: 10 },
    ])
  })

  it("tie in middle: ranks 1,2,2,4", () => {
    const ranks = computeRanks({ a: 40, b: 30, c: 30, d: 10 }, [alice, bob, carol, dave])
    expect(ranks.map((r) => ({ name: r.name, rank: r.rank, score: r.score }))).toEqual([
      { name: "Alice", rank: 1, score: 40 },
      { name: "Bob", rank: 2, score: 30 },
      { name: "Carol", rank: 2, score: 30 },
      { name: "Dave", rank: 4, score: 10 },
    ])
  })

  it("all same score: all rank 1", () => {
    const ranks = computeRanks({ a: 10, b: 10, c: 10 }, [alice, bob, carol])
    expect(ranks.map((r) => ({ name: r.name, rank: r.rank, score: r.score }))).toEqual([
      { name: "Alice", rank: 1, score: 10 },
      { name: "Bob", rank: 1, score: 10 },
      { name: "Carol", rank: 1, score: 10 },
    ])
  })

  it("single player: rank 1", () => {
    const ranks = computeRanks({ a: 99 }, [alice])
    expect(ranks).toEqual([{ userId: "a", name: "Alice", score: 99, rank: 1 }])
  })

  it("empty scores: all treat as 0, all rank 1", () => {
    const ranks = computeRanks({}, [alice, bob])
    expect(ranks.map((r) => ({ name: r.name, rank: r.rank, score: r.score }))).toEqual([
      { name: "Alice", rank: 1, score: 0 },
      { name: "Bob", rank: 1, score: 0 },
    ])
  })
})

import { describe, it, expect } from "vitest"
import type { Player, RoomState } from "@/lib/types"

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
  const canStart = isHost && allReady && players.length >= 3
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

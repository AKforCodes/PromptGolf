import { describe, it, expect, vi, beforeEach } from "vitest"
import type { RoomSettings, Player } from "../types"

const mockGet = vi.fn()
const mockSet = vi.fn()

vi.mock("../redis", () => ({
  redis: { get: mockGet, set: mockSet },
}))

const mockSettings: RoomSettings = {
  gameMode: "showdown",
  rounds: 3,
  maxPlayers: 8,
  timer: 60,
  memorizeTime: 10,
  promptMaxLength: 200,
  attemptsPerRound: 3,
  category: "animals",
  difficulty: "normal",
}

const host: Player = {
  userId: "host-1",
  name: "Alice",
  avatarSeed: "seed-a",
  role: "prompter",
  ready: false,
  joinedAt: 1000,
  connected: true,
  lastSeenAt: 1000,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createRoom", () => {
  it("creates a room with host as first player and prompter role", async () => {
    const { createRoom } = await import("../rooms")

    const room = await createRoom(mockSettings, host)

    expect(room.code).toHaveLength(4)
    expect(room.hostId).toBe("host-1")
    expect(room.settings).toEqual(mockSettings)
    expect(room.players).toHaveLength(1)
    expect(room.players[0].userId).toBe("host-1")
    expect(room.players[0].role).toBe("prompter")
    expect(room.status).toBe("lobby")
    expect(room.currentRound).toBe(0)
    expect(room.targetId).toBeNull()
    expect(room.seed).toBeNull()
    expect(room.createdAt).toBeGreaterThan(0)
    expect(mockSet).toHaveBeenCalledOnce()
  })

  it("generates unique codes for each room", async () => {
    const { createRoom } = await import("../rooms")

    const room1 = await createRoom(mockSettings, host)
    const room2 = await createRoom(mockSettings, host)

    expect(room1.code).not.toBe(room2.code)
  })

  it("code uses only allowed characters (no 0/O/1/I)", async () => {
    const { createRoom } = await import("../rooms")

    const room = await createRoom(mockSettings, host)

    expect(room.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/)
  })
})

describe("getRoom", () => {
  it("returns null for non-existent room", async () => {
    const { getRoom } = await import("../rooms")
    mockGet.mockResolvedValue(null)

    const result = await getRoom("NONEXIST")
    expect(result).toBeNull()
  })

  it("returns room state when found", async () => {
    const { createRoom, getRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    mockGet.mockResolvedValue(room)

    const result = await getRoom(room.code)
    expect(result).toEqual(room)
  })
})

describe("joinRoom", () => {
  it("assigns prompter role when under maxPlayers", async () => {
    const { createRoom, joinRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)

    const player2: Player = {
      userId: "user-2",
      name: "Bob",
      avatarSeed: "seed-b",
      role: "spectator",
      ready: false,
      joinedAt: 2000,
      connected: true,
      lastSeenAt: 2000,
    }

    const { room: updated, role } = await joinRoom(room, player2)

    expect(role).toBe("prompter")
    expect(updated.players).toHaveLength(2)
    expect(updated.players[1].role).toBe("prompter")
  })

  it("assigns spectator role when at maxPlayers", async () => {
    const tightSettings: RoomSettings = { ...mockSettings, maxPlayers: 1 }
    const { createRoom, joinRoom } = await import("../rooms")
    const room = await createRoom(tightSettings, host)

    const player2: Player = {
      userId: "user-2",
      name: "Bob",
      avatarSeed: "seed-b",
      role: "spectator",
      ready: false,
      joinedAt: 2000,
      connected: true,
      lastSeenAt: 2000,
    }

    const { room: updated, role } = await joinRoom(room, player2)

    expect(role).toBe("spectator")
    expect(updated.players[1].role).toBe("spectator")
  })

  it("does not duplicate existing players", async () => {
    const { createRoom, joinRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)

    const { room: updated } = await joinRoom(room, host)

    expect(updated.players).toHaveLength(1)
  })

  it("returns correct role for re-joining player", async () => {
    const { createRoom, joinRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)

    const { role } = await joinRoom(room, host)

    expect(role).toBe("prompter")
  })
})

describe("leaveRoom", () => {
  it("removes the player from the room", async () => {
    const { createRoom, joinRoom, leaveRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)

    const player2: Player = {
      userId: "user-2",
      name: "Bob",
      avatarSeed: "seed-b",
      role: "spectator",
      ready: false,
      joinedAt: 2000,
      connected: true,
      lastSeenAt: 2000,
    }
    const { room: withBob } = await joinRoom(room, player2)
    const updated = await leaveRoom(withBob, "user-2")

    expect(updated.players).toHaveLength(1)
    expect(updated.players[0].userId).toBe("host-1")
  })

  it("promotes next player to host when host leaves", async () => {
    const { createRoom, joinRoom, leaveRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)

    const player2: Player = {
      userId: "user-2",
      name: "Bob",
      avatarSeed: "seed-b",
      role: "spectator",
      ready: false,
      joinedAt: 2000,
      connected: true,
      lastSeenAt: 2000,
    }
    const { room: withBob } = await joinRoom(room, player2)
    const updated = await leaveRoom(withBob, "host-1")

    expect(updated.hostId).toBe("user-2")
  })

  it("does not crash when last player leaves", async () => {
    const { createRoom, leaveRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    const updated = await leaveRoom(room, "host-1")

    expect(updated.players).toHaveLength(0)
    expect(updated.hostId).toBe("host-1")
  })
})

describe("isUserInRoom", () => {
  it("returns true for a player in the room", async () => {
    const { createRoom, isUserInRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)

    expect(await isUserInRoom(room, "host-1")).toBe(true)
  })

  it("returns false for a player not in the room", async () => {
    const { createRoom, isUserInRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)

    expect(await isUserInRoom(room, "stranger")).toBe(false)
  })
})

describe("setPlayerReady", () => {
  const guest: Player = {
    userId: "user-2",
    name: "Bob",
    avatarSeed: "seed-b",
    role: "spectator",
    ready: false,
    joinedAt: 2000,
    connected: true,
    lastSeenAt: 2000,
  }

  it("sets ready to true for an existing player", async () => {
    const { createRoom, joinRoom, setPlayerReady } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    const { room: withGuest } = await joinRoom(room, { ...guest })

    const { room: updated, player } = await setPlayerReady(
      withGuest,
      "user-2",
      true
    )

    expect(player).not.toBeNull()
    expect(player?.userId).toBe("user-2")
    expect(player?.ready).toBe(true)
    expect(
      updated.players.find((p) => p.userId === "user-2")?.ready
    ).toBe(true)
  })

  it("sets ready to false (unready)", async () => {
    const { createRoom, joinRoom, setPlayerReady } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    const { room: withGuest } = await joinRoom(room, {
      ...guest,
      ready: true,
    })

    const { player } = await setPlayerReady(withGuest, "user-2", false)

    expect(player?.ready).toBe(false)
  })

  it("supports toggling: false → true → false", async () => {
    const { createRoom, joinRoom, setPlayerReady } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    const { room: withGuest } = await joinRoom(room, { ...guest })

    const a = await setPlayerReady(withGuest, "user-2", true)
    expect(a.player?.ready).toBe(true)

    const b = await setPlayerReady(a.room, "user-2", false)
    expect(b.player?.ready).toBe(false)

    const c = await setPlayerReady(b.room, "user-2", true)
    expect(c.player?.ready).toBe(true)
  })

  it("returns player: null when user is not in the room", async () => {
    const { createRoom, setPlayerReady } = await import("../rooms")
    const room = await createRoom(mockSettings, host)

    const { player, room: same } = await setPlayerReady(
      room,
      "stranger",
      true
    )

    expect(player).toBeNull()
    expect(same).toBe(room)
  })

  it("does not write to redis when user is not in the room", async () => {
    const { createRoom, setPlayerReady } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    mockSet.mockClear()

    await setPlayerReady(room, "stranger", true)

    expect(mockSet).not.toHaveBeenCalled()
  })

  it("persists the change to redis when successful", async () => {
    const { createRoom, setPlayerReady } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    mockSet.mockClear()

    await setPlayerReady(room, "host-1", true)

    expect(mockSet).toHaveBeenCalledOnce()
  })

  it("does not affect other players' ready state", async () => {
    const { createRoom, joinRoom, setPlayerReady } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    const { room: withGuest } = await joinRoom(room, {
      ...guest,
      ready: true,
    })

    await setPlayerReady(withGuest, "host-1", true)

    expect(
      withGuest.players.find((p) => p.userId === "user-2")?.ready
    ).toBe(true)
  })

  it("does not change the players list length", async () => {
    const { createRoom, joinRoom, setPlayerReady } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    const { room: withGuest } = await joinRoom(room, { ...guest })
    const before = withGuest.players.length

    const { room: after } = await setPlayerReady(withGuest, "user-2", true)

    expect(after.players).toHaveLength(before)
  })

  it("does not change unrelated room fields", async () => {
    const { createRoom, setPlayerReady } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    const snapshot = {
      code: room.code,
      hostId: room.hostId,
      status: room.status,
      currentRound: room.currentRound,
      settings: room.settings,
    }

    const { room: after } = await setPlayerReady(room, "host-1", true)

    expect(after.code).toBe(snapshot.code)
    expect(after.hostId).toBe(snapshot.hostId)
    expect(after.status).toBe(snapshot.status)
    expect(after.currentRound).toBe(snapshot.currentRound)
    expect(after.settings).toEqual(snapshot.settings)
  })

  it("is idempotent — setting ready to the same value twice produces the same state", async () => {
    const { createRoom, setPlayerReady } = await import("../rooms")
    const room = await createRoom(mockSettings, host)

    const a = await setPlayerReady(room, "host-1", true)
    const b = await setPlayerReady(a.room, "host-1", true)

    expect(a.player?.ready).toBe(true)
    expect(b.player?.ready).toBe(true)
  })
})

describe("nonHostPrompters / allReady with role filtering", () => {
  const tightSettings: RoomSettings = { ...mockSettings, maxPlayers: 2 }

  const prompter: Player = {
    userId: "prompter-1",
    name: "P1",
    avatarSeed: "s1",
    role: "prompter",
    ready: true,
    joinedAt: 2000,
    connected: true,
    lastSeenAt: 2000,
  }

  const spectator: Player = {
    userId: "spec-1",
    name: "S1",
    avatarSeed: "s2",
    role: "spectator",
    ready: false,
    joinedAt: 3000,
    connected: true,
    lastSeenAt: 3000,
  }

  const max1Settings: RoomSettings = { ...mockSettings, maxPlayers: 1 }

  function getNonHostPrompters(
    players: Player[],
    hostId: string,
  ): Player[] {
    return players.filter(
      (p) => p.userId !== hostId && p.role === "prompter",
    )
  }

  function getAllReady(players: Player[], hostId: string): boolean {
    const prompters = players.filter(
      (p) => p.userId !== hostId && p.role === "prompter",
    )
    return prompters.length > 0 && prompters.every((p) => p.ready)
  }

  it("nonHostPrompters excludes spectators", async () => {
    const { createRoom, joinRoom } = await import("../rooms")
    const room = await createRoom(tightSettings, host)
    const { room: withPrompter } = await joinRoom(room, { ...prompter })
    const { room: full } = await joinRoom(withPrompter, { ...spectator })

    const nhp = getNonHostPrompters(full.players, full.hostId)
    expect(nhp).toHaveLength(1)
    expect(nhp[0].userId).toBe("prompter-1")
  })

  it("allReady excludes spectators — ready prompter + unready spec = ready", async () => {
    const { createRoom, joinRoom, setPlayerReady } = await import("../rooms")
    const room = await createRoom(tightSettings, host)
    const { room: withPrompter } = await joinRoom(room, { ...prompter })
    const { room: full } = await joinRoom(withPrompter, { ...spectator })
    const { room: after } = await setPlayerReady(full, "prompter-1", true)

    expect(getAllReady(after.players, after.hostId)).toBe(true)
  })

  it("allReady is false when no prompters present (only spectators)", async () => {
    const { createRoom, joinRoom } = await import("../rooms")
    const room = await createRoom(max1Settings, host)
    const { room: full } = await joinRoom(room, { ...spectator })

    expect(getAllReady(full.players, full.hostId)).toBe(false)
  })
})

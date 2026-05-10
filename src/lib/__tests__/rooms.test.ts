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

  it("can flip a spectator's ready flag (helper does not gate by role)", async () => {
    // Note: the route handler should reject spectator ready toggles, but the
    // helper is intentionally role-agnostic so server logic stays explicit.
    const { createRoom, joinRoom, setPlayerReady } = await import("../rooms")
    const tight: RoomSettings = { ...mockSettings, maxPlayers: 3 }
    const room = await createRoom(tight, host)

    // Fill prompter slots: host already has 1, add 2 more prompters.
    await joinRoom(room, {
      ...guest,
      userId: "p2",
      name: "Pat",
    })
    await joinRoom(room, {
      ...guest,
      userId: "p3",
      name: "Pip",
    })
    // Now spectator slot.
    const { room: full } = await joinRoom(room, {
      ...guest,
      userId: "spec",
      name: "Sue",
    })
    const specPlayer = full.players.find((p) => p.userId === "spec")
    expect(specPlayer?.role).toBe("spectator")

    const { player } = await setPlayerReady(full, "spec", true)
    expect(player?.ready).toBe(true)
  })
})

describe("createRoom — defaults", () => {
  it("uses a 4-character code with no ambiguous glyphs", async () => {
    const { createRoom } = await import("../rooms")
    const allowed = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/
    // Generate a batch and verify every code matches the alphabet.
    const codes = await Promise.all(
      Array.from({ length: 50 }, () => createRoom(mockSettings, host))
    )
    for (const room of codes) {
      expect(room.code).toMatch(allowed)
    }
  })

  it("initialises status to lobby and round to 0", async () => {
    const { createRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    expect(room.status).toBe("lobby")
    expect(room.currentRound).toBe(0)
    expect(room.scores).toEqual({})
    expect(room.picks).toEqual({})
  })
})

describe("joinRoom — capacity & roles", () => {
  it("makes the third arrival a spectator when maxPlayers=2 (host counts toward cap)", async () => {
    // maxPlayers gates the prompter-role count. With a cap of 2, host (1) +
    // first guest (2) fill the prompter slots; the next arrival spectates.
    const tight: RoomSettings = { ...mockSettings, maxPlayers: 2 }
    const { createRoom, joinRoom } = await import("../rooms")
    const room = await createRoom(tight, host)

    const g1: Player = {
      userId: "u-1",
      name: "G1",
      avatarSeed: "s-1",
      role: "spectator",
      ready: false,
      joinedAt: 100,
      connected: true,
      lastSeenAt: 100,
    }
    const { room: r1, role: role1 } = await joinRoom(room, g1)
    expect(role1).toBe("prompter")

    const g2: Player = { ...g1, userId: "u-2", name: "G2" }
    const { room: r2, role: role2 } = await joinRoom(r1, g2)
    expect(role2).toBe("spectator")
    expect(r2.players).toHaveLength(3)
  })

  it("ignores the role on the incoming player object — server decides", async () => {
    const { createRoom, joinRoom } = await import("../rooms")
    const tight: RoomSettings = { ...mockSettings, maxPlayers: 1 }
    const room = await createRoom(tight, host)

    // Caller asks to be prompter; server sees room is full and assigns spectator.
    const want: Player = {
      userId: "u-1",
      name: "Sneaky",
      avatarSeed: "x",
      role: "prompter",
      ready: false,
      joinedAt: 100,
      connected: true,
      lastSeenAt: 100,
    }
    const { role } = await joinRoom(room, want)
    expect(role).toBe("spectator")
  })
})

describe("leaveRoom — host promotion order", () => {
  it("promotes the next player in join order when host leaves", async () => {
    const { createRoom, joinRoom, leaveRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    const a: Player = {
      userId: "a", name: "A", avatarSeed: "x", role: "spectator",
      ready: false, joinedAt: 100, connected: true, lastSeenAt: 100,
    }
    const b: Player = { ...a, userId: "b", name: "B", joinedAt: 200 }
    const { room: r1 } = await joinRoom(room, a)
    const { room: r2 } = await joinRoom(r1, b)
    const updated = await leaveRoom(r2, "host-1")
    expect(updated.hostId).toBe("a") // first non-host promoted, not last
    expect(updated.players[0].userId).toBe("a")
  })

  it("non-host leaving doesn't change hostId", async () => {
    const { createRoom, joinRoom, leaveRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    const a: Player = {
      userId: "a", name: "A", avatarSeed: "x", role: "spectator",
      ready: false, joinedAt: 100, connected: true, lastSeenAt: 100,
    }
    const { room: r1 } = await joinRoom(room, a)
    const updated = await leaveRoom(r1, "a")
    expect(updated.hostId).toBe("host-1")
  })

  it("idempotent on missing user", async () => {
    const { createRoom, leaveRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    const updated = await leaveRoom(room, "ghost")
    expect(updated.players).toHaveLength(1)
    expect(updated.players[0].userId).toBe("host-1")
  })
})

describe("spectating with multiple users", () => {
  function buildPlayer(idx: number, role: "prompter" | "spectator" = "spectator"): Player {
    return {
      userId: `u-${idx}`,
      name: `P${idx}`,
      avatarSeed: `s-${idx}`,
      role,
      ready: false,
      joinedAt: 1000 + idx,
      connected: true,
      lastSeenAt: 1000 + idx,
    }
  }

  it("queues multiple spectators after capacity is reached", async () => {
    // maxPlayers=3 → host + 2 prompter slots. Players 4–6 become spectators.
    const tight: RoomSettings = { ...mockSettings, maxPlayers: 3 }
    const { createRoom, joinRoom } = await import("../rooms")
    let room = await createRoom(tight, host)
    const roles: string[] = []

    for (let i = 1; i <= 5; i++) {
      const { room: next, role } = await joinRoom(room, buildPlayer(i))
      roles.push(role)
      room = next
    }

    expect(roles).toEqual([
      "prompter", // u-1 fills slot 2
      "prompter", // u-2 fills slot 3
      "spectator", // u-3 capacity hit
      "spectator",
      "spectator",
    ])
    expect(room.players).toHaveLength(6)
  })

  it("spectator promotion: when host leaves and only spectators remain, the first spectator becomes host", async () => {
    const tight: RoomSettings = { ...mockSettings, maxPlayers: 1 }
    const { createRoom, joinRoom, leaveRoom } = await import("../rooms")
    let room = await createRoom(tight, host)
    // All subsequent joiners are spectators.
    const { room: r1 } = await joinRoom(room, buildPlayer(1))
    const { room: r2 } = await joinRoom(r1, buildPlayer(2))
    const { room: r3 } = await joinRoom(r2, buildPlayer(3))

    const spectators = r3.players.filter((p) => p.role === "spectator")
    expect(spectators).toHaveLength(3)

    const updated = await leaveRoom(r3, "host-1")
    // First non-host player is u-1 (joined first), so they're promoted even
    // though their role is spectator — this is the documented behaviour and
    // server should also flip their role to prompter on promotion (TODO).
    expect(updated.hostId).toBe("u-1")
  })

  it("a spectator joining after a vacancy still gets spectator role (state is sticky until rejoin)", async () => {
    // maxPlayers=2 → host + 1 prompter slot. Third player spectates.
    const tight: RoomSettings = { ...mockSettings, maxPlayers: 2 }
    const { createRoom, joinRoom } = await import("../rooms")
    let room = await createRoom(tight, host)
    const { room: r1 } = await joinRoom(room, buildPlayer(1)) // prompter
    const { room: r2 } = await joinRoom(r1, buildPlayer(2)) // spectator

    const spec = r2.players.find((p) => p.userId === "u-2")
    expect(spec?.role).toBe("spectator")

    // u-1 rejoining (already in players) returns existing role.
    const { room: r3, role } = await joinRoom(r2, buildPlayer(1))
    expect(role).toBe("prompter")
    expect(r3.players).toHaveLength(3) // no duplicate
  })

  it("counts spectators in players array but not toward prompter cap", async () => {
    const tight: RoomSettings = { ...mockSettings, maxPlayers: 3 }
    const { createRoom, joinRoom } = await import("../rooms")
    let room = await createRoom(tight, host)
    for (let i = 1; i <= 4; i++) {
      const { room: next } = await joinRoom(room, buildPlayer(i))
      room = next
    }
    const prompterCount = room.players.filter((p) => p.role === "prompter").length
    const spectatorCount = room.players.filter((p) => p.role === "spectator").length
    expect(prompterCount).toBe(3) // host + 2
    expect(spectatorCount).toBe(2)
    expect(room.players).toHaveLength(5)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Ruthless tests — these expose real bugs / footguns in the current
// helpers. Each has a comment marking RED (currently fails / exposes bug)
// or CONFIRMS-CURRENT (documents non-obvious / surprising behaviour).
// Some are deliberately RED so the suite stays loud about issues.
// ─────────────────────────────────────────────────────────────────────

describe("rooms.ts — ruthless edge cases", () => {
  function specPlayer(id: string, idx = 100): Player {
    return {
      userId: id,
      name: id.toUpperCase(),
      avatarSeed: id,
      role: "spectator",
      ready: false,
      joinedAt: 1000 + idx,
      connected: true,
      lastSeenAt: 1000 + idx,
    }
  }

  it("BUG: joinRoom mutates the caller's player object (sets role in place)", async () => {
    // The helper currently does `player.role = role` before pushing — so the
    // caller's reference now reflects the assigned role. Surprising for a
    // function that looks immutable from its return shape.
    const { createRoom, joinRoom } = await import("../rooms")
    const tight: RoomSettings = { ...mockSettings, maxPlayers: 3 }
    const room = await createRoom(tight, host)
    const sneakyPlayer = specPlayer("u-1")
    expect(sneakyPlayer.role).toBe("spectator") // pre-call

    await joinRoom(room, sneakyPlayer)

    // CONFIRMS-CURRENT: caller's object is mutated. If this ever changes, this
    // test will fail and the helper has become genuinely pure.
    expect(sneakyPlayer.role).toBe("prompter")
  })

  it("BUG: leaveRoom mutates the input room object", async () => {
    const { createRoom, joinRoom, leaveRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    const { room: r1 } = await joinRoom(room, specPlayer("u-1"))
    const playersRef = r1.players
    const updated = await leaveRoom(r1, "u-1")
    // CONFIRMS-CURRENT: the returned object is the same reference as input
    // (mutation, not copy). Useful to know if downstream depends on identity.
    expect(updated).toBe(r1)
    expect(updated.players).not.toBe(playersRef) // players IS replaced
  })

  it("BUG: setPlayerReady mutates the player record inside the room", async () => {
    const { createRoom, joinRoom, setPlayerReady } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    const { room: r1 } = await joinRoom(room, specPlayer("u-1"))
    const beforePlayer = r1.players.find((p) => p.userId === "u-1")
    expect(beforePlayer?.ready).toBe(false)

    await setPlayerReady(r1, "u-1", true)

    // CONFIRMS-CURRENT: r1.players[i].ready is mutated in place. Snapshots
    // taken before the call now show the new value too — surprising for
    // tests / debug logging.
    expect(beforePlayer?.ready).toBe(true)
  })

  it("FIXED: createRoom forces the host's role to 'prompter' regardless of caller input", async () => {
    const { createRoom } = await import("../rooms")
    const sneakyHost: Player = { ...host, role: "spectator" }
    const room = await createRoom(mockSettings, sneakyHost)
    // Sanitised at the boundary — host is always a prompter.
    expect(room.players[0].role).toBe("prompter")
    expect(room.hostId).toBe(sneakyHost.userId)
  })

  it("FIXED: spectator auto-promotes to prompter when a slot opens (earliest-joined wins)", async () => {
    // maxPlayers=3 → host + 2 prompter slots.
    // Sequence: host, p1 (prompter), p2 (prompter), s1 (spectator).
    // Then p1 leaves → s1 takes their slot.
    const tight: RoomSettings = { ...mockSettings, maxPlayers: 3 }
    const { createRoom, joinRoom, leaveRoom } = await import("../rooms")
    const room = await createRoom(tight, host)
    const { room: r1 } = await joinRoom(room, specPlayer("p1", 1))
    const { room: r2 } = await joinRoom(r1, specPlayer("p2", 2))
    const { room: r3 } = await joinRoom(r2, specPlayer("s1", 3))

    expect(r3.players.find((p) => p.userId === "s1")?.role).toBe("spectator")

    const r4 = await leaveRoom(r3, "p1")

    // s1 promoted to prompter since their slot opened up.
    const s1 = r4.players.find((p) => p.userId === "s1")
    expect(s1?.role).toBe("prompter")
  })

  it("FIXED: waiting spectator is promoted before any new joiner can take the slot", async () => {
    const tight: RoomSettings = { ...mockSettings, maxPlayers: 3 }
    const { createRoom, joinRoom, leaveRoom } = await import("../rooms")
    const room = await createRoom(tight, host)
    const { room: r1 } = await joinRoom(room, specPlayer("p1", 1))
    const { room: r2 } = await joinRoom(r1, specPlayer("p2", 2))
    const { room: r3 } = await joinRoom(r2, specPlayer("s1", 3)) // forced spectator
    const r4 = await leaveRoom(r3, "p1")
    // s1 was promoted on leave → cap is full again.
    expect(r4.players.find((p) => p.userId === "s1")?.role).toBe("prompter")

    // New arrival now → no slot, becomes spectator.
    const { role: latestRole } = await joinRoom(r4, specPlayer("late", 99))
    expect(latestRole).toBe("spectator") // queue is honoured
  })

  it("FIXED: rejoin returns the (now-promoted) role — spectator → prompter when slot freed", async () => {
    // After leaveRoom, the helper auto-promotes the earliest waiting
    // spectator. The rejoin path returns whatever role they currently have.
    const tight: RoomSettings = { ...mockSettings, maxPlayers: 3 }
    const { createRoom, joinRoom, leaveRoom } = await import("../rooms")
    const room = await createRoom(tight, host)
    const { room: r1 } = await joinRoom(room, specPlayer("p1", 1))
    const { room: r2 } = await joinRoom(r1, specPlayer("p2", 2))
    const { room: r3 } = await joinRoom(r2, specPlayer("s1", 3))

    const r4 = await leaveRoom(r3, "p1")
    // s1 is now a prompter automatically — rejoin returns the current role.
    const { role } = await joinRoom(r4, specPlayer("s1", 4))
    expect(role).toBe("prompter")
  })

  it("BUG: setPlayerReady allows spectators to mark themselves Ready", async () => {
    // The helper has no role gate. A spectator can flip their own ready flag
    // (server route doesn't gate this either as of current code). They then
    // appear "Ready" in the lobby player list, which is misleading.
    const tight: RoomSettings = { ...mockSettings, maxPlayers: 1 }
    const { createRoom, joinRoom, setPlayerReady } = await import("../rooms")
    const room = await createRoom(tight, host)
    const { room: r1 } = await joinRoom(room, specPlayer("spec", 1))
    const target = r1.players.find((p) => p.userId === "spec")
    expect(target?.role).toBe("spectator")

    const { player } = await setPlayerReady(r1, "spec", true)
    expect(player?.ready).toBe(true) // current behaviour — should be gated
  })

  it("CONFIRMS-CURRENT: leaveRoom keeps the leaver's userId as hostId when no other players remain", async () => {
    // After the only player (the host) leaves, the room has 0 players, but
    // hostId still points to them. If they later POST any action they'd be
    // identified as host of an empty room. Not a bug in itself but worth
    // pinning.
    const { createRoom, leaveRoom } = await import("../rooms")
    const room = await createRoom(mockSettings, host)
    const updated = await leaveRoom(room, "host-1")
    expect(updated.players).toHaveLength(0)
    expect(updated.hostId).toBe("host-1")
  })

  it("BUG: codes from rapid createRoom calls are not deduplicated against existing rooms", async () => {
    // nanoid is collision-resistant in practice, but createRoom doesn't
    // verify uniqueness against Redis. Test confirms there's no retry/check
    // loop — if the same code came out twice, the second createRoom would
    // overwrite the first room's state silently.
    const { createRoom } = await import("../rooms")
    // We can't easily force a collision without monkey-patching nanoid, but
    // we can confirm createRoom does exactly one redis.set call (no read-
    // before-write).
    mockSet.mockClear()
    await createRoom(mockSettings, host)
    expect(mockSet).toHaveBeenCalledOnce()
    expect(mockGet).not.toHaveBeenCalled()
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

import { describe, it, expect } from "vitest"
import { RoomSettings, RoomState, Player, CreateRoomInput, JoinRoomInput } from "../types"

describe("RoomSettings", () => {
  it("accepts valid settings", () => {
    const result = RoomSettings.parse({
      rounds: 3,
      maxPlayers: 6,
      timer: 60,
      promptMaxLength: 200,
      category: "animals",
    })
    expect(result.gameMode).toBe("showdown")
    expect(result.rounds).toBe(3)
    expect(result.maxPlayers).toBe(6)
  })

  it("applies defaults for omitted fields", () => {
    const result = RoomSettings.parse({})
    expect(result.rounds).toBe(3)
    expect(result.maxPlayers).toBe(8)
    expect(result.timer).toBe(60)
    expect(result.category).toBe("animals")
    expect(result.difficulty).toBe("normal")
  })

  it("rejects rounds below 1", () => {
    expect(() => RoomSettings.parse({ rounds: 0 })).toThrow()
  })

  it("rejects rounds above 5", () => {
    expect(() => RoomSettings.parse({ rounds: 6 })).toThrow()
  })

  it("rejects maxPlayers above 8", () => {
    expect(() => RoomSettings.parse({ maxPlayers: 9 })).toThrow()
  })

  it("rejects timer above 120", () => {
    expect(() => RoomSettings.parse({ timer: 121 })).toThrow()
  })

  it("rejects timer below 30", () => {
    expect(() => RoomSettings.parse({ timer: 29 })).toThrow()
  })

  it("rejects invalid category", () => {
    expect(() => RoomSettings.parse({ category: "invalid" })).toThrow()
  })

  it("accepts all valid categories", () => {
    for (const cat of ["animals", "landmarks", "foods", "nature", "characters"] as const) {
      expect(() => RoomSettings.parse({ category: cat })).not.toThrow()
    }
  })

  it("rejects promptMaxLength above 200", () => {
    expect(() => RoomSettings.parse({ promptMaxLength: 201 })).toThrow()
  })

  it("rejects promptMaxLength below 50", () => {
    expect(() => RoomSettings.parse({ promptMaxLength: 49 })).toThrow()
  })
})

describe("Player", () => {
  const validPlayer = {
    userId: "abc-123",
    name: "Alice",
    avatarSeed: "seed-xyz",
    role: "prompter" as const,
    ready: false,
    joinedAt: Date.now(),
    connected: true,
    lastSeenAt: Date.now(),
  }

  it("accepts valid prompter", () => {
    expect(() => Player.parse(validPlayer)).not.toThrow()
  })

  it("accepts valid spectator", () => {
    expect(() => Player.parse({ ...validPlayer, role: "spectator" })).not.toThrow()
  })

  it("rejects invalid role", () => {
    expect(() => Player.parse({ ...validPlayer, role: "host" })).toThrow()
  })
})

describe("RoomState", () => {
  it("accepts a valid room state", () => {
    const state = {
      code: "ABCD",
      hostId: "user-1",
      settings: { rounds: 3, maxPlayers: 8, timer: 60, promptMaxLength: 200, category: "animals" },
      players: [],
      status: "lobby" as const,
      currentRound: 0,
      targetId: null,
      seed: null,
      createdAt: Date.now(),
    }
    expect(() => RoomState.parse(state)).not.toThrow()
  })
})

describe("CreateRoomInput", () => {
  it("accepts valid input", () => {
    const input = {
      name: "Alice",
      avatarSeed: "seed-1",
      settings: { rounds: 3, maxPlayers: 6, timer: 60, promptMaxLength: 200, category: "foods" },
    }
    expect(() => CreateRoomInput.parse(input)).not.toThrow()
  })

  it("rejects empty name", () => {
    expect(() =>
      CreateRoomInput.parse({ name: "", avatarSeed: "seed-1", settings: {} })
    ).toThrow()
  })

  it("rejects name over 30 chars", () => {
    expect(() =>
      CreateRoomInput.parse({ name: "a".repeat(31), avatarSeed: "seed-1", settings: {} })
    ).toThrow()
  })
})

describe("JoinRoomInput", () => {
  it("accepts valid input", () => {
    expect(() => JoinRoomInput.parse({ name: "Bob", avatarSeed: "seed-2" })).not.toThrow()
  })

  it("rejects empty name", () => {
    expect(() => JoinRoomInput.parse({ name: "", avatarSeed: "seed-2" })).toThrow()
  })
})

import type { Attempt, RoomSettings, RoomState, Vote } from "./types";

export interface SeedResponse {
  user_id: string;
}

export interface CreateRoomResponse {
  room: RoomState;
}

export interface JoinRoomResponse {
  room: RoomState;
  role: "prompter" | "spectator";
}

export interface LeaveRoomResponse {
  room: RoomState;
}

export interface GenerateResponse {
  attempt: Attempt;
  attemptsRemaining: number;
}

export interface RoundDetailsResponse {
  round: number;
  finalAttempts: Attempt[];
  myAttempts: Attempt[];
  myPick: string | null;
  votes: Vote[];
  targetImageUrl: string | null;
  targetPrompt: string | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") msg = body.error;
    } catch {
      // ignore parse failure
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export async function seedUser(): Promise<SeedResponse> {
  const res = await fetch("/api/v1/user/seed", { credentials: "include" });
  return asJson<SeedResponse>(res);
}

export async function createRoom(
  name: string,
  avatarSeed: string,
  settings: RoomSettings,
): Promise<CreateRoomResponse> {
  const res = await fetch("/api/v1/rooms", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, avatarSeed, settings }),
  });
  return asJson<CreateRoomResponse>(res);
}

export async function getRoom(code: string): Promise<{ room: RoomState }> {
  const res = await fetch(`/api/v1/rooms/${encodeURIComponent(code)}`, {
    credentials: "include",
  });
  return asJson<{ room: RoomState }>(res);
}

export async function joinRoom(
  code: string,
  name: string,
  avatarSeed: string,
): Promise<JoinRoomResponse> {
  const res = await fetch(`/api/v1/rooms/${encodeURIComponent(code)}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "join", name, avatarSeed }),
  });
  return asJson<JoinRoomResponse>(res);
}

export async function updateRoomSettings(
  code: string,
  settings: RoomSettings,
): Promise<{ room: RoomState }> {
  const res = await fetch(`/api/v1/rooms/${encodeURIComponent(code)}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "update", settings }),
  });
  return asJson<{ room: RoomState }>(res);
}

export async function readyRoom(
  code: string,
  ready: boolean,
): Promise<{ room: RoomState }> {
  const res = await fetch(`/api/v1/rooms/${encodeURIComponent(code)}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: ready ? "ready" : "unready" }),
  });
  return asJson<{ room: RoomState }>(res);
}

export async function startRoom(code: string): Promise<{ room: RoomState }> {
  const res = await fetch(`/api/v1/rooms/${encodeURIComponent(code)}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "start" }),
  });
  return asJson<{ room: RoomState }>(res);
}

export async function leaveRoom(code: string): Promise<LeaveRoomResponse> {
  const res = await fetch(`/api/v1/rooms/${encodeURIComponent(code)}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "leave" }),
  });
  return asJson<LeaveRoomResponse>(res);
}

export async function advanceRoom(code: string): Promise<{ room: RoomState }> {
  const res = await fetch(`/api/v1/rooms/${encodeURIComponent(code)}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "advance" }),
  });
  return asJson<{ room: RoomState }>(res);
}

export async function pickAttempt(
  code: string,
  attemptId: string,
): Promise<{ room: RoomState }> {
  const res = await fetch(`/api/v1/rooms/${encodeURIComponent(code)}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pick", attemptId }),
  });
  return asJson<{ room: RoomState }>(res);
}

export async function submitGeneration(
  code: string,
  prompt: string,
): Promise<GenerateResponse> {
  const res = await fetch("/api/v1/generate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomCode: code, prompt }),
  });
  return asJson<GenerateResponse>(res);
}

export async function submitVote(
  code: string,
  targetUserId: string,
): Promise<{ vote: Vote }> {
  const res = await fetch("/api/v1/vote", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomCode: code, targetUserId }),
  });
  return asJson<{ vote: Vote }>(res);
}

export async function getRoundDetails(
  code: string,
  round: number,
): Promise<RoundDetailsResponse> {
  const res = await fetch(
    `/api/v1/rooms/${encodeURIComponent(code)}/round/${round}`,
    { credentials: "include" },
  );
  return asJson<RoundDetailsResponse>(res);
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  gameMode: "showdown",
  rounds: 3,
  maxPlayers: 8,
  timer: 60,
  memorizeTime: 10,
  promptMaxLength: 200,
  attemptsPerRound: 3,
  category: "animals",
  difficulty: "normal",
};

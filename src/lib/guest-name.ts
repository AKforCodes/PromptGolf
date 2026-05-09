export function randomGuestName(): string {
  const n = Math.floor(Math.random() * 99) + 1;
  return `Guest-${n.toString().padStart(2, "0")}`;
}

const BG_PALETTE = "fef3c7,fde68a,fef9c3,bbf7d0,bae6fd,fbcfe8";

export function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${BG_PALETTE}`;
}

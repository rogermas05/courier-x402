export const shortHash = (hash: string) => (hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash);

export const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export const timeOfDay = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function ausd(value: number): string {
  return `${Number(value.toFixed(6)).toString()} AUSD`;
}

export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

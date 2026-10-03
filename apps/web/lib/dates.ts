/** Helpers de data (fora dos componentes, para manter a renderização pura). */
export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

export function daysFromNowIso(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString();
}

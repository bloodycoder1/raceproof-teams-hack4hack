export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Current UTC offset of an IANA time zone in minutes (e.g. Asia/Kolkata -> 330). */
export function utcOffsetMinutes(tz: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(at);
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(name);
  if (!m) return 0; // plain "GMT"
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === '-' ? -minutes : minutes;
}

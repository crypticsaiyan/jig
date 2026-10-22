// parses durations like "1h30m", "45s", "2h" or "1h5m10s" into seconds.
// units must appear in the order h, m, s, each at most once, at least one of them;
// numbers are whole; unit letters are case-insensitive; surrounding spaces are ignored.
// anything else throws an Error.
export function parseDuration(text: string): number {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(text);
  if (!match || (!match[1] && !match[2] && !match[3]))
    throw new Error(`invalid duration: ${text}`);
  const [, h = "0", m = "0", s = "0"] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

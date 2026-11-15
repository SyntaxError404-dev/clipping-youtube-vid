/**
 * Posting plan, PeakCut posting.py idea, simplified for a local site:
 * best slots are 12:00 and 19:00 local time, at most 2 posts a day,
 * at least 3 hours apart. Returns the next N slots from now.
 */
export interface PostSlot {
  due: string; // ISO
  label: string; // "Sat 7:00 PM"
  day: string;
  time: string;
}

export function nextSlots(n: number, from = new Date()): PostSlot[] {
  const out: PostSlot[] = [];
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  while (out.length < n) {
    for (const h of [12, 19]) {
      const t = new Date(day);
      t.setHours(h, 0, 0, 0);
      if (t.getTime() <= from.getTime() + 60_000) continue; // in the past
      const sameDay = out.filter((s) => s.day === t.toDateString()).length;
      if (sameDay >= 2) continue;
      if (out.length && t.getTime() - new Date(out[out.length - 1].due).getTime() < 3 * 3600_000) continue;
      const label = t.toLocaleDateString("en-US", { weekday: "short" }) + " " +
        t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      out.push({
        due: t.toISOString(),
        label,
        day: t.toLocaleDateString("en-US", { weekday: "long" }),
        time: t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      });
      if (out.length >= n) break;
    }
    day.setDate(day.getDate() + 1);
  }
  return out;
}

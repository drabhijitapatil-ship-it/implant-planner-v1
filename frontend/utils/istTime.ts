/**
 * IST (India Standard Time, UTC+5:30, no daylight saving) date helpers.
 *
 * The backend stores UTC. Some endpoints serialise datetimes WITHOUT a
 * timezone marker (e.g. "2026-10-11T08:30:00"), which `new Date()` reads as
 * the phone's LOCAL time — off by 5h30m. `parseServerDate` treats any such
 * string as UTC, and the formatters always render in IST regardless of the
 * device timezone, so faculty see the same clock time everywhere.
 */

const IST_OFFSET_MS = 330 * 60 * 1000; // +5:30
const DAY_MS = 86_400_000;

/** Parse a server timestamp; strings with no timezone are treated as UTC. */
export function parseServerDate(value?: string | number | Date | null): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  let s = String(value).trim();
  // Date + time with no "Z" / "+hh:mm" / "-hh:mm" suffix → assume UTC.
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    s = s.replace(' ', 'T') + 'Z';
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Wall-clock parts of `d` in IST, independent of the device timezone. */
function istParts(d: Date) {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth(),
    day: ist.getUTCDate(),
    hours: ist.getUTCHours(),
    minutes: ist.getUTCMinutes(),
  };
}

/** IST calendar-day number (days since epoch) — for today/yesterday checks. */
function istDayNumber(d: Date): number {
  return Math.floor((d.getTime() + IST_OFFSET_MS) / DAY_MS);
}

/** "3:05 PM" in IST. */
export function formatISTTime(value?: string | number | Date | null): string {
  const d = parseServerDate(value);
  if (!d) return '';
  const { hours, minutes } = istParts(d);
  const h12 = hours % 12 || 12;
  return `${h12}:${minutes < 10 ? '0' : ''}${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "11 Oct 2026" in IST. */
export function formatISTDate(value?: string | number | Date | null): string {
  const d = parseServerDate(value);
  if (!d) return '';
  const { year, month, day } = istParts(d);
  return `${day} ${MONTHS[month]} ${year}`;
}

/**
 * "today" / "yesterday" / "5 days ago" / "3 months ago", using IST calendar
 * days (so a login at 11:50 PM IST yesterday is "yesterday", not "today").
 */
export function formatISTRelative(value?: string | number | Date | null): string {
  const d = parseServerDate(value);
  if (!d) return '';
  const days = istDayNumber(new Date()) - istDayNumber(d);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

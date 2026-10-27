import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  SOCIAL_LEAD_MINUTES,
  SOCIAL_SCHEDULES,
  SOCIAL_TIMEZONE,
} from "./config";
import type { SocialPlatform } from "./types";

const MAX_DAYS_AHEAD = 370;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function localDateParts(now: Date, timeZone: string) {
  const [year, month, day] = formatInTimeZone(now, timeZone, "yyyy-MM-dd")
    .split("-")
    .map(Number);
  return { year, month, day };
}

function addDays(
  parts: { year: number; month: number; day: number },
  days: number,
) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
  };
}

function localToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  return fromZonedTime(
    `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`,
    timeZone,
  );
}

export function slotKey(date: Date): string {
  return date.toISOString();
}

export function nextSocialSlot(
  platform: SocialPlatform,
  now: Date,
  usedSlots: ReadonlySet<string> = new Set(),
  timeZone = SOCIAL_TIMEZONE,
): Date {
  const schedule = SOCIAL_SCHEDULES[platform];
  const minimum = now.getTime() + SOCIAL_LEAD_MINUTES * 60_000;
  const local = localDateParts(now, timeZone);

  for (let offset = 0; offset <= MAX_DAYS_AHEAD; offset++) {
    const day = addDays(local, offset);
    if (!schedule.days.includes(day.weekday)) continue;
    for (const hour of schedule.hours) {
      const candidate = localToUtc(
        day.year,
        day.month,
        day.day,
        hour,
        0,
        timeZone,
      );
      if (candidate.getTime() <= minimum) continue;
      if (usedSlots.has(slotKey(candidate))) continue;
      return candidate;
    }
  }

  throw new Error(`No ${platform} slot found within ${MAX_DAYS_AHEAD} days`);
}

export function nextSocialSlots(
  platform: SocialPlatform,
  count: number,
  now: Date,
  usedSlots: ReadonlySet<string> = new Set(),
  timeZone = SOCIAL_TIMEZONE,
): Date[] {
  const used = new Set(usedSlots);
  const slots: Date[] = [];
  let cursor = now;
  for (let index = 0; index < count; index++) {
    const slot = nextSocialSlot(platform, cursor, used, timeZone);
    slots.push(slot);
    used.add(slotKey(slot));
    cursor = new Date(slot.getTime() + 60_000);
  }
  return slots;
}

export function formatSocialSlot(date: Date | string, timeZone = SOCIAL_TIMEZONE) {
  return formatInTimeZone(new Date(date), timeZone, "EEE, MMM d, yyyy 'at' HH:mm");
}

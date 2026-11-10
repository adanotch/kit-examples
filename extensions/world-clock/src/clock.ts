// Clock math. It never touches AdanotchKit, so tests can call it directly with a fixed time.
//
// Only cities without daylight saving time are listed, so a fixed UTC offset is always right. To add a city that
// changes its clock, compute the offset from the date instead (and don't rely on Intl in Adanotch's runtime).

export interface City {
  name: string;
  /** Minutes from UTC. */
  offset: number;
}

export const CITIES: Record<string, City> = {
  istanbul: { name: "Istanbul", offset: 180 },
  dubai: { name: "Dubai", offset: 240 },
  kolkata: { name: "Kolkata", offset: 330 },
  singapore: { name: "Singapore", offset: 480 },
  tokyo: { name: "Tokyo", offset: 540 },
  "sao-paulo": { name: "São Paulo", offset: -180 },
};

const pad = (value: number) => String(value).padStart(2, "0");

/** The wall clock in a city: the UTC fields of a `Date` shifted by its offset. */
export function wallClock(now: number, offset: number): Date {
  return new Date(now + offset * 60_000);
}

export function formatTime(clock: Date, hour12: boolean): string {
  const hours = clock.getUTCHours();
  const minutes = pad(clock.getUTCMinutes());
  if (!hour12) return `${pad(hours)}:${minutes}`;
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

/** Which day it is in a city, relative to *your* day. */
export function dayLabel(clock: Date, mine: Date): string {
  const days = (date: Date) => Math.floor(date.getTime() / 86_400_000);
  const difference = days(clock) - days(mine);
  return difference === 0 ? "Today" : difference > 0 ? "Tomorrow" : "Yesterday";
}

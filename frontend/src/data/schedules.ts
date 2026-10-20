// Schedule helpers (schedule.*): their stored week, as returned by schedule/list.

export const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Day = (typeof DAYS)[number];

export interface Range {
  from: string;
  to: string;
}

export interface ScheduleConfig extends Partial<Record<Day, Range[]>> {
  id: string;
  name: string;
  icon?: string;
}

/** "07:30" or "07:30:00" → minutes since midnight. */
export const minutes = (hhmm: string) => {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
};

/** End of a range in minutes; "00:00" as an end means midnight. */
export const endMinutes = (to: string) => minutes(to) || 1440;

/** "07:00:00" → "07:00" for time inputs, and back. */
export const short = (t: string) => t.slice(0, 5);
export const long = (t: string) => (t.length === 5 ? `${t}:00` : t);

/** Monday-based index of a date's weekday. */
export const dayIndex = (date: Date) => (date.getDay() + 6) % 7;

/** Whether a schedule is on at a minute of a day. */
export const isOnAt = (cfg: ScheduleConfig | undefined, day: Day, minute: number) =>
  (cfg?.[day] ?? []).some((r) => minute >= minutes(r.from) && minute < endMinutes(r.to));

/** The payload for schedule/update: all days, ranges sorted and without empty ones. */
export function updatePayload(cfg: ScheduleConfig): { type: string; [key: string]: unknown } {
  const days = Object.fromEntries(
    DAYS.map((d) => [
      d,
      (cfg[d] ?? [])
        .filter((r) => r.from && r.to && endMinutes(r.to) > minutes(r.from))
        .map((r) => ({ from: long(r.from), to: long(r.to) }))
        .sort((a, b) => minutes(a.from) - minutes(b.from)),
    ]),
  );
  return {
    type: "schedule/update",
    schedule_id: cfg.id,
    name: cfg.name,
    ...(cfg.icon ? { icon: cfg.icon } : {}),
    ...days,
  };
}

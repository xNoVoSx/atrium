// Number, date and time formatting in the user's language.

export const localeOf = (language: string | undefined) => language || "en";

export function formatTemperature(value: number | null, locale: string, digits = 1): string {
  if (value === null) return "—";
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(rounded)}°`;
}

export const formatTime = (date: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);

export const formatDate = (date: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(date);

/** "18 min", "2 h", "3 d" style durations since an ISO time. */
export function formatSince(iso: string, now: Date, locale: string): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  const rtf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  if (minutes < 60) return `${rtf.format(minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${rtf.format(hours)} h`;
  return `${rtf.format(Math.round(hours / 24))} d`;
}

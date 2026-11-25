import type { Locale } from "./i18n";

export const CURRENCY = "TZS";

function dateLocale(locale: Locale) {
  return locale === "en" ? "en-TZ" : "sw-TZ";
}

export function money(amount: number | string | null | undefined) {
  const value = Number(amount ?? 0);

  if (!Number.isFinite(value)) {
    return `${CURRENCY} 0`;
  }

  return `${CURRENCY} ${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}`;
}

export function compactMoney(amount: number | string | null | undefined) {
  const value = Number(amount ?? 0);

  if (!Number.isFinite(value)) return `${CURRENCY} 0`;

  if (Math.abs(value) >= 1_000_000) {
    return `${CURRENCY} ${(value / 1_000_000).toFixed(1)}M`;
  }

  if (Math.abs(value) >= 10_000) {
    return `${CURRENCY} ${(value / 1_000).toFixed(0)}K`;
  }

  return money(value);
}

export function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function formatDate(
  value: string | Date | null | undefined,
  locale: Locale = "sw"
) {
  if (!value) return "-";

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString(dateLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(
  value: string | Date | null | undefined,
  locale: Locale = "sw"
) {
  if (!value) return "-";

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString(dateLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function startOfDayISO(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
}

export function daysAgoISO(days: number) {
  const copy = new Date();
  copy.setDate(copy.getDate() - days);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
}

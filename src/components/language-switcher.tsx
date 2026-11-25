"use client";

import { useI18n, type Locale } from "@/lib/i18n";

const LANGUAGES: { value: Locale; short: string; label: string }[] = [
  { value: "sw", short: "SW", label: "Kiswahili" },
  { value: "en", short: "EN", label: "English" },
];

export default function LanguageSwitcher({
  tone = "light",
}: {
  tone?: "light" | "dark";
}) {
  const { locale, setLocale, t } = useI18n();

  const isDark = tone === "dark";
  const activeClass = isDark
    ? "bg-emerald-500 text-white"
    : "bg-emerald-600 text-white";
  const idleClass = isDark
    ? "text-emerald-100/70 hover:text-white"
    : "text-slate-500 hover:text-slate-800";

  return (
    <div
      role="group"
      aria-label={t("common.language")}
      className={`inline-flex items-center rounded-full border p-0.5 ${
        isDark ? "border-white/20 bg-white/10" : "border-slate-200 bg-white"
      }`}
    >
      {LANGUAGES.map((language) => (
        <button
          key={language.value}
          type="button"
          onClick={() => setLocale(language.value)}
          aria-pressed={locale === language.value}
          title={language.label}
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
            locale === language.value ? activeClass : idleClass
          }`}
        >
          {language.short}
        </button>
      ))}
    </div>
  );
}

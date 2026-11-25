"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import AppShell from "@/components/app-shell";
import { roleLabel, useI18n } from "@/lib/i18n";
import { useWorkspace } from "@/lib/workspace";
import { useDemoStatus } from "@/lib/demo/use-demo-status";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";

export default function DemoSettingsPage() {
  const { t, locale } = useI18n();
  const { workspace } = useWorkspace();
  const { status, loading, refresh } = useDemoStatus();
  const [confirmation, setConfirmation] = useState("");
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const role = workspace?.role ?? null;
  const mayResetUi = can(role, "demo.reset") && status.canReset;

  async function handleReset() {
    if (confirmation !== "RESET") return;

    setResetting(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/demo/reset", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "RESET" }),
      });

      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? t("demo.settings.error", { detail: "" }));
        return;
      }

      setNotice(payload.message ?? t("demo.settings.success"));
      setConfirmation("");
      await refresh();
    } catch {
      setError(t("demo.settings.error", { detail: "" }));
    } finally {
      setResetting(false);
    }
  }

  return (
    <AppShell
      title={t("demo.settingsTitle")}
      subtitle={t("demo.settingsSubtitle")}
    >
      {!status.isDemo ? (
        <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <ShieldCheck size={24} />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            {t("demo.settings.notDemo")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {status.unavailableReason === "DEMO_SCHEMA_NOT_APPLIED"
              ? t("demo.settings.unavailable")
              : t("demo.settings.temporary")}
          </p>
        </div>
      ) : (
        <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-base font-extrabold text-slate-900">
              {t("demo.settingsTitle")}
            </h2>

            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  {t("demo.settings.role")}
                </dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {roleLabel(status.role ?? role, t)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  {t("demo.settings.business")}
                </dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {status.businessName}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  {t("demo.settings.status")}
                </dt>
                <dd className="mt-1 font-semibold text-emerald-700">
                  {t("demo.settings.statusActive")}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  {t("demo.settings.lastReset")}
                </dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {status.lastResetAt
                    ? formatDateTime(status.lastResetAt, locale)
                    : t("demo.settings.neverReset")}
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex items-start gap-2 rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {t("demo.settings.temporary")}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-2 text-base font-extrabold text-slate-900">
              {t("demo.settings.resetTitle")}
            </h2>
            <p className="text-sm leading-6 text-slate-600">
              {t("demo.settings.resetDescription")}
            </p>

            {loading ? (
              <p className="mt-5 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="animate-spin" size={16} />
                {t("common.loading")}
              </p>
            ) : mayResetUi ? (
              <div className="mt-6 space-y-4">
                <label
                  htmlFor="demo-reset-confirmation"
                  className="block text-xs font-bold text-slate-700"
                >
                  {t("demo.settings.confirmLabel")}
                </label>
                <input
                  id="demo-reset-confirmation"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder="RESET"
                  autoComplete="off"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />

                {error && (
                  <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700" role="alert">
                    {error}
                  </p>
                )}
                {notice && (
                  <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700" role="status">
                    <CheckCircle2 size={15} /> {notice}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleReset}
                  disabled={resetting || confirmation !== "RESET"}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resetting ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  {resetting ? t("demo.settings.resetting") : t("demo.settings.resetButton")}
                </button>
              </div>
            ) : (
              <p className="mt-6 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                {t("demo.settings.ownerOnly")}
              </p>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}

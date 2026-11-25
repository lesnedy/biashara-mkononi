"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  X,
  Wallet,
  TrendingDown,
  CalendarDays,
  Receipt,
  Trash2,
  Filter,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import AppShell from "@/components/app-shell";
import {
  expenseCategoryLabel,
  paymentMethodLabel,
  useI18n,
  type TranslationKey,
} from "@/lib/i18n";
import { useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { isMissingTableError, safeErrorDetail } from "@/lib/supabase/errors";
import { formatDate, money, todayISO } from "@/lib/format";

type Expense = {
  id: string;
  title: string;
  category: string;
  amount: number;
  expense_date: string;
  payment_method: string;
  notes: string | null;
};

type Notice = {
  key: TranslationKey;
  variables?: Record<string, string | number>;
};

const CATEGORIES = [
  "Kodi ya Fremu",
  "Umeme",
  "Maji",
  "Mishahara",
  "Usafiri",
  "Mawasiliano",
  "Matengenezo",
  "Chakula",
  "Ushuru na Kodi",
  "Mengineyo",
];

const PAYMENT_METHODS = [
  "Cash",
  "M-Pesa",
  "Tigo Pesa",
  "Airtel Money",
  "HaloPesa",
  "Benki",
];

export default function ExpensesPage() {
  const { workspace, user, supabase } = useWorkspace();
  const { locale, t } = useI18n();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Notice | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Zote");
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Mengineyo");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [notes, setNotes] = useState("");

  const businessId = workspace?.business_id ?? "";
  const mayManage = can(workspace?.role, "expenses.manage");
  const mayDelete =
    workspace?.role === "owner" || workspace?.role === "admin";

  useEffect(() => {
    if (date) return;

    let active = true;
    void Promise.resolve().then(() => {
      if (active) setDate(todayISO());
    });

    return () => {
      active = false;
    };
  }, [date]);

  const loadExpenses = useCallback(async () => {
    if (!businessId) return;

    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from("expenses")
      .select("id,title,category,amount,expense_date,payment_method,notes")
      .eq("business_id", businessId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (loadError) {
      setError(
        isMissingTableError(loadError.message)
          ? { key: "expenses.errorModuleMissing" }
          : {
              key: "expenses.errorLoad",
              variables: { detail: safeErrorDetail(loadError, locale) },
            }
      );
      setExpenses([]);
    } else {
      setExpenses((data ?? []) as Expense[]);
    }

    setLoading(false);
  }, [businessId, locale, supabase]);

  useEffect(() => {
    if (!businessId) return;

    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadExpenses();
    });

    return () => {
      active = false;
    };
  }, [businessId, loadExpenses]);

  const totalExpenses = expenses.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );

  const currentMonth = date.slice(0, 7);

  const monthlyExpenses = expenses
    .filter((item) => item.expense_date.startsWith(currentMonth))
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return expenses.filter((item) => {
      const matchesTerm =
        !term ||
        item.title.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term) ||
        (item.notes ?? "").toLowerCase().includes(term);

      const matchesCategory =
        selectedCategory === "Zote" || item.category === selectedCategory;

      return matchesTerm && matchesCategory;
    });
  }, [expenses, search, selectedCategory]);

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();

    expenses.forEach((item) => {
      map.set(item.category, (map.get(item.category) ?? 0) + Number(item.amount));
    });

    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  function resetForm() {
    setTitle("");
    setCategory("Mengineyo");
    setAmount("");
    setDate(todayISO());
    setPaymentMethod("Cash");
    setNotes("");
    setShowForm(false);
  }

  async function saveExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = Number(amount);

    if (!title.trim() || !Number.isFinite(value) || value <= 0) {
      setError({ key: "expenses.errorInvalidInput" });
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    const { error: insertError } = await supabase.from("expenses").insert({
      business_id: businessId,
      title: title.trim(),
      category,
      amount: value,
      expense_date: date || todayISO(),
      payment_method: paymentMethod,
      notes: notes.trim() || null,
      created_by: user?.id ?? null,
    });

    if (insertError) {
      setError({
        key: "expenses.errorSave",
        variables: { detail: safeErrorDetail(insertError, locale) },
      });
    } else {
      setNotice({ key: "expenses.noticeSaved" });
      resetForm();
      await loadExpenses();
    }

    setSaving(false);
  }

  async function deleteExpense(id: string) {
    if (!window.confirm(t("expenses.confirmDelete"))) return;

    const { error: deleteError } = await supabase
      .from("expenses")
      .delete()
      .eq("id", id)
      .eq("business_id", businessId);

    if (deleteError) {
      setError({
        key: "expenses.errorDelete",
        variables: { detail: safeErrorDetail(deleteError, locale) },
      });
      return;
    }

    setNotice({ key: "expenses.noticeDeleted" });
    await loadExpenses();
  }

  return (
    <AppShell
      title={t("pages.expenses")}
      subtitle={workspace?.business_name}
      actions={
        <>
          <button
            onClick={loadExpenses}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} /> {t("common.refresh")}
          </button>
          {mayManage && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
            >
              <Plus size={17} /> {t("expenses.actions.record")}
            </button>
          )}
        </>
      }
    >
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{error ? t(error.key, error.variables) : null}</span>
        </div>
      )}

      {notice && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {notice ? t(notice.key, notice.variables) : null}
        </div>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              {t("expenses.stats.total")}
            </p>
            <span className="rounded-xl bg-orange-50 p-2.5 text-orange-600">
              <TrendingDown size={19} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-extrabold">{money(totalExpenses)}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              {t("expenses.stats.thisMonth")}
            </p>
            <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
              <CalendarDays size={19} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-extrabold">
            {money(monthlyExpenses)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              {t("expenses.stats.records")}
            </p>
            <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
              <Receipt size={19} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-extrabold">{expenses.length}</p>
        </div>
      </div>

      {showForm && (
        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold">{t("expenses.form.title")}</h2>
              <p className="text-xs text-slate-500">
                {t("expenses.form.description")}
              </p>
            </div>
            <button
              onClick={resetForm}
              className="rounded-lg p-2 hover:bg-slate-100"
            >
              <X size={19} />
            </button>
          </div>

          <form onSubmit={saveExpense}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm font-semibold text-slate-700">
                {t("expenses.form.titleLabel")}
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("expenses.form.titlePlaceholder")}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("common.category")}
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500"
                >
                  {CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {expenseCategoryLabel(item, t)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("expenses.form.amount")}
                <input
                  required
                  min="1"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="50000"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("common.date")}
                <input
                  required
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("expenses.form.paymentMethod")}
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500"
                >
                  {PAYMENT_METHODS.map((item) => (
                    <option key={item} value={item}>
                      {paymentMethodLabel(item, t)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("common.notes")}
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("expenses.form.notesPlaceholder")}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? t("common.saving") : t("expenses.form.save")}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600"
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="font-bold">{t("expenses.history.title")}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {t("common.recordsFound", { count: filtered.length })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                size={17}
                className="absolute left-3 top-2.5 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("common.search")}
                className="w-52 rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Filter size={15} className="text-slate-400" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"
              >
                <option value="Zote">{t("common.allCategories")}</option>
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {expenseCategoryLabel(item, t)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 p-6 text-sm text-slate-500">
            <Loader2 className="animate-spin" size={16} /> {t("common.loading")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {t("expenses.history.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3">{t("common.date")}</th>
                  <th className="px-5 py-3">{t("expenses.columns.expense")}</th>
                  <th className="px-5 py-3">{t("common.category")}</th>
                  <th className="px-5 py-3">{t("expenses.columns.payment")}</th>
                  <th className="px-5 py-3">{t("common.amount")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-5 py-3 text-slate-500">
                      {formatDate(item.expense_date, locale)}
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-xs text-slate-400">
                        {item.notes || t("expenses.noNotes")}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                        {expenseCategoryLabel(item.category, t)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {paymentMethodLabel(item.payment_method, t)}
                    </td>
                    <td className="px-5 py-3 font-bold">
                      {money(item.amount)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {mayDelete && (
                        <button
                          onClick={() => deleteExpense(item.id)}
                          className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                          title={t("common.delete")}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {categoryTotals.length > 0 && (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold">{t("expenses.breakdown.title")}</h2>
          <div className="mt-4 space-y-4">
            {categoryTotals.map((item) => (
              <div key={item.name}>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="font-semibold">
                    {expenseCategoryLabel(item.name, t)}
                  </span>
                  <span className="font-bold">{money(item.total)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{
                      width: `${
                        totalExpenses > 0
                          ? (item.total / totalExpenses) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
        <Wallet size={13} /> {t("expenses.footer")}
      </p>
    </AppShell>
  );
}

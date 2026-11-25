"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  ShoppingCart,
  Wallet,
  Download,
  BarChart3,
  Receipt,
  Truck,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Printer,
  Percent,
} from "lucide-react";
import AppShell from "@/components/app-shell";
import {
  expenseCategoryLabel,
  paymentMethodLabel,
  reportPeriodLabel,
  saleStatusLabel,
  useI18n,
  type TranslationKey,
} from "@/lib/i18n";
import { useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { isMissingTableError, safeErrorDetail } from "@/lib/supabase/errors";
import {
  daysAgoISO,
  formatDateTime,
  money,
  startOfDayISO,
} from "@/lib/format";

type Notice = {
  key: TranslationKey;
  variables?: Record<string, string | number>;
};

type SaleRow = {
  id: string;
  receipt_number: string;
  total: number;
  paid: number;
  status: string;
  payment_method: string;
  created_at: string;
};

type ItemRow = {
  sale_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  unit_price: number;
  line_total: number;
};

type ExpenseRow = {
  category: string;
  amount: number;
};

type PurchaseRow = {
  total: number;
  paid: number;
  status: string;
};

type Period = "Leo" | "Wiki" | "Mwezi";

const PERIODS: Period[] = ["Leo", "Wiki", "Mwezi"];

function localDayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function localDayString(date: Date) {
  return localDayKey(date);
}

export default function ReportsPage() {
  const { workspace, supabase } = useWorkspace();
  const { locale, t } = useI18n();

  const [period, setPeriod] = useState<Period>("Wiki");
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [weekSeries, setWeekSeries] = useState<
    { key: string; label: string; revenue: number; expenses: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Notice | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const businessId = workspace?.business_id ?? "";
  const role = workspace?.role ?? null;
  const mayView = can(role, "reports.view");

  const loadReports = useCallback(
    (range: Period) => {
      if (!businessId) return Promise.resolve();

      // Keep state updates inside the async continuation so starting this loader
      // from an effect is not treated as a synchronous setState call.
      return Promise.resolve().then(async () => {
        setLoading(true);
        setError(null);
        setUnavailable(false);

        let start: Date;

        if (range === "Leo") {
          start = new Date(startOfDayISO());
        } else if (range === "Wiki") {
          start = new Date(daysAgoISO(6));
        } else {
          start = new Date(daysAgoISO(29));
        }

        const startISO = start.toISOString();
        const startDay = localDayString(start);

        const weekStart = new Date(daysAgoISO(6));

        const [salesResult, expensesResult, purchasesResult, weekSalesResult] =
          await Promise.all([
            supabase
              .from("sales")
              .select(
                "id,receipt_number,total,paid,status,payment_method,created_at"
              )
              .eq("business_id", businessId)
              .gte("created_at", startISO)
              .order("created_at", { ascending: false })
              .limit(5000),
            supabase
              .from("expenses")
              .select("category,amount")
              .eq("business_id", businessId)
              .gte("expense_date", startDay)
              .limit(5000),
            supabase
              .from("purchases")
              .select("total,paid,status")
              .eq("business_id", businessId)
              .gte("purchase_date", startDay)
              .limit(5000),
            supabase
              .from("sales")
              .select("id,total,status,created_at")
              .eq("business_id", businessId)
              .gte("created_at", weekStart.toISOString())
              .limit(2000),
          ]);

        const databaseNotice = (error: {
          message?: string | null;
          code?: string | null;
        }): Notice =>
          isMissingTableError(error.message)
            ? { key: "reports.errorSetup" }
            : {
                key: "reports.errorLoad",
                variables: { detail: safeErrorDetail(error, locale) },
              };

        const firstLoadError = [
          salesResult.error,
          expensesResult.error,
          purchasesResult.error,
          weekSalesResult.error,
        ].find(Boolean);

        if (firstLoadError) {
          setUnavailable(true);
          setError(databaseNotice(firstLoadError));
        }

        const periodSales = (salesResult.data ?? []) as SaleRow[];
        setSales(periodSales);
        setExpenses(
          expensesResult.error
            ? []
            : ((expensesResult.data ?? []) as ExpenseRow[])
        );
        setPurchases(
          purchasesResult.error
            ? []
            : ((purchasesResult.data ?? []) as PurchaseRow[])
        );

        let laterError: { message?: string | null; code?: string | null } | null =
          null;

        if (periodSales.length > 0) {
          const collectedItems: ItemRow[] = [];
          const saleIds = periodSales.map((sale) => sale.id);

          // PostgREST URLs have limits; query sale items in small batches.
          for (let index = 0; index < saleIds.length; index += 100) {
            const chunk = saleIds.slice(index, index + 100);

            const itemsResult = await supabase
              .from("sale_items")
              .select(
                "sale_id,product_name,quantity,unit_cost,unit_price,line_total"
              )
              .eq("business_id", businessId)
              .in("sale_id", chunk)
              .limit(8000);

            if (itemsResult.error) {
              laterError ??= itemsResult.error;
            } else {
              collectedItems.push(...((itemsResult.data ?? []) as ItemRow[]));
            }
          }

          setItems(collectedItems);
        } else {
          setItems([]);
        }

        const weekSales = (weekSalesResult.data ?? []) as {
          id: string;
          total: number;
          status: string;
          created_at: string;
        }[];

        const revenueMap = new Map<string, number>();

        weekSales
          .filter((sale) => sale.status === "completed")
          .forEach((sale) => {
            const key = localDayKey(new Date(sale.created_at));
            revenueMap.set(key, (revenueMap.get(key) ?? 0) + Number(sale.total));
          });

        const expenseMap = new Map<string, number>();

        const weekExpenseResult = await supabase
          .from("expenses")
          .select("amount,expense_date")
          .eq("business_id", businessId)
          .gte("expense_date", localDayString(weekStart))
          .limit(2000);

        if (weekExpenseResult.error) {
          laterError ??= weekExpenseResult.error;
        } else {
          ((weekExpenseResult.data ?? []) as {
            amount: number;
            expense_date: string;
          }[]).forEach((row) => {
            expenseMap.set(
              row.expense_date,
              (expenseMap.get(row.expense_date) ?? 0) + Number(row.amount)
            );
          });
        }

        if (laterError) {
          setUnavailable(true);
          if (!firstLoadError) setError(databaseNotice(laterError));
        }

        setWeekSeries(
          Array.from({ length: 7 }, (_, index) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - index));
            const key = localDayKey(date);

            return {
              key,
              label: date.toLocaleDateString(
                locale === "en" ? "en-TZ" : "sw-TZ",
                { weekday: "short" }
              ),
              revenue: revenueMap.get(key) ?? 0,
              expenses: expenseMap.get(key) ?? 0,
            };
          })
        );

        setLoading(false);
      });
    },
    [businessId, supabase, locale]
  );

  useEffect(() => {
    if (businessId) loadReports(period);
  }, [businessId, period, loadReports]);

  const metrics = useMemo(() => {
    const completed = sales.filter((sale) => sale.status === "completed");
    const completedIds = new Set(completed.map((sale) => sale.id));
    const validItems = items.filter((item) => completedIds.has(item.sale_id));

    const revenue = completed.reduce(
      (sum, sale) => sum + Number(sale.total),
      0
    );
    const collected = completed.reduce(
      (sum, sale) => sum + Number(sale.paid),
      0
    );
    const credit = completed.reduce(
      (sum, sale) => sum + Math.max(0, Number(sale.total) - Number(sale.paid)),
      0
    );
    const cogs = validItems.reduce(
      (sum, item) => sum + Number(item.unit_cost) * Number(item.quantity),
      0
    );
    const gross = revenue - cogs;
    const expenseTotal = expenses.reduce(
      (sum, item) => sum + Number(item.amount),
      0
    );
    const purchaseTotal = purchases
      .filter((purchase) => purchase.status !== "cancelled")
      .reduce((sum, purchase) => sum + Number(purchase.total), 0);
    const purchaseDebt = purchases
      .filter((purchase) => purchase.status !== "cancelled")
      .reduce(
        (sum, purchase) =>
          sum + Math.max(0, Number(purchase.total) - Number(purchase.paid)),
        0
      );

    return {
      revenue,
      collected,
      credit,
      cogs,
      gross,
      expenseTotal,
      net: gross - expenseTotal,
      purchaseTotal,
      purchaseDebt,
      transactions: completed.length,
      average: completed.length > 0 ? revenue / completed.length : 0,
      margin: revenue > 0 ? (gross / revenue) * 100 : 0,
      completed,
      validItems,
    };
  }, [sales, items, expenses, purchases]);

  const topProducts = useMemo(() => {
    const map = new Map<
      string,
      { name: string; quantity: number; revenue: number; cost: number }
    >();

    metrics.validItems.forEach((item) => {
      const current = map.get(item.product_name) ?? {
        name: item.product_name,
        quantity: 0,
        revenue: 0,
        cost: 0,
      };

      current.quantity += Number(item.quantity);
      current.revenue += Number(item.line_total);
      current.cost += Number(item.unit_cost) * Number(item.quantity);
      map.set(item.product_name, current);
    });

    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [metrics.validItems]);

  const expenseBreakdown = useMemo(() => {
    const map = new Map<string, number>();

    expenses.forEach((item) => {
      map.set(
        item.category || "Mengineyo",
        (map.get(item.category || "Mengineyo") ?? 0) + Number(item.amount)
      );
    });

    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();

    metrics.completed.forEach((sale) => {
      const key = sale.payment_method || "Cash";
      const current = map.get(key) ?? { count: 0, total: 0 };
      current.count += 1;
      current.total += Number(sale.total);
      map.set(key, current);
    });

    return Array.from(map.entries())
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.total - a.total);
  }, [metrics.completed]);

  const peak = Math.max(
    1,
    ...weekSeries.map((day) => Math.max(day.revenue, day.expenses))
  );

  function exportCsv() {
    const header = [
      t("reports.csv.receipt"),
      t("reports.csv.date"),
      t("reports.csv.total"),
      t("reports.csv.paid"),
      t("reports.csv.debt"),
      t("reports.csv.paymentMethod"),
      t("reports.csv.status"),
    ];

    const rows = sales.map((sale) => [
      sale.receipt_number,
      formatDateTime(sale.created_at, locale),
      Number(sale.total).toFixed(2),
      Number(sale.paid).toFixed(2),
      Math.max(0, Number(sale.total) - Number(sale.paid)).toFixed(2),
      sale.payment_method,
      sale.status,
    ]);

    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = t("reports.export.fileName", {
      period: period.toLowerCase(),
      date: localDayString(new Date()),
    });
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell
      title={t("pages.reports")}
      subtitle={workspace?.business_name}
      actions={
        <>
          <button
            onClick={() => loadReports(period)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} /> {t("common.refresh")}
          </button>
          {mayView && (
            <>
              <button
                onClick={exportCsv}
                disabled={sales.length === 0}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Download size={16} /> CSV
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
              >
                <Printer size={16} /> {t("reports.action.print")}
              </button>
            </>
          )}
        </>
      }
    >
      {!mayView ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle size={18} /> {t("common.noPermission")}
          </div>
          <p className="mt-2">{t("reports.permission.description")}</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>{t(error.key, error.variables)}</span>
            </div>
          )}

          <div className="mb-5 flex flex-wrap gap-2">
            {PERIODS.map((value) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                  period === value
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {reportPeriodLabel(value, t)}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500">
              <Loader2 className="animate-spin" size={18} /> {t("reports.loading")}
            </div>
          ) : unavailable ? (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>{t("reports.unavailable")}</span>
            </div>
          ) : (
            <>
              <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-500">
                      {t("common.sales")}
                    </p>
                    <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
                      <ShoppingCart size={19} />
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold">
                    {money(metrics.revenue)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {t("reports.metric.receiptsAverage", {
                      count: metrics.transactions,
                      amount: money(metrics.average),
                    })}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-500">
                      {t("reports.metric.grossProfit")}
                    </p>
                    <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
                      <TrendingUp size={19} />
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold">
                    {money(metrics.gross)}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                    <Percent size={11} />{" "}
                    {t("reports.metric.percentOfSales", {
                      percent: metrics.margin.toFixed(1),
                    })}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-500">
                      {t("common.expenses")}
                    </p>
                    <span className="rounded-xl bg-orange-50 p-2.5 text-orange-600">
                      <Wallet size={19} />
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold">
                    {money(metrics.expenseTotal)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {t("reports.metric.operatingCosts")}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-500">
                      {t("reports.metric.netProfit")}
                    </p>
                    <span
                      className={`rounded-xl p-2.5 ${
                        metrics.net >= 0
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-red-50 text-red-600"
                      }`}
                    >
                      <BarChart3 size={19} />
                    </span>
                  </div>
                  <p
                    className={`mt-3 text-2xl font-extrabold ${
                      metrics.net >= 0 ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    {money(metrics.net)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {t("reports.metric.grossMinusExpenses")}
                  </p>
                </div>
              </div>

              <div className="mb-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-medium text-slate-500">
                    {t("reports.metric.cogs")}
                  </p>
                  <p className="mt-1 text-lg font-extrabold">
                    {money(metrics.cogs)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-medium text-slate-500">
                    {t("reports.metric.creditSales")}
                  </p>
                  <p className="mt-1 text-lg font-extrabold text-orange-600">
                    {money(metrics.credit)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-medium text-slate-500">
                    {t("reports.metric.purchases")}
                  </p>
                  <p className="mt-1 text-lg font-extrabold">
                    {money(metrics.purchaseTotal)}{" "}
                    <span className="text-xs font-semibold text-orange-600">
                      {t("reports.metric.purchaseDebt", {
                        amount: money(metrics.purchaseDebt),
                      })}
                    </span>
                  </p>
                </div>
              </div>

              <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="font-bold">{t("reports.chart.title")}</h2>
                    <p className="text-xs text-slate-500">
                      {t("reports.chart.subtitle")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />{" "}
                      {t("common.sales")}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-sm bg-orange-300" />{" "}
                      {t("common.expenses")}
                    </span>
                  </div>
                </div>

                <div className="flex h-48 items-end justify-between gap-2">
                  {weekSeries.map((day) => (
                    <div
                      key={day.key}
                      className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                    >
                      <div className="flex h-full w-full items-end justify-center gap-1">
                        <div
                          className="w-1/2 max-w-6 rounded-t bg-emerald-500"
                          style={{
                            height: `${Math.max(
                              2,
                              (day.revenue / peak) * 100
                            )}%`,
                          }}
                          title={t("reports.chart.salesTooltip", {
                            amount: money(day.revenue),
                          })}
                        />
                        <div
                          className="w-1/2 max-w-6 rounded-t bg-orange-300"
                          style={{
                            height: `${Math.max(
                              2,
                              (day.expenses / peak) * 100
                            )}%`,
                          }}
                          title={t("reports.chart.expensesTooltip", {
                            amount: money(day.expenses),
                          })}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {day.label}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <div className="grid gap-5 xl:grid-cols-2">
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 p-5">
                    <div>
                      <h2 className="font-bold">{t("reports.topProducts.title")}</h2>
                      <p className="text-xs text-slate-500">
                        {t("reports.topProducts.subtitle")}
                      </p>
                    </div>
                    <Receipt className="text-emerald-600" size={19} />
                  </div>

                  {topProducts.length === 0 ? (
                    <p className="p-5 text-sm text-slate-500">
                      {t("reports.topProducts.empty")}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500">
                          <tr>
                            <th className="px-5 py-3">
                              {t("reports.table.product")}
                            </th>
                            <th className="px-5 py-3">
                              {t("reports.table.quantity")}
                            </th>
                            <th className="px-5 py-3">{t("common.sales")}</th>
                            <th className="px-5 py-3">
                              {t("reports.table.profit")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {topProducts.map((product) => (
                            <tr
                              key={product.name}
                              className="border-t border-slate-100"
                            >
                              <td className="px-5 py-3 font-semibold">
                                {product.name}
                              </td>
                              <td className="px-5 py-3 text-slate-600">
                                {product.quantity}
                              </td>
                              <td className="px-5 py-3">
                                {money(product.revenue)}
                              </td>
                              <td
                                className={`px-5 py-3 font-semibold ${
                                  product.revenue - product.cost >= 0
                                    ? "text-emerald-600"
                                    : "text-red-600"
                                }`}
                              >
                                {money(product.revenue - product.cost)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <div className="space-y-5">
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="font-bold">
                      {t("reports.expenseByCategory.title")}
                    </h2>

                    {expenseBreakdown.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">
                        {t("reports.expenseByCategory.empty")}
                      </p>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {expenseBreakdown.map((item) => (
                          <div key={item.name}>
                            <div className="mb-1 flex justify-between text-xs">
                              <span className="font-semibold">
                                {expenseCategoryLabel(item.name, t)}
                              </span>
                              <span className="font-bold">
                                {money(item.total)}
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-orange-400"
                                style={{
                                  width: `${
                                    metrics.expenseTotal > 0
                                      ? (item.total / metrics.expenseTotal) * 100
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="font-bold">{t("reports.paymentMethods.title")}</h2>

                    {paymentBreakdown.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">
                        {t("reports.paymentMethods.empty")}
                      </p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {paymentBreakdown.map((item) => (
                          <div
                            key={item.name}
                            className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-xs"
                          >
                            <span className="font-semibold">
                              {paymentMethodLabel(item.name, t)}
                            </span>
                            <span className="text-slate-500">
                              {t("reports.paymentMethods.receipts", {
                                count: item.count,
                              })}
                            </span>
                            <span className="font-bold">
                              {money(item.total)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </div>

              <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 p-5">
                  <div>
                    <h2 className="font-bold">
                      {t("reports.transactions.title")}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {t("reports.transactions.records", { count: sales.length })}
                    </p>
                  </div>
                  <Truck className="text-slate-400" size={19} />
                </div>

                {sales.length === 0 ? (
                  <p className="p-5 text-sm text-slate-500">
                    {t("reports.transactions.empty")}
                  </p>
                ) : (
                  <div className="max-h-[420px] overflow-auto">
                    <table className="w-full min-w-[680px] text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                        <tr>
                          <th className="px-5 py-3">{t("reports.table.receipt")}</th>
                          <th className="px-5 py-3">{t("reports.table.date")}</th>
                          <th className="px-5 py-3">{t("reports.table.total")}</th>
                          <th className="px-5 py-3">{t("reports.table.paid")}</th>
                          <th className="px-5 py-3">{t("reports.table.debt")}</th>
                          <th className="px-5 py-3">{t("reports.table.method")}</th>
                          <th className="px-5 py-3">{t("reports.table.status")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sales.map((sale) => (
                          <tr
                            key={sale.id}
                            className="border-t border-slate-100"
                          >
                            <td className="px-5 py-3 font-semibold">
                              {sale.receipt_number}
                            </td>
                            <td className="px-5 py-3 text-xs text-slate-500">
                              {formatDateTime(sale.created_at, locale)}
                            </td>
                            <td className="px-5 py-3 font-semibold">
                              {money(sale.total)}
                            </td>
                            <td className="px-5 py-3">{money(sale.paid)}</td>
                            <td className="px-5 py-3 text-orange-600">
                              {money(
                                Math.max(
                                  0,
                                  Number(sale.total) - Number(sale.paid)
                                )
                              )}
                            </td>
                            <td className="px-5 py-3 text-slate-600">
                              {paymentMethodLabel(sale.payment_method, t)}
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                  sale.status === "completed"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-red-50 text-red-700"
                                }`}
                              >
                                {saleStatusLabel(sale.status, t)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}

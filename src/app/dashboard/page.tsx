"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  Wallet,
  Package,
  Boxes,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ArrowUpRight,
  Receipt,
  Users,
  Truck,
} from "lucide-react";
import AppShell from "@/components/app-shell";
import {
  type Locale,
  type TranslationKey,
  saleStatusLabel,
  unitLabel,
  useI18n,
} from "@/lib/i18n";
import { useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { isMissingTableError, safeErrorDetail } from "@/lib/supabase/errors";
import {
  daysAgoISO,
  formatDateTime,
  money,
} from "@/lib/format";

type SaleRow = {
  id: string;
  receipt_number: string;
  total: number;
  paid: number;
  status: string;
  created_at: string;
};

type SaleItemRow = {
  sale_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
};

type ExpenseRow = {
  amount: number;
  expense_date: string;
};

type ProductRow = {
  id: string;
  name: string;
  quantity: number;
  buying_price: number;
  low_stock_level: number;
  unit: string | null;
};

type RecentSale = {
  id: string;
  receipt_number: string;
  total: number;
  paid: number;
  status: string;
  created_at: string;
  customers: { name: string } | null;
};

type Notice = {
  key: TranslationKey;
  variables?: Record<string, string | number>;
};

function dayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dayLabel(date: Date, locale: Locale) {
  return date.toLocaleDateString(locale === "en" ? "en-TZ" : "sw-TZ", {
    weekday: "short",
  });
}

export default function DashboardPage() {
  const { workspace, supabase } = useWorkspace();
  const { locale, t } = useI18n();

  const [sales, setSales] = useState<SaleRow[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItemRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [recent, setRecent] = useState<RecentSale[]>([]);
  const [receivables, setReceivables] = useState(0);
  const [weekSeries, setWeekSeries] = useState<
    { key: string; label: string; revenue: number }[]
  >([]);
  const [todayKey, setTodayKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<Notice | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const businessId = workspace?.business_id ?? "";
  const role = workspace?.role ?? null;

  const loadDashboard = useCallback(() => {
    if (!businessId) return Promise.resolve();

    // Keep state updates inside the async continuation so starting this loader
    // from an effect is not treated as a synchronous setState call.
    return Promise.resolve().then(async () => {
      setLoading(true);
      setWarning(null);
      setUnavailable(false);

      const weekStart = daysAgoISO(6);
      const weekStartDate = new Date();
      weekStartDate.setDate(weekStartDate.getDate() - 6);
      const weekStartDay = dayKey(weekStartDate);

      const [weekSalesResult, expensesResult, productsResult, recentResult, customersResult] =
        await Promise.all([
          supabase
            .from("sales")
            .select("id,receipt_number,total,paid,status,created_at")
            .eq("business_id", businessId)
            .gte("created_at", weekStart)
            .order("created_at", { ascending: false })
            .limit(1000),
          supabase
            .from("expenses")
            .select("amount,expense_date")
            .eq("business_id", businessId)
            .gte("expense_date", weekStartDay)
            .limit(1000),
          supabase
            .from("products")
            .select("id,name,quantity,buying_price,low_stock_level,unit")
            .eq("business_id", businessId)
            .limit(1000),
          supabase
            .from("sales")
            .select(
              "id,receipt_number,total,paid,status,created_at,customers(name)"
            )
            .eq("business_id", businessId)
            .order("created_at", { ascending: false })
            .limit(6),
          supabase
            .from("customers")
            .select("balance")
            .eq("business_id", businessId)
            .limit(1000),
        ]);

      const databaseNotice = (error: {
        message?: string | null;
        code?: string | null;
      }): Notice =>
        isMissingTableError(error.message)
          ? { key: "dashboard.warningModulesNotSetup" }
          : {
              key: "dashboard.warningStatsLoadFailed",
              variables: { detail: safeErrorDetail(error, locale) },
            };

      const firstLoadError = [
        weekSalesResult.error,
        expensesResult.error,
        productsResult.error,
        recentResult.error,
        customersResult.error,
      ].find(Boolean);

      if (firstLoadError) {
        setUnavailable(true);
        setWarning(databaseNotice(firstLoadError));
      }

      const weekSales = (weekSalesResult.data ?? []) as SaleRow[];
      setSales(weekSales);
      setExpenses((expensesResult.data ?? []) as ExpenseRow[]);
      setProducts((productsResult.data ?? []) as ProductRow[]);
      setRecent(
        recentResult.error
          ? []
          : ((recentResult.data ?? []) as unknown as RecentSale[])
      );
      setReceivables(
        customersResult.error
          ? 0
          : ((customersResult.data ?? []) as { balance: number }[]).reduce(
              (sum, item) => sum + Number(item.balance ?? 0),
              0
            )
      );

      const saleIds = weekSales.map((sale) => sale.id);

      let firstItemError: { message?: string | null; code?: string | null } | null =
        null;

      if (saleIds.length > 0) {
        const collectedItems: SaleItemRow[] = [];

        // PostgREST URLs have limits; query sale items in small batches.
        for (let index = 0; index < saleIds.length; index += 100) {
          const chunk = saleIds.slice(index, index + 100);

          const itemsResult = await supabase
            .from("sale_items")
            .select("sale_id,product_name,quantity,unit_cost,line_total")
            .eq("business_id", businessId)
            .in("sale_id", chunk)
            .limit(4000);

          if (itemsResult.error) {
            firstItemError ??= itemsResult.error;
          } else {
            collectedItems.push(...((itemsResult.data ?? []) as SaleItemRow[]));
          }
        }

        setSaleItems(collectedItems);
      } else {
        setSaleItems([]);
      }

      if (firstItemError) {
        setUnavailable(true);
        if (!firstLoadError) setWarning(databaseNotice(firstItemError));
      }

      const now = new Date();
      setTodayKey(dayKey(now));

      const revenueByDay = new Map<string, number>();

      weekSales
        .filter((sale) => sale.status === "completed")
        .forEach((sale) => {
          const key = dayKey(new Date(sale.created_at));
          revenueByDay.set(
            key,
            (revenueByDay.get(key) ?? 0) + Number(sale.total)
          );
        });

      setWeekSeries(
        Array.from({ length: 7 }, (_, index) => {
          const date = new Date();
          date.setDate(date.getDate() - (6 - index));
          const key = dayKey(date);

          return {
            key,
            label: dayLabel(date, locale),
            revenue: revenueByDay.get(key) ?? 0,
          };
        })
      );

      setLoading(false);
    });
  }, [businessId, locale, supabase]);

  useEffect(() => {
    if (businessId) loadDashboard();
  }, [businessId, loadDashboard]);

  const metrics = useMemo(() => {
    const todaySales = sales.filter(
      (sale) =>
        sale.status === "completed" &&
        dayKey(new Date(sale.created_at)) === todayKey
    );

    const todayIds = new Set(todaySales.map((sale) => sale.id));

    const revenue = todaySales.reduce(
      (sum, sale) => sum + Number(sale.total),
      0
    );
    const collected = todaySales.reduce(
      (sum, sale) => sum + Number(sale.paid),
      0
    );
    const credit = todaySales.reduce(
      (sum, sale) => sum + Math.max(0, Number(sale.total) - Number(sale.paid)),
      0
    );

    const cogs = saleItems
      .filter((item) => todayIds.has(item.sale_id))
      .reduce(
        (sum, item) => sum + Number(item.unit_cost) * Number(item.quantity),
        0
      );

    const todayExpenses = expenses
      .filter((item) => item.expense_date === todayKey)
      .reduce((sum, item) => sum + Number(item.amount), 0);

    const grossProfit = revenue - cogs;

    const activeProducts = products;
    const lowStock = activeProducts.filter(
      (product) =>
        Number(product.quantity) <= Number(product.low_stock_level ?? 5)
    );
    const inventoryValue = activeProducts.reduce(
      (sum, product) =>
        sum + Number(product.buying_price) * Number(product.quantity),
      0
    );

    // Best sellers inside the fetched window
    const completedIds = new Set(
      sales
        .filter((sale) => sale.status === "completed")
        .map((sale) => sale.id)
    );

    const bestMap = new Map<
      string,
      { name: string; quantity: number; revenue: number }
    >();

    saleItems
      .filter((item) => completedIds.has(item.sale_id))
      .forEach((item) => {
        const key = item.product_name;
        const current = bestMap.get(key) ?? {
          name: item.product_name,
          quantity: 0,
          revenue: 0,
        };

        current.quantity += Number(item.quantity);
        current.revenue += Number(item.line_total);
        bestMap.set(key, current);
      });

    const bestSellers = Array.from(bestMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    return {
      todaySales,
      revenue,
      collected,
      credit,
      cogs,
      todayExpenses,
      grossProfit,
      netProfit: grossProfit - todayExpenses,
      lowStock,
      inventoryValue,
      week: weekSeries,
      bestSellers,
      totalItems: activeProducts.reduce(
        (sum, product) => sum + Number(product.quantity),
        0
      ),
    };
  }, [sales, saleItems, expenses, products, todayKey, weekSeries]);

  const peakWeek = Math.max(
    1,
    ...metrics.week.map((day) => day.revenue)
  );

  return (
    <AppShell
      title={t("pages.dashboard")}
      subtitle={workspace?.business_name}
      actions={
        <button
          onClick={loadDashboard}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={16} /> {t("common.refresh")}
        </button>
      }
    >
      {warning && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{t(warning.key, warning.variables)}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500">
          <Loader2 className="animate-spin" size={18} /> {t("dashboard.loading")}
        </div>
      ) : unavailable ? (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{t("dashboard.unavailable")}</span>
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">
                  {t("dashboard.todaySales")}
                </p>
                <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
                  <ShoppingCart size={19} />
                </span>
              </div>
              <p className="mt-3 text-2xl font-extrabold">
                {money(metrics.revenue)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {t("dashboard.todaySalesDetail", {
                  count: metrics.todaySales.length,
                  amount: money(metrics.collected),
                })}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">
                  {t("dashboard.grossProfitToday")}
                </p>
                <span
                  className={`rounded-xl p-2.5 ${
                    metrics.grossProfit >= 0
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-orange-50 text-orange-600"
                  }`}
                >
                  {metrics.grossProfit >= 0 ? (
                    <TrendingUp size={19} />
                  ) : (
                    <TrendingDown size={19} />
                  )}
                </span>
              </div>
              <p
                className={`mt-3 text-2xl font-extrabold ${
                  metrics.grossProfit >= 0
                    ? "text-slate-900"
                    : "text-orange-600"
                }`}
              >
                {money(metrics.grossProfit)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {t("dashboard.grossProfitHint")}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">
                  {t("dashboard.expensesToday")}
                </p>
                <span className="rounded-xl bg-orange-50 p-2.5 text-orange-600">
                  <Wallet size={19} />
                </span>
              </div>
              <p className="mt-3 text-2xl font-extrabold">
                {money(metrics.todayExpenses)}
              </p>
              <p
                className={`mt-1 text-[11px] ${
                  metrics.netProfit >= 0
                    ? "text-emerald-600"
                    : "text-orange-600"
                }`}
              >
                {t("dashboard.netProfit", {
                  amount: money(metrics.netProfit),
                })}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">
                  {t("common.inventoryValue")}
                </p>
                <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
                  <Package size={19} />
                </span>
              </div>
              <p className="mt-3 text-2xl font-extrabold">
                {money(metrics.inventoryValue)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {t("dashboard.inventoryDetail", {
                  products: products.length,
                  units: metrics.totalItems,
                })}
              </p>
            </div>
          </div>

          <div className="mb-6 grid gap-5 xl:grid-cols-3">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="font-bold">{t("dashboard.salesTrend")}</h2>
                  <p className="text-xs text-slate-500">
                    {t("dashboard.lastSevenDays")}
                  </p>
                </div>
                <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-600">
                  {t("dashboard.thisWeek")}
                </span>
              </div>

              <div className="flex h-48 items-end justify-between gap-2">
                {metrics.week.map((day) => (
                  <div
                    key={day.key}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                    title={money(day.revenue)}
                  >
                    <span className="text-[9px] font-semibold text-slate-400">
                      {day.revenue > 0
                        ? Math.round(day.revenue / 1000) + "K"
                        : ""}
                    </span>
                    <div
                      className={`w-full max-w-10 rounded-t-lg ${
                        day.key === todayKey
                          ? "bg-emerald-500"
                          : "bg-emerald-200"
                      }`}
                      style={{
                        height: `${Math.max(
                          4,
                          (day.revenue / peakWeek) * 100
                        )}%`,
                      }}
                    />
                    <span className="text-[10px] text-slate-400">
                      {day.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                <span>
                  {t("dashboard.weekTotal", {
                    amount: money(
                      metrics.week.reduce((sum, day) => sum + day.revenue, 0)
                    ),
                  })}
                </span>
                <span>
                  {t("dashboard.creditSalesToday", {
                    amount: money(metrics.credit),
                  })}
                </span>
                <span>
                  {t("dashboard.customerDebt", { amount: money(receivables) })}
                </span>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-bold">{t("dashboard.lowStock")}</h2>
                  <p className="text-xs text-slate-500">
                    {t("dashboard.lowStockHint")}
                  </p>
                </div>
                <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">
                  {metrics.lowStock.length}
                </span>
              </div>

              {metrics.lowStock.length === 0 ? (
                <p className="rounded-xl bg-emerald-50 p-4 text-xs text-emerald-700">
                  {t("dashboard.lowStockEmpty")}
                </p>
              ) : (
                <div className="space-y-2">
                  {metrics.lowStock.slice(0, 5).map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5"
                    >
                      <span className="truncate text-xs font-semibold">
                        {product.name}
                      </span>
                      <span className="shrink-0 text-[11px] font-bold text-orange-600">
                        {Number(product.quantity)} {unitLabel(product.unit, t)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <Link
                  href="/inventory"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white"
                >
                  <Boxes size={14} /> {t("nav.inventory")}
                </Link>
                <Link
                  href="/purchases"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700"
                >
                  <Truck size={14} /> {t("dashboard.buyLink")}
                </Link>
              </div>
            </section>
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <div>
                  <h2 className="font-bold">{t("dashboard.recentSales")}</h2>
                  <p className="text-xs text-slate-500">
                    {t("dashboard.recentSalesHint")}
                  </p>
                </div>
                <Link
                  href="/sales"
                  className="flex items-center gap-1 text-xs font-bold text-emerald-600"
                >
                  {t("dashboard.viewAll")} <ArrowUpRight size={14} />
                </Link>
              </div>

              {recent.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">
                  {t("dashboard.noSalesYet")}{" "}
                  {can(role, "sales.use") && (
                    <Link
                      href="/sales"
                      className="font-semibold text-emerald-600"
                    >
                      {t("dashboard.recordFirstSale")}
                    </Link>
                  )}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="px-5 py-3">{t("common.receipt")}</th>
                        <th className="px-5 py-3">{t("common.customer")}</th>
                        <th className="px-5 py-3">{t("common.amount")}</th>
                        <th className="px-5 py-3">{t("common.time")}</th>
                        <th className="px-5 py-3">{t("common.status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((sale) => (
                        <tr key={sale.id} className="border-t border-slate-100">
                          <td className="px-5 py-3 font-semibold">
                            {sale.receipt_number}
                          </td>
                          <td className="px-5 py-3 text-slate-600">
                            {sale.customers?.name ?? t("common.walkInCustomer")}
                          </td>
                          <td className="px-5 py-3 font-semibold">
                            {money(sale.total)}
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-500">
                            {formatDateTime(sale.created_at, locale)}
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

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-bold">{t("dashboard.bestSellers")}</h2>
                  <p className="text-xs text-slate-500">
                    {t("dashboard.last7Days")}
                  </p>
                </div>
                <Receipt className="text-emerald-600" size={19} />
              </div>

              {metrics.bestSellers.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
                  {t("dashboard.noSalesDataYet")}
                </p>
              ) : (
                <div className="space-y-3">
                  {metrics.bestSellers.map((item, index) => (
                    <div key={item.name} className="flex items-center gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-[11px] font-extrabold text-emerald-700">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">
                          {item.name}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {t("dashboard.units", { count: item.quantity })}
                        </p>
                      </div>
                      <span className="text-[11px] font-bold">
                        {money(item.revenue)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-5 grid grid-cols-2 gap-2">
                <Link
                  href="/customers"
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white"
                >
                  <Users size={14} /> {t("nav.customers")}
                </Link>
                <Link
                  href="/reports"
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700"
                >
                  <TrendingUp size={14} /> {t("nav.reports")}
                </Link>
              </div>
            </section>
          </div>
        </>
      )}
    </AppShell>
  );
}

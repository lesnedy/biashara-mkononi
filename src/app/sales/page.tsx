"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  Receipt,
  CheckCircle2,
  X,
  Package,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Ban,
} from "lucide-react";
import AppShell from "@/components/app-shell";
import {
  type TranslationKey,
  paymentMethodLabel,
  productCategoryLabel,
  saleStatusLabel,
  unitLabel,
  useI18n,
} from "@/lib/i18n";
import { useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { isMissingTableError, safeErrorDetail } from "@/lib/supabase/errors";
import { formatDateTime, money } from "@/lib/format";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  selling_price: number;
  quantity: number;
  unit: string | null;
  is_archived?: boolean;
};

type CartLine = {
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  available: number;
};

type SaleRow = {
  id: string;
  receipt_number: string;
  total: number;
  paid: number;
  payment_method: string;
  status: string;
  created_at: string;
};

type Customer = {
  id: string;
  name: string;
};

type Notice = {
  key: TranslationKey;
  variables?: Record<string, string | number>;
};

const PAYMENT_METHODS = [
  { name: "Cash", icon: Banknote },
  { name: "M-Pesa", icon: Smartphone },
  { name: "Tigo Pesa", icon: Smartphone },
  { name: "Airtel Money", icon: Smartphone },
  { name: "Benki", icon: CreditCard },
];

const SETUP_NOTICE: Notice = { key: "sales.setupHint" };

export default function SalesPage() {
  const { workspace, supabase } = useWorkspace();
  const { locale, t } = useI18n();

  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Notice | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Zote");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState("Cash");
  const [paid, setPaid] = useState("");
  const [discount, setDiscount] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [completing, setCompleting] = useState(false);

  const [receipt, setReceipt] = useState<{
    receipt_number: string;
    total: number;
    paid: number;
    change: number;
    payment: string;
    items: CartLine[];
    at: string;
    customer: string;
  } | null>(null);

  const businessId = workspace?.business_id ?? "";
  const role = workspace?.role ?? null;
  const mayDiscount = can(role, "sales.discount");
  const mayCancel = can(role, "sales.cancel");

  const loadData = useCallback(async () => {
    if (!businessId) return;

    setLoading(true);
    setError(null);

    const productsResult = await supabase
      .from("products")
      .select("*")
      .eq("business_id", businessId)
      .order("name");

    if (productsResult.error) {
      setError(
        isMissingTableError(productsResult.error.message)
          ? SETUP_NOTICE
          : {
              key: "sales.errorLoadProducts",
              variables: {
                detail: safeErrorDetail(productsResult.error, locale),
              },
            }
      );
    } else {
      setProducts(
        ((productsResult.data ?? []) as Product[]).filter(
          (item) => !item.is_archived
        )
      );
    }

    const salesResult = await supabase
      .from("sales")
      .select(
        "id,receipt_number,total,paid,payment_method,status,created_at"
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(12);

    if (!salesResult.error) {
      setSales((salesResult.data ?? []) as SaleRow[]);
    }

    const customersResult = await supabase
      .from("customers")
      .select("id,name")
      .eq("business_id", businessId)
      .order("name");

    if (!customersResult.error) {
      setCustomers((customersResult.data ?? []) as Customer[]);
    }

    setLoading(false);
  }, [businessId, locale, supabase]);

  useEffect(() => {
    if (!businessId) return;

    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadData();
    });

    return () => {
      active = false;
    };
  }, [businessId, loadData]);

  const categories = useMemo(() => {
    const unique = new Set(
      products.map((item) => item.category || "Nyingine")
    );
    return ["Zote", ...Array.from(unique)];
  }, [products]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesTerm =
        !term ||
        product.name.toLowerCase().includes(term) ||
        (product.sku ?? "").toLowerCase().includes(term);

      const matchesCategory =
        category === "Zote" || (product.category || "Nyingine") === category;

      return matchesTerm && matchesCategory;
    });
  }, [products, search, category]);

  const subtotal = cart.reduce(
    (sum, line) => sum + line.unit_price * line.quantity,
    0
  );

  const discountValue = Math.min(
    Math.max(Number(discount) || 0, 0),
    subtotal
  );

  const total = Math.max(0, subtotal - discountValue);
  const paidValue = Number(paid) || 0;
  const change = Math.max(0, paidValue - total);
  const totalItems = cart.reduce((sum, line) => sum + line.quantity, 0);
  const creditSale = customerId !== "" && paidValue < total;

  function addToCart(product: Product) {
    setError(null);
    const available = Number(product.quantity) || 0;

    if (available <= 0) {
      setError({
        key: "sales.errorOutOfStock",
        variables: { product: product.name },
      });
      return;
    }

    setCart((current) => {
      const existing = current.find((line) => line.product_id === product.id);

      if (existing) {
        if (existing.quantity + 1 > available) {
          setError({
            key: "sales.errorInsufficientStock",
            variables: { product: product.name },
          });
          return current;
        }

        return current.map((line) =>
          line.product_id === product.id
            ? { ...line, quantity: line.quantity + 1 }
            : line
        );
      }

      return [
        ...current,
        {
          product_id: product.id,
          name: product.name,
          unit_price: Number(product.selling_price) || 0,
          quantity: 1,
          available,
        },
      ];
    });
  }

  function changeQuantity(productId: string, next: number) {
    const line = cart.find((item) => item.product_id === productId);
    if (!line) return;

    if (next <= 0) {
      setCart((current) =>
        current.filter((item) => item.product_id !== productId)
      );
      return;
    }

    if (next > line.available) {
      setError({
        key: "sales.errorInsufficientStock",
        variables: { product: line.name },
      });
      return;
    }

    setCart((current) =>
      current.map((item) =>
        item.product_id === productId ? { ...item, quantity: next } : item
      )
    );
  }

  async function completeSale() {
    setError(null);
    setNotice(null);

    if (!businessId) return;

    if (cart.length === 0) {
      setError({ key: "sales.errorEmptyCart" });
      return;
    }

    if (!creditSale && paidValue < total) {
      setError({ key: "sales.errorInsufficientPayment" });
      return;
    }

    setCompleting(true);

    const { data, error: saleError } = await supabase.rpc("complete_sale", {
      p_business_id: businessId,
      p_items: cart.map((line) => ({
        product_id: line.product_id,
        quantity: line.quantity,
      })),
      p_payment_method: payment,
      p_paid: paidValue,
      p_discount: discountValue,
      p_customer_id: customerId || null,
    });

    if (saleError) {
      const friendly: Notice =
        saleError.code === "PGRST202"
          ? SETUP_NOTICE
          : saleError.message.startsWith("INSUFFICIENT_STOCK")
            ? { key: "sales.errorRpcInsufficientStock" }
            : saleError.message.startsWith("INSUFFICIENT_PAYMENT")
              ? { key: "sales.errorPaymentShort" }
              : saleError.message.startsWith("NOT_ALLOWED")
                ? { key: "sales.errorNoPermissionComplete" }
                : saleError.message.startsWith("PRODUCT_NOT_FOUND")
                  ? { key: "sales.errorProductNotFound" }
                  : { key: "sales.errorCompleteFailed" };

      setError(friendly);
      setCompleting(false);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;

    const customerName =
      customers.find((item) => item.id === customerId)?.name ??
      t("common.walkInCustomer");

    setReceipt({
      receipt_number: row?.receipt_number ?? "-",
      total: Number(row?.total ?? total),
      paid: paidValue,
      change: Number(row?.change_due ?? change),
      payment,
      items: [...cart],
      at: new Date().toLocaleString(locale === "en" ? "en-TZ" : "sw-TZ"),
      customer: customerName,
    });

    setCart([]);
    setPaid("");
    setDiscount("");
    setCustomerId("");
    setCompleting(false);

    await loadData();
  }

  async function cancelSale(sale: SaleRow) {
    if (!mayCancel) {
      setError({ key: "sales.errorNoPermissionCancel" });
      return;
    }

    const reason = window.prompt(
      t("sales.cancelReasonPrompt", { receipt: sale.receipt_number })
    );

    if (reason === null) return;

    const { error: cancelError } = await supabase.rpc("cancel_sale", {
      p_sale_id: sale.id,
      p_reason: reason || null,
    });

    if (cancelError) {
      setError(
        cancelError.code === "PGRST202"
          ? SETUP_NOTICE
          : {
              key: "sales.errorCancelFailed",
              variables: { detail: safeErrorDetail(cancelError, locale) },
            }
      );
      return;
    }

    setNotice({
      key: "sales.noticeCancelled",
      variables: { receipt: sale.receipt_number },
    });
    await loadData();
  }

  return (
    <AppShell
      title={t("pages.sales")}
      subtitle={workspace?.business_name}
      actions={
        <>
          <button
            onClick={loadData}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} /> {t("common.refresh")}
          </button>
          <div className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">
            <ShoppingCart size={16} />{" "}
            {t("sales.itemsCount", { count: totalItems })}
          </div>
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

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold">{t("sales.selectProducts")}</h2>
            <div className="relative w-full sm:w-72">
              <Search
                size={17}
                className="absolute left-3 top-3 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("sales.searchPlaceholder")}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                  category === item
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {productCategoryLabel(item, t)}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 rounded-2xl bg-white p-10 text-sm text-slate-500">
              <Loader2 className="animate-spin" size={18} /> {t("sales.loading")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              {t("sales.noProductsFound")}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((product) => {
                const inCart = cart.find(
                  (line) => line.product_id === product.id
                );
                const qty = Number(product.quantity) || 0;

                return (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    disabled={qty <= 0}
                    className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                        <Package size={19} />
                      </span>
                      {inCart && (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                          {t("sales.inCart", { count: inCart.quantity })}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold leading-snug">
                      {product.name}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {product.sku || t("common.noSku")}
                    </p>
                    <p className="mt-3 text-base font-extrabold text-emerald-600">
                      {money(product.selling_price)}
                    </p>
                    <p
                      className={`mt-1 text-[11px] ${
                        qty <= 5 ? "text-orange-600" : "text-slate-400"
                      }`}
                    >
                      {t("sales.stockLabel", {
                        qty,
                        unit: unitLabel(product.unit, t),
                      })}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h2 className="font-bold">{t("sales.recentSales")}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {t("sales.recentSalesHint")}
              </p>
            </div>

            {sales.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">
                {t("sales.noSalesRecorded")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-5 py-3">{t("common.receipt")}</th>
                      <th className="px-5 py-3">{t("common.total")}</th>
                      <th className="px-5 py-3">{t("common.payment")}</th>
                      <th className="px-5 py-3">{t("common.time")}</th>
                      <th className="px-5 py-3">{t("common.status")}</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale) => (
                      <tr key={sale.id} className="border-t border-slate-100">
                        <td className="px-5 py-3 font-semibold">
                          {sale.receipt_number}
                        </td>
                        <td className="px-5 py-3 font-semibold">
                          {money(sale.total)}
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          {paymentMethodLabel(sale.payment_method, t)}
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
                        <td className="px-5 py-3 text-right">
                          {sale.status === "completed" && mayCancel && (
                            <button
                              onClick={() => cancelSale(sale)}
                              className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                              title={t("sales.cancelSale")}
                            >
                              <Ban size={16} />
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
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-24">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold">{t("sales.cartTitle")}</h2>
              <p className="text-xs text-slate-500">
                {t("sales.itemsSelected", { count: totalItems })}
              </p>
            </div>
            <ShoppingCart className="text-emerald-600" size={21} />
          </div>

          <div className="max-h-[300px] space-y-3 overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <div className="py-10 text-center">
                <ShoppingCart size={30} className="mx-auto text-slate-200" />
                <p className="mt-3 text-sm font-semibold text-slate-500">
                  {t("sales.cartEmpty")}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {t("sales.cartEmptyHint")}
                </p>
              </div>
            ) : (
              cart.map((line) => (
                <div
                  key={line.product_id}
                  className="rounded-xl border border-slate-100 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {line.name}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {money(line.unit_price)} × {line.quantity}
                      </p>
                    </div>
                    <p className="text-sm font-bold">
                      {money(line.unit_price * line.quantity)}
                    </p>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          changeQuantity(line.product_id, line.quantity - 1)
                        }
                        className="rounded-lg bg-slate-100 p-1.5 hover:bg-slate-200"
                      >
                        <Minus size={13} />
                      </button>
                      <span className="min-w-6 text-center text-sm font-bold">
                        {line.quantity}
                      </span>
                      <button
                        onClick={() =>
                          changeQuantity(line.product_id, line.quantity + 1)
                        }
                        className="rounded-lg bg-slate-100 p-1.5 hover:bg-slate-200"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    <button
                      onClick={() => changeQuantity(line.product_id, 0)}
                      className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div className="flex justify-between text-sm text-slate-500">
              <span>{t("sales.subtotal")}</span>
              <span>{money(subtotal)}</span>
            </div>

            {mayDiscount && (
              <label className="block text-sm font-semibold text-slate-700">
                {t("sales.discount")}
                <input
                  type="number"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-emerald-500"
                />
              </label>
            )}

            <div className="flex items-center justify-between">
              <span className="font-bold">{t("common.total")}</span>
              <span className="text-xl font-extrabold text-emerald-600">
                {money(total)}
              </span>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">
                {t("sales.paymentMethod")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((method) => {
                  const Icon = method.icon;
                  return (
                    <button
                      key={method.name}
                      onClick={() => {
                        setPayment(method.name);
                        if (method.name !== "Cash") {
                          setPaid(String(total));
                        }
                      }}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-[11px] font-semibold ${
                        payment === method.name
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 text-slate-600"
                      }`}
                    >
                      <Icon size={14} /> {paymentMethodLabel(method.name, t)}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block text-sm font-semibold text-slate-700">
              {t("sales.paidByCustomer")}
              <input
                type="number"
                min="0"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                placeholder={String(total)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500"
              />
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              {t("sales.customerOptional")}
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500"
              >
                <option value="">{t("common.walkInCustomer")}</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex justify-between rounded-xl bg-emerald-50 p-3 text-sm">
              <span className="font-semibold text-slate-600">{t("sales.change")}</span>
              <span className="font-extrabold text-emerald-700">
                {money(change)}
              </span>
            </div>

            {creditSale && (
              <p className="rounded-lg bg-amber-50 p-2.5 text-[11px] text-amber-800">
                {t("sales.creditNotice", {
                  amount: money(total - paidValue),
                })}
              </p>
            )}

            <button
              onClick={completeSale}
              disabled={completing || cart.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {completing ? (
                <>
                  <Loader2 className="animate-spin" size={18} />{" "}
                  {t("sales.completing")}
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} /> {t("sales.completeSale")}
                </>
              )}
            </button>
          </div>
        </aside>
      </div>

      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold">{t("sales.receiptTitle")}</h2>
              <button
                onClick={() => setReceipt(null)}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="border border-dashed border-slate-300 p-5">
              <div className="text-center">
                <h3 className="text-lg font-extrabold text-emerald-700">
                  {workspace?.business_name ?? t("brand.name")}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {t("sales.receiptSubtitle")}
                </p>
              </div>

              <div className="my-4 border-y border-dashed border-slate-300 py-3 text-[11px] text-slate-600">
                <p>
                  {t("sales.receiptNumberLabel")}
                  {receipt.receipt_number}
                </p>
                <p className="mt-1">{t("common.date")}: {receipt.at}</p>
                <p className="mt-1">{t("common.customer")}: {receipt.customer}</p>
                <p className="mt-1">
                  {t("sales.receiptPaymentLabel")}
                  {paymentMethodLabel(receipt.payment, t)}
                </p>
              </div>

              {receipt.items.map((item) => (
                <div
                  key={item.product_id}
                  className="mb-2 flex justify-between gap-2 text-xs"
                >
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <b>{money(item.unit_price * item.quantity)}</b>
                </div>
              ))}

              <div className="mt-3 space-y-1.5 border-t border-dashed border-slate-300 pt-3 text-sm">
                <div className="flex justify-between font-extrabold">
                  <span>{t("common.total")}</span>
                  <span>{money(receipt.total)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>{t("sales.receiptPaid")}</span>
                  <span>{money(receipt.paid)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-emerald-700">
                  <span>{t("sales.change")}</span>
                  <span>{money(receipt.change)}</span>
                </div>
              </div>

              <p className="mt-5 text-center text-[11px] text-slate-500">
                {t("sales.receiptThanks")}
              </p>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => window.print()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700"
              >
                <Receipt size={17} /> {t("sales.print")}
              </button>
              <button
                onClick={() => setReceipt(null)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold"
              >
                {t("shell.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

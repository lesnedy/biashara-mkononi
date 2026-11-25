"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Truck,
  Plus,
  Search,
  X,
  Package,
  Wallet,
  CalendarDays,
  CheckCircle2,
  Clock,
  Trash2,
  Eye,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import AppShell from "@/components/app-shell";
import {
  purchaseStatusLabel,
  useI18n,
  type TranslationKey,
} from "@/lib/i18n";
import { useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { isMissingTableError, safeErrorDetail } from "@/lib/supabase/errors";
import { formatDate, money, todayISO } from "@/lib/format";

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  location: string | null;
  balance: number;
};

type Purchase = {
  id: string;
  reference: string;
  purchase_date: string;
  total: number;
  paid: number;
  status: string;
  supplier_id: string | null;
  suppliers: { name: string } | null;
};

type Product = {
  id: string;
  name: string;
  buying_price: number;
};

type Line = {
  key: string;
  product_id: string;
  description: string;
  quantity: string;
  unit_price: string;
};

type Notice = {
  key: TranslationKey;
  variables?: Record<string, string | number>;
};

let lineCounter = 0;

function newLine(): Line {
  lineCounter += 1;

  return {
    key: `line-${lineCounter}`,
    product_id: "",
    description: "",
    quantity: "1",
    unit_price: "",
  };
}

const STATUS_FILTERS = [
  { value: "all", label: "common.all" },
  { value: "paid", label: "purchaseStatus.paid" },
  { value: "partial", label: "purchaseStatus.partial" },
  { value: "pending", label: "purchaseStatus.pending" },
] as const;

export default function PurchasesPage() {
  const { workspace, supabase } = useWorkspace();
  const { locale, t } = useI18n();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Notice | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(
    null
  );

  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [note, setNote] = useState("");
  const [paid, setPaid] = useState("0");
  const [lines, setLines] = useState<Line[]>([newLine()]);

  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierLocation, setSupplierLocation] = useState("");

  const businessId = workspace?.business_id ?? "";
  const mayManage = can(workspace?.role, "purchases.manage");
  const mayDelete =
    workspace?.role === "owner" || workspace?.role === "admin";

  useEffect(() => {
    if (purchaseDate) return;

    let active = true;
    void Promise.resolve().then(() => {
      if (active) setPurchaseDate(todayISO());
    });

    return () => {
      active = false;
    };
  }, [purchaseDate]);

  const loadData = useCallback(async () => {
    if (!businessId) return;

    setLoading(true);
    setError(null);

    const suppliersResult = await supabase
      .from("suppliers")
      .select("id,name,phone,location,balance")
      .eq("business_id", businessId)
      .order("name");

    if (!suppliersResult.error) {
      setSuppliers((suppliersResult.data ?? []) as Supplier[]);
    }

    const purchasesResult = await supabase
      .from("purchases")
      .select(
        "id,reference,purchase_date,total,paid,status,supplier_id,suppliers(name)"
      )
      .eq("business_id", businessId)
      .order("purchase_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (purchasesResult.error) {
      setError(
        isMissingTableError(purchasesResult.error.message)
          ? { key: "purchases.errorModuleMissing" }
          : {
              key: "purchases.errorLoad",
              variables: {
                detail: safeErrorDetail(purchasesResult.error, locale),
              },
            }
      );
    } else {
      setPurchases((purchasesResult.data ?? []) as unknown as Purchase[]);
    }

    const productsResult = await supabase
      .from("products")
      .select("id,name,buying_price")
      .eq("business_id", businessId)
      .order("name");

    if (!productsResult.error) {
      setProducts((productsResult.data ?? []) as Product[]);
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

  const totals = useMemo(() => {
    const total = purchases.reduce((sum, item) => sum + Number(item.total), 0);
    const paidTotal = purchases.reduce(
      (sum, item) => sum + Number(item.paid),
      0
    );

    return { total, paid: paidTotal, debt: total - paidTotal };
  }, [purchases]);

  const formTotal = lines.reduce(
    (sum, line) =>
      sum +
      (Number(line.quantity) || 0) * (Number(line.unit_price) || 0),
    0
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return purchases.filter((item) => {
      const matchesTerm =
        !term ||
        item.reference.toLowerCase().includes(term) ||
        (item.suppliers?.name ?? "").toLowerCase().includes(term);

      const matchesStatus = filter === "all" || item.status === filter;

      return matchesTerm && matchesStatus;
    });
  }, [purchases, search, filter]);

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line))
    );
  }

  function resetPurchaseForm() {
    setSupplierId("");
    setPurchaseDate(todayISO());
    setNote("");
    setPaid("0");
    setLines([newLine()]);
    setShowPurchaseForm(false);
  }

  async function savePurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const items = lines
      .map((line) => ({
        product_id: line.product_id || null,
        description:
          line.description.trim() ||
          products.find((product) => product.id === line.product_id)?.name ||
          "Bidhaa",
        quantity: Number(line.quantity) || 0,
        unit_price: Number(line.unit_price) || 0,
      }))
      .filter((line) => line.quantity > 0 && line.unit_price >= 0);

    if (items.length === 0) {
      setError({ key: "purchases.errorAddOneItem" });
      return;
    }

    setSaving(true);

    const { error: purchaseError } = await supabase.rpc("record_purchase", {
      p_business_id: businessId,
      p_supplier_id: supplierId || null,
      p_items: items,
      p_paid: Number(paid) || 0,
      p_purchase_date: purchaseDate || todayISO(),
      p_note: note.trim() || null,
    });

    if (purchaseError) {
      setError(
        purchaseError.code === "PGRST202"
          ? { key: "purchases.errorModuleMissingShort" }
          : {
              key: "purchases.errorSave",
              variables: { detail: safeErrorDetail(purchaseError, locale) },
            }
      );
      setSaving(false);
      return;
    }

    setNotice({ key: "purchases.noticeSaved" });
    resetPurchaseForm();
    await loadData();
    setSaving(false);
  }

  async function saveSupplier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supplierName.trim()) {
      setError({ key: "purchases.errorSupplierNameRequired" });
      return;
    }

    const { error: insertError } = await supabase.from("suppliers").insert({
      business_id: businessId,
      name: supplierName.trim(),
      phone: supplierPhone.trim() || null,
      location: supplierLocation.trim() || null,
    });

    if (insertError) {
      setError({
        key: "purchases.errorSaveSupplier",
        variables: { detail: safeErrorDetail(insertError, locale) },
      });
      return;
    }

    setSupplierName("");
    setSupplierPhone("");
    setSupplierLocation("");
    setShowSupplierForm(false);
    setNotice({ key: "purchases.noticeSupplierAdded" });
    await loadData();
  }

  async function recordPayment(purchase: Purchase) {
    const remaining = Number(purchase.total) - Number(purchase.paid);

    const input = window.prompt(
      t("purchases.promptRecordPayment", { amount: money(remaining) })
    );

    if (input === null || input.trim() === "") return;

    const amount = Number(input);

    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
      setError({ key: "purchases.errorInvalidPayment" });
      return;
    }

    const { error: paymentError } = await supabase.rpc(
      "record_supplier_payment",
      {
        p_purchase_id: purchase.id,
        p_amount: amount,
        p_payment_method: "Cash",
        p_note: null,
      }
    );

    if (paymentError) {
      setError({
        key: "purchases.errorPayment",
        variables: { detail: safeErrorDetail(paymentError, locale) },
      });
      return;
    }

    setNotice({ key: "purchases.noticePaymentRecorded" });
    await loadData();
  }

  async function deletePurchase(purchase: Purchase) {
    if (!window.confirm(t("purchases.confirmDelete"))) return;

    const { error: deleteError } = await supabase
      .from("purchases")
      .delete()
      .eq("id", purchase.id)
      .eq("business_id", businessId);

    if (deleteError) {
      setError({
        key: "purchases.errorDelete",
        variables: { message: safeErrorDetail(deleteError, locale) },
      });
      return;
    }

    setNotice({ key: "purchases.noticeDeleted" });
    await loadData();
  }

  return (
    <AppShell
      title={t("pages.purchases")}
      subtitle={workspace?.business_name}
      actions={
        <>
          <button
            onClick={loadData}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} /> {t("common.refresh")}
          </button>
          {mayManage && (
            <>
              <button
                onClick={() => setShowSupplierForm(true)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t("purchases.actions.addSupplier")}
              </button>
              <button
                onClick={() => setShowPurchaseForm(true)}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
              >
                <Plus size={17} /> {t("purchases.actions.record")}
              </button>
            </>
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

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Package className="text-emerald-600" size={21} />
          <p className="mt-3 text-xs font-medium text-slate-500">
            {t("purchases.total")}
          </p>
          <p className="mt-1 text-xl font-extrabold">{money(totals.total)}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <CheckCircle2 className="text-emerald-600" size={21} />
          <p className="mt-3 text-xs font-medium text-slate-500">
            {t("purchases.stats.paid")}
          </p>
          <p className="mt-1 text-xl font-extrabold">{money(totals.paid)}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Clock className="text-orange-500" size={21} />
          <p className="mt-3 text-xs font-medium text-slate-500">
            {t("purchases.stats.supplierDebts")}
          </p>
          <p className="mt-1 text-xl font-extrabold text-orange-600">
            {money(totals.debt)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Truck className="text-blue-600" size={21} />
          <p className="mt-3 text-xs font-medium text-slate-500">
            {t("purchases.suppliers.title")}
          </p>
          <p className="mt-1 text-xl font-extrabold">{suppliers.length}</p>
        </div>
      </div>

      {showSupplierForm && (
        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">
              {t("purchases.suppliers.formTitle")}
            </h2>
            <button
              onClick={() => setShowSupplierForm(false)}
              className="rounded-lg p-2 hover:bg-slate-100"
            >
              <X size={19} />
            </button>
          </div>

          <form onSubmit={saveSupplier} className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-semibold text-slate-700">
              {t("common.name")}
              <input
                required
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              {t("common.phone")}
              <input
                value={supplierPhone}
                onChange={(e) => setSupplierPhone(e.target.value)}
                placeholder={t("customers.form.phonePlaceholder")}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              {t("purchases.suppliers.location")}
              <input
                value={supplierLocation}
                onChange={(e) => setSupplierLocation(e.target.value)}
                placeholder={t("purchases.suppliers.locationPlaceholder")}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
              />
            </label>
            <div className="sm:col-span-3">
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
              >
                {t("purchases.suppliers.save")}
              </button>
            </div>
          </form>
        </section>
      )}

      {showPurchaseForm && (
        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold">{t("purchases.form.title")}</h2>
              <p className="text-xs text-slate-500">
                {t("purchases.form.description")}
              </p>
            </div>
            <button
              onClick={resetPurchaseForm}
              className="rounded-lg p-2 hover:bg-slate-100"
            >
              <X size={19} />
            </button>
          </div>

          <form onSubmit={savePurchase}>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="text-sm font-semibold text-slate-700">
                {t("common.supplier")}
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500"
                >
                  <option value="">{t("purchases.form.noSupplier")}</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("common.date")}
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("purchases.form.paidAmount")}
                <input
                  type="number"
                  min="0"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>
            </div>

            <div className="mt-5 space-y-3">
              {lines.map((line) => (
                <div
                  key={line.key}
                  className="grid gap-3 rounded-xl border border-slate-100 p-3 sm:grid-cols-12"
                >
                  <label className="text-xs font-semibold text-slate-600 sm:col-span-4">
                    {t("common.product")}
                    <select
                      value={line.product_id}
                      onChange={(e) => {
                        const product = products.find(
                          (item) => item.id === e.target.value
                        );
                        updateLine(line.key, {
                          product_id: e.target.value,
                          description: product?.name ?? line.description,
                          unit_price: product
                            ? String(product.buying_price)
                            : line.unit_price,
                        });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"
                    >
                      <option value="">{t("purchases.form.newItem")}</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-semibold text-slate-600 sm:col-span-3">
                    {t("common.notes")}
                    <input
                      value={line.description}
                      onChange={(e) =>
                        updateLine(line.key, { description: e.target.value })
                      }
                      placeholder={t("purchases.form.itemPlaceholder")}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
                    />
                  </label>

                  <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                    {t("common.quantity")}
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(line.key, { quantity: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
                    />
                  </label>

                  <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                    {t("purchases.form.unitPrice")}
                    <input
                      type="number"
                      min="0"
                      value={line.unit_price}
                      onChange={(e) =>
                        updateLine(line.key, { unit_price: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
                    />
                  </label>

                  <div className="flex items-end sm:col-span-1">
                    <button
                      type="button"
                      onClick={() =>
                        setLines((current) =>
                          current.length === 1
                            ? current
                            : current.filter((item) => item.key !== line.key)
                        )
                      }
                      className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setLines((current) => [...current, newLine()])}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Plus size={14} /> {t("purchases.form.addLine")}
            </button>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 p-4">
              <div>
                <p className="text-xs font-semibold text-slate-500">
                  {t("purchases.total")}
                </p>
                <p className="text-xl font-extrabold text-emerald-700">
                  {money(formTotal)}
                </p>
              </div>
              <p className="text-xs text-slate-600">
                {t("common.debtAmount", {
                  amount: money(Math.max(0, formTotal - (Number(paid) || 0))),
                })}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? t("common.saving") : t("purchases.form.save")}
              </button>
              <button
                type="button"
                onClick={resetPurchaseForm}
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
            <h2 className="font-bold">{t("purchases.history.title")}</h2>
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

            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"
            >
              {STATUS_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {t(item.label)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 p-6 text-sm text-slate-500">
            <Loader2 className="animate-spin" size={16} /> {t("common.loading")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {t("purchases.history.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3">{t("purchases.reference")}</th>
                  <th className="px-5 py-3">{t("common.supplier")}</th>
                  <th className="px-5 py-3">{t("common.date")}</th>
                  <th className="px-5 py-3">{t("common.total")}</th>
                  <th className="px-5 py-3">{t("purchaseStatus.paid")}</th>
                  <th className="px-5 py-3">{t("common.debt")}</th>
                  <th className="px-5 py-3">{t("common.status")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((purchase) => {
                  const remaining =
                    Number(purchase.total) - Number(purchase.paid);

                  return (
                    <tr
                      key={purchase.id}
                      className="border-t border-slate-100"
                    >
                      <td className="px-5 py-3 font-semibold">
                        {purchase.reference}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {purchase.suppliers?.name ?? "-"}
                      </td>
                      <td className="px-5 py-3 text-slate-500">
                        {formatDate(purchase.purchase_date, locale)}
                      </td>
                      <td className="px-5 py-3 font-semibold">
                        {money(purchase.total)}
                      </td>
                      <td className="px-5 py-3">{money(purchase.paid)}</td>
                      <td className="px-5 py-3 font-semibold text-orange-600">
                        {money(remaining)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            purchase.status === "paid"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-orange-50 text-orange-700"
                          }`}
                        >
                          {purchaseStatusLabel(purchase.status, t)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setSelectedPurchase(purchase)}
                            className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                            title={t("purchases.actions.view")}
                          >
                            <Eye size={16} />
                          </button>
                          {remaining > 0 && mayManage && (
                            <button
                              onClick={() => recordPayment(purchase)}
                              className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"
                              title={t("purchases.actions.recordPayment")}
                            >
                              <Wallet size={16} />
                            </button>
                          )}
                          {mayDelete && (
                            <button
                              onClick={() => deletePurchase(purchase)}
                              className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                              title={t("common.delete")}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-bold">{t("purchases.suppliers.title")}</h2>
        </div>

        {suppliers.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            {t("purchases.suppliers.empty")}
          </p>
        ) : (
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {suppliers.map((supplier) => (
              <div
                key={supplier.id}
                className="rounded-xl border border-slate-100 p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600">
                    <Truck size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold">{supplier.name}</p>
                    <p className="text-xs text-slate-500">
                      {supplier.location || t("purchases.suppliers.noLocation")}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex justify-between text-xs">
                  <span className="text-slate-500">
                    {supplier.phone || "-"}
                  </span>
                  <span
                    className={
                      Number(supplier.balance) > 0
                        ? "font-semibold text-orange-600"
                        : "text-slate-400"
                    }
                  >
                    {t("common.debtAmount", {
                      amount: money(supplier.balance),
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {t("purchases.details.title")}
              </h2>
              <button
                onClick={() => setSelectedPurchase(null)}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">
                  {t("purchases.reference")}
                </span>
                <b>{selectedPurchase.reference}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t("common.supplier")}</span>
                <b>{selectedPurchase.suppliers?.name ?? "-"}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t("common.date")}</span>
                <b>{formatDate(selectedPurchase.purchase_date, locale)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t("common.total")}</span>
                <b>{money(selectedPurchase.total)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  {t("purchaseStatus.paid")}
                </span>
                <b>{money(selectedPurchase.paid)}</b>
              </div>
              <div className="flex justify-between text-orange-600">
                <span>{t("common.debt")}</span>
                <b>
                  {money(
                    Number(selectedPurchase.total) -
                      Number(selectedPurchase.paid)
                  )}
                </b>
              </div>
            </div>

            <button
              onClick={() => setSelectedPurchase(null)}
              className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white"
            >
              {t("shell.close")}
            </button>
          </div>
        </div>
      )}

      <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
        <CalendarDays size={13} /> {t("purchases.footer")}
      </p>
    </AppShell>
  );
}

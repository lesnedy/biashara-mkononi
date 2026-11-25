"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Search,
  Plus,
  Package,
  Pencil,
  Trash2,
  Boxes,
  AlertTriangle,
  Tags,
  ShoppingBag,
  X,
  RefreshCw,
  Archive,
  ArchiveRestore,
  Loader2,
} from "lucide-react";
import AppShell from "@/components/app-shell";
import {
  type TranslationKey,
  productCategoryLabel,
  productStatusLabel,
  unitLabel,
  useI18n,
} from "@/lib/i18n";
import { useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { isMissingTableError, safeErrorDetail } from "@/lib/supabase/errors";
import { money } from "@/lib/format";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  unit: string | null;
  buying_price: number;
  selling_price: number;
  quantity: number;
  low_stock_level: number | null;
  is_archived: boolean;
};

type Notice = {
  key: TranslationKey;
  variables?: Record<string, string | number>;
};

const BASE_CATEGORIES = [
  "Vyakula",
  "Vinywaji",
  "Usafi",
  "Vipodozi",
  "Dawa",
  "Nyingine",
];

const UNITS = ["pcs", "kg", "g", "lita", "ml", "pakiti", "boksi", "dozen"];

const SETUP_NOTICE: Notice = { key: "products.setupHint" };

export default function ProductsPage() {
  const { workspace, supabase } = useWorkspace();
  const { locale, t } = useI18n();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Notice | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Zote");
  const [status, setStatus] = useState("Hai"); // Hai | Zilizowekwa kando | Zote
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Vyakula");
  const [unit, setUnit] = useState("pcs");
  const [buyingPrice, setBuyingPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [stock, setStock] = useState("");
  const [lowStockLevel, setLowStockLevel] = useState("5");

  const businessId = workspace?.business_id ?? "";
  const role = workspace?.role ?? null;
  const mayManage = can(role, "products.manage");
  const mayDelete = role === "owner" || role === "admin";

  const loadProducts = useCallback(async () => {
    if (!businessId) return;

    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from("products")
      .select(
        "id,name,sku,barcode,category,unit,buying_price,selling_price,quantity,low_stock_level,is_archived"
      )
      .eq("business_id", businessId)
      .order("name", { ascending: true })
      .limit(2000);

    if (loadError) {
      setError(
        isMissingTableError(loadError.message)
          ? SETUP_NOTICE
          : {
              key: "products.errorLoad",
              variables: { detail: safeErrorDetail(loadError, locale) },
            }
      );
      setProducts([]);
    } else {
      setProducts((data ?? []) as Product[]);
    }

    setLoading(false);
  }, [businessId, locale, supabase]);

  useEffect(() => {
    if (!businessId) return;

    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadProducts();
    });

    return () => {
      active = false;
    };
  }, [businessId, loadProducts]);

  const categories = useMemo(() => {
    const set = new Set(BASE_CATEGORIES);

    products.forEach((product) => {
      if (product.category) set.add(product.category);
    });

    return ["Zote", ...Array.from(set)];
  }, [products]);

  const activeProducts = useMemo(
    () => products.filter((product) => !product.is_archived),
    [products]
  );

  const stats = useMemo(() => {
    const low = activeProducts.filter(
      (product) =>
        Number(product.quantity) <= Number(product.low_stock_level ?? 5)
    ).length;
    const units = activeProducts.reduce(
      (sum, product) => sum + Number(product.quantity),
      0
    );
    const value = activeProducts.reduce(
      (sum, product) =>
        sum + Number(product.buying_price) * Number(product.quantity),
      0
    );

    return { low, units, value };
  }, [activeProducts]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesTerm =
        !term ||
        product.name.toLowerCase().includes(term) ||
        (product.sku ?? "").toLowerCase().includes(term) ||
        (product.barcode ?? "").toLowerCase().includes(term);

      const matchesCategory =
        category === "Zote" || (product.category || "Nyingine") === category;

      const matchesStatus =
        status === "Zote" ||
        (status === "Hai" && !product.is_archived) ||
        (status === "Zilizowekwa kando" && product.is_archived);

      return matchesTerm && matchesCategory && matchesStatus;
    });
  }, [products, search, category, status]);

  function resetForm() {
    setName("");
    setSku("");
    setBarcode("");
    setSelectedCategory("Vyakula");
    setUnit("pcs");
    setBuyingPrice("");
    setSellingPrice("");
    setStock("");
    setLowStockLevel("5");
    setEditingId(null);
    setShowForm(false);
  }

  function editProduct(product: Product) {
    setEditingId(product.id);
    setName(product.name);
    setSku(product.sku ?? "");
    setBarcode(product.barcode ?? "");
    setSelectedCategory(product.category || "Nyingine");
    setUnit(product.unit || "pcs");
    setBuyingPrice(String(product.buying_price));
    setSellingPrice(String(product.selling_price));
    setStock(String(product.quantity));
    setLowStockLevel(String(product.low_stock_level ?? 5));
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!businessId) {
      setError({ key: "products.errorNoBusiness" });
      return;
    }

    const buy = Number(buyingPrice);
    const sell = Number(sellingPrice);
    const opening = Number(stock) || 0;
    const lowLevel = Number(lowStockLevel) || 0;

    if (!name.trim()) {
      setError({ key: "products.errorNameRequired" });
      return;
    }

    if (!Number.isFinite(buy) || buy < 0 || !Number.isFinite(sell) || sell < 0) {
      setError({ key: "products.errorInvalidPrices" });
      return;
    }

    if (!editingId && opening < 0) {
      setError({ key: "products.errorNegativeStock" });
      return;
    }

    setSaving(true);

    const payload = {
      business_id: businessId,
      name: name.trim(),
      sku: sku.trim() || null,
      barcode: barcode.trim() || null,
      category: selectedCategory,
      unit,
      buying_price: buy,
      selling_price: sell,
      low_stock_level: lowLevel,
    };

    if (editingId) {
      const { error: updateError } = await supabase
        .from("products")
        .update(payload)
        .eq("id", editingId)
        .eq("business_id", businessId);

      if (updateError) {
        setError({
          key: "products.errorUpdate",
          variables: { detail: safeErrorDetail(updateError, locale) },
        });
        setSaving(false);
        return;
      }

      setNotice({ key: "products.noticeUpdated" });
      resetForm();
      await loadProducts();
      setSaving(false);
      return;
    }

    const { data: created, error: insertError } = await supabase
      .from("products")
      .insert({ ...payload, quantity: 0 })
      .select("id")
      .single();

    if (insertError || !created) {
      setError(
        insertError?.message
          ? {
              key: "products.errorInsert",
              variables: { detail: safeErrorDetail(insertError, locale) },
            }
          : { key: "products.errorInsertFallback" }
      );
      setSaving(false);
      return;
    }

    if (opening > 0) {
      const { error: adjustError } = await supabase.rpc("adjust_stock", {
        p_business_id: businessId,
        p_product_id: created.id,
        p_movement_type: "in",
        p_quantity: opening,
        p_note: "Stoo ya kuanzia",
      });

      if (adjustError) {
        setError({
          key: "products.errorOpeningStock",
          variables: { detail: safeErrorDetail(adjustError, locale) },
        });
      }
    }

    setNotice({ key: "products.noticeCreated" });
    resetForm();
    await loadProducts();
    setSaving(false);
  }

  async function toggleArchive(product: Product) {
    const { error: archiveError } = await supabase
      .from("products")
      .update({ is_archived: !product.is_archived })
      .eq("id", product.id)
      .eq("business_id", businessId);

    if (archiveError) {
      setError({
        key: "products.errorArchive",
        variables: { detail: safeErrorDetail(archiveError, locale) },
      });
      return;
    }

    setNotice(
      product.is_archived
        ? {
            key: "products.noticeRestored",
            variables: { product: product.name },
          }
        : {
            key: "products.noticeArchived",
            variables: { product: product.name },
          }
    );
    await loadProducts();
  }

  async function deleteProduct(product: Product) {
    if (
      !window.confirm(
        t("products.confirmDelete", { product: product.name })
      )
    ) {
      return;
    }

    const { error: deleteError } = await supabase
      .from("products")
      .delete()
      .eq("id", product.id)
      .eq("business_id", businessId);

    if (deleteError) {
      setError({
        key: "products.errorDelete",
        variables: { detail: safeErrorDetail(deleteError, locale) },
      });
      return;
    }

    setNotice({ key: "products.noticeDeleted" });
    await loadProducts();
  }

  return (
    <AppShell
      title={t("pages.products")}
      subtitle={workspace?.business_name}
      actions={
        <>
          <button
            onClick={loadProducts}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} /> {t("common.refresh")}
          </button>
          {mayManage && (
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
            >
              <Plus size={17} /> {t("products.addProduct")}
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

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              {t("products.activeProducts")}
            </p>
            <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
              <Package size={19} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-extrabold">{activeProducts.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              {t("products.lowStock")}
            </p>
            <span className="rounded-xl bg-orange-50 p-2.5 text-orange-600">
              <AlertTriangle size={19} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-orange-600">
            {stats.low}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              {t("products.totalUnits")}
            </p>
            <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
              <Boxes size={19} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-extrabold">{stats.units}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              {t("common.inventoryValue")}
            </p>
            <span className="rounded-xl bg-purple-50 p-2.5 text-purple-600">
              <ShoppingBag size={19} />
            </span>
          </div>
          <p className="mt-3 text-xl font-extrabold">{money(stats.value)}</p>
        </div>
      </div>

      {showForm && (
        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold">
                {editingId ? t("products.editProduct") : t("products.newProduct")}
              </h2>
              <p className="text-xs text-slate-500">
                {editingId
                  ? t("products.editStockHint")
                  : t("products.newStockHint")}
              </p>
            </div>
            <button
              onClick={resetForm}
              className="rounded-lg p-2 hover:bg-slate-100"
            >
              <X size={19} />
            </button>
          </div>

          <form onSubmit={saveProduct}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm font-semibold text-slate-700">
                {t("products.fieldName")}
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("products.namePlaceholder")}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("products.fieldSku")}
                <input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="PRD-001"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("products.fieldBarcode")}
                <input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder={t("common.optional")}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("products.fieldCategory")}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500"
                >
                  {categories
                    .filter((item) => item !== "Zote")
                    .map((item) => (
                      <option key={item} value={item}>
                        {productCategoryLabel(item, t)}
                      </option>
                    ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("products.fieldUnit")}
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500"
                >
                  {UNITS.map((item) => (
                    <option key={item} value={item}>
                      {unitLabel(item, t)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("products.fieldLowStock")}
                <input
                  type="number"
                  min="0"
                  value={lowStockLevel}
                  onChange={(e) => setLowStockLevel(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("products.fieldBuyingPrice")}
                <input
                  required
                  type="number"
                  min="0"
                  value={buyingPrice}
                  onChange={(e) => setBuyingPrice(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("products.fieldSellingPrice")}
                <input
                  required
                  type="number"
                  min="0"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {editingId
                  ? t("products.fieldCurrentStock")
                  : t("products.fieldOpeningStock")}
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  disabled={Boolean(editingId)}
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  placeholder="0"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />{" "}
                    {t("products.saving")}
                  </>
                ) : editingId ? (
                  t("products.saveChanges")
                ) : (
                  t("products.registerProduct")
                )}
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
            <h2 className="font-bold">{t("products.listTitle")}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {t("products.foundCount", { count: filtered.length })}
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
                placeholder={t("products.searchPlaceholder")}
                className="w-56 rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"
            >
              <option value="Hai">{productStatusLabel("Hai", t)}</option>
              <option value="Zilizowekwa kando">
                {productStatusLabel("Zilizowekwa kando", t)}
              </option>
              <option value="Zote">{productStatusLabel("Zote", t)}</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
          {categories.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                category === item
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {productCategoryLabel(item, t)}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-5 py-3">{t("products.tableProduct")}</th>
                <th className="px-5 py-3">{t("products.tableCategory")}</th>
                <th className="px-5 py-3">{t("products.tableBuying")}</th>
                <th className="px-5 py-3">{t("products.tableSelling")}</th>
                <th className="px-5 py-3">{t("products.tableProfit")}</th>
                <th className="px-5 py-3">{t("products.tableStock")}</th>
                <th className="px-5 py-3">{t("common.status")}</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-12 text-center text-slate-500"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="animate-spin" size={16} />{" "}
                      {t("products.loading")}
                    </span>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-12 text-center text-slate-400"
                  >
                    {t("products.noProducts")}
                  </td>
                </tr>
              ) : (
                filtered.map((product) => {
                  const quantity = Number(product.quantity);
                  const low = quantity <= Number(product.low_stock_level ?? 5);
                  const margin =
                    Number(product.selling_price) - Number(product.buying_price);

                  return (
                    <tr
                      key={product.id}
                      className={`border-t border-slate-100 ${
                        product.is_archived ? "bg-slate-50/60" : ""
                      }`}
                    >
                      <td className="px-5 py-4">
                        <p className="font-semibold">{product.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {product.sku || t("common.noSku")}
                          {product.barcode ? ` · ${product.barcode}` : ""}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <Tags size={14} />{" "}
                          {productCategoryLabel(
                            product.category || "Nyingine",
                            t
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {money(product.buying_price)}
                      </td>
                      <td className="px-5 py-4 font-semibold">
                        {money(product.selling_price)}
                      </td>
                      <td
                        className={`px-5 py-4 font-semibold ${
                          margin >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {money(margin)}
                      </td>
                      <td className="px-5 py-4 font-bold">
                        {quantity} {unitLabel(product.unit, t)}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            product.is_archived
                              ? "bg-slate-100 text-slate-500"
                              : low
                                ? "bg-orange-50 text-orange-700"
                                : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {product.is_archived
                            ? t("productStatus.archivedBadge")
                            : low
                              ? t("productStatus.lowStock")
                              : t("productStatus.available")}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          {mayManage && (
                            <button
                              onClick={() => editProduct(product)}
                              className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                              title={t("products.editTooltip")}
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          {mayManage && (
                            <button
                              onClick={() => toggleArchive(product)}
                              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                              title={
                                product.is_archived
                                  ? t("products.restoreTooltip")
                                  : t("products.archiveTooltip")
                              }
                            >
                              {product.is_archived ? (
                                <ArchiveRestore size={16} />
                              ) : (
                                <Archive size={16} />
                              )}
                            </button>
                          )}
                          {mayDelete && product.is_archived && (
                            <button
                              onClick={() => deleteProduct(product)}
                              className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                              title={t("products.deleteTooltip")}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-5 text-center text-[11px] text-slate-400">
        {t("products.archivedNote")}
      </p>
    </AppShell>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Package,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Settings2,
  Loader2,
  RefreshCw,
  Search,
  History,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import AppShell from "@/components/app-shell";
import {
  inventoryMovementLabel,
  productCategoryLabel,
  unitLabel,
  useI18n,
  type TranslationKey,
} from "@/lib/i18n";
import { useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { formatDateTime, money } from "@/lib/format";
import { safeErrorDetail } from "@/lib/supabase/errors";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  quantity: number;
  unit: string | null;
  low_stock_level: number | null;
  buying_price: number;
};

type Movement = {
  id: string;
  movement_type: string;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  note: string | null;
  created_at: string;
  products: { name: string } | null;
};

type Notice = {
  key: TranslationKey;
  variables?: Record<string, string | number>;
};

const MOVEMENT_TYPES = [
  { value: "in", label: "inventoryMovement.inOption", icon: ArrowDownToLine },
  { value: "out", label: "inventoryMovement.outOption", icon: ArrowUpFromLine },
  {
    value: "adjustment",
    label: "inventoryMovement.adjustmentOption",
    icon: Settings2,
  },
  { value: "damage", label: "inventoryMovement.damageOption", icon: ShieldAlert },
] as const;

export default function InventoryPage() {
  const { workspace, supabase } = useWorkspace();
  const { locale, t } = useI18n();

  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Notice | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [search, setSearch] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);

  const [selectedId, setSelectedId] = useState("");
  const [movementType, setMovementType] = useState("in");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const businessId = workspace?.business_id ?? "";
  const mayManage = can(workspace?.role, "inventory.manage");

  const loadStock = useCallback(async () => {
    if (!businessId) return;

    setLoading(true);
    setError(null);

    const [productsResult, movementsResult] = await Promise.all([
      supabase
        .from("products")
        .select(
          "id,name,sku,category,quantity,unit,low_stock_level,buying_price"
        )
        .eq("business_id", businessId)
        .order("name")
        .limit(2000),
      supabase
        .from("stock_movements")
        .select(
          "id,movement_type,quantity,quantity_before,quantity_after,note,created_at,products(name)"
        )
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    if (productsResult.error) {
      setError({
        key: "inventory.errorLoad",
        variables: { detail: safeErrorDetail(productsResult.error, locale) },
      });
    } else {
      setProducts((productsResult.data ?? []) as Product[]);
    }

    if (!movementsResult.error) {
      setMovements(
        (movementsResult.data ?? []) as unknown as Movement[]
      );
    }

    setLoading(false);
  }, [businessId, locale, supabase]);

  useEffect(() => {
    if (!businessId) return;

    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadStock();
    });

    return () => {
      active = false;
    };
  }, [businessId, loadStock]);

  const stats = useMemo(() => {
    const low = products.filter(
      (product) =>
        Number(product.quantity) <= Number(product.low_stock_level ?? 5)
    ).length;
    const units = products.reduce(
      (sum, product) => sum + Number(product.quantity),
      0
    );
    const value = products.reduce(
      (sum, product) =>
        sum + Number(product.buying_price) * Number(product.quantity),
      0
    );

    return { low, units, value };
  }, [products]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesTerm =
        !term ||
        product.name.toLowerCase().includes(term) ||
        (product.sku ?? "").toLowerCase().includes(term);

      const isLow =
        Number(product.quantity) <= Number(product.low_stock_level ?? 5);

      return matchesTerm && (!onlyLow || isLow);
    });
  }, [products, search, onlyLow]);

  const selectedProduct = products.find(
    (product) => product.id === selectedId
  );

  function resetMovement() {
    setSelectedId("");
    setMovementType("in");
    setAmount("");
    setNote("");
  }

  async function saveMovement() {
    setError(null);
    setNotice(null);

    if (!mayManage) {
      setError({ key: "inventory.errorNoPermission" });
      return;
    }

    const quantity = Number(amount);

    if (!selectedProduct) {
      setError({ key: "inventory.errorSelectProduct" });
      return;
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
      setError({ key: "inventory.errorInvalidQuantity" });
      return;
    }

    if (movementType !== "adjustment" && quantity <= 0) {
      setError({ key: "inventory.errorPositiveQuantity" });
      return;
    }

    const before = Number(selectedProduct.quantity);
    const after =
      movementType === "in"
        ? before + quantity
        : movementType === "out" || movementType === "damage"
          ? before - quantity
          : quantity;

    if (after < 0) {
      setError({ key: "inventory.errorInsufficientStock" });
      return;
    }

    setSaving(true);

    const { error: adjustError } = await supabase.rpc("adjust_stock", {
      p_business_id: businessId,
      p_product_id: selectedProduct.id,
      p_movement_type: movementType,
      p_quantity: quantity,
      p_note: note.trim() || null,
    });

    if (adjustError) {
      setError({
        key: "inventory.errorAdjust",
        variables: { detail: safeErrorDetail(adjustError, locale) },
      });
      setSaving(false);
      return;
    }

    setNotice({
      key: "inventory.noticeMovementSaved",
      variables: {
        name: selectedProduct.name,
        before,
        after,
        unit: unitLabel(selectedProduct.unit, t),
      },
    });

    resetMovement();
    await loadStock();
    setSaving(false);
  }

  return (
    <AppShell
      title={t("pages.inventory")}
      subtitle={workspace?.business_name}
      actions={
        <button
          onClick={loadStock}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={16} /> {t("common.refresh")}
        </button>
      }
    >
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{error ? t(error.key, error.variables) : null}</span>
        </div>
      )}

      {notice && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <span>{notice ? t(notice.key, notice.variables) : null}</span>
        </div>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              {t("inventory.stats.products")}
            </p>
            <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
              <Package size={19} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-extrabold">{products.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              {t("inventory.stats.totalUnits")}
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
              {t("inventory.stats.lowStock")}
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
              {t("inventory.stats.stockValue")}
            </p>
            <span className="rounded-xl bg-purple-50 p-2.5 text-purple-600">
              <Boxes size={19} />
            </span>
          </div>
          <p className="mt-3 text-xl font-extrabold">{money(stats.value)}</p>
        </div>
      </div>

      {mayManage && (
        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4">
            <h2 className="font-bold">{t("inventory.adjust.title")}</h2>
            <p className="text-xs text-slate-500">
              {t("inventory.adjust.description")}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-semibold text-slate-700">
              {t("common.product")}
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500"
              >
                <option value="">{t("inventory.adjust.selectProduct")}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {t("inventory.adjust.productOption", {
                      name: product.name,
                      quantity: product.quantity,
                    })}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-semibold text-slate-700">
              {t("inventory.adjust.movementType")}
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500"
              >
                {MOVEMENT_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {t(item.label)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-semibold text-slate-700">
              {movementType === "adjustment"
                ? t("inventory.adjust.newQuantity")
                : t("common.quantity")}
              <input
                type="number"
                min="0"
                step="0.001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
              />
            </label>

            <label className="text-sm font-semibold text-slate-700">
              {t("common.notes")}
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("inventory.adjust.notePlaceholder")}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
              />
            </label>
          </div>

          {selectedProduct && (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {t("inventory.adjust.currentStock", {
                name: selectedProduct.name,
                quantity: Number(selectedProduct.quantity),
                unit: unitLabel(selectedProduct.unit, t),
              })}
              {movementType === "adjustment" &&
                t("inventory.adjust.exactCountHint")}
            </p>
          )}

          <button
            onClick={saveMovement}
            disabled={saving || products.length === 0}
            className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="animate-spin" size={16} />{" "}
                {t("common.saving")}
              </>
            ) : (
              t("inventory.adjust.save")
            )}
          </button>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="font-bold">{t("inventory.list.title")}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {t("inventory.list.found", { count: filtered.length })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={onlyLow}
                onChange={(e) => setOnlyLow(e.target.checked)}
                className="accent-emerald-600"
              />
              {t("inventory.list.onlyLow")}
            </label>

            <div className="relative">
              <Search
                size={17}
                className="absolute left-3 top-2.5 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("inventory.list.searchPlaceholder")}
                className="w-52 rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 p-6 text-sm text-slate-500">
            <Loader2 className="animate-spin" size={16} /> {t("common.loading")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {t("inventory.list.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3">{t("common.product")}</th>
                  <th className="px-5 py-3">{t("common.category")}</th>
                  <th className="px-5 py-3">{t("common.quantity")}</th>
                  <th className="px-5 py-3">
                    {t("inventory.list.minLevel")}
                  </th>
                  <th className="px-5 py-3">{t("common.value")}</th>
                  <th className="px-5 py-3">{t("common.status")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const quantity = Number(product.quantity);
                  const threshold = Number(product.low_stock_level ?? 5);
                  const low = quantity <= threshold;

                  return (
                    <tr key={product.id} className="border-t border-slate-100">
                      <td className="px-5 py-4">
                        <p className="font-semibold">{product.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {product.sku || t("common.noSku")}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {product.category
                          ? productCategoryLabel(product.category, t)
                          : t("inventory.list.otherCategory")}
                      </td>
                      <td className="px-5 py-4 font-bold">
                        {quantity} {unitLabel(product.unit, t)}
                      </td>
                      <td className="px-5 py-4 text-slate-500">{threshold}</td>
                      <td className="px-5 py-4 text-slate-600">
                        {money(
                          Number(product.buying_price) * quantity
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            low
                              ? "bg-orange-50 text-orange-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {low
                            ? t("inventoryStatus.low")
                            : t("inventoryStatus.ok")}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {mayManage && (
                          <button
                            onClick={() => {
                              setSelectedId(product.id);
                              setMovementType("in");
                              setAmount("");
                              setNote("");
                              window.scrollTo({
                                top: 0,
                                behavior: "smooth",
                              });
                            }}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50"
                          >
                            {t("common.adjust")}
                          </button>
                        )}
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
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="font-bold">{t("inventory.history.title")}</h2>
            <p className="text-xs text-slate-500">
              {t("inventory.history.subtitle")}
            </p>
          </div>
          <History className="text-slate-400" size={19} />
        </div>

        {movements.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            {t("inventory.history.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3">{t("common.product")}</th>
                  <th className="px-5 py-3">{t("common.type")}</th>
                  <th className="px-5 py-3">{t("common.quantity")}</th>
                  <th className="px-5 py-3">
                    {t("inventory.history.beforeAfter")}
                  </th>
                  <th className="px-5 py-3">{t("common.notes")}</th>
                  <th className="px-5 py-3">{t("common.time")}</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id} className="border-t border-slate-100">
                    <td className="px-5 py-3 font-semibold">
                      {movement.products?.name ?? t("common.product")}
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {inventoryMovementLabel(movement.movement_type, t)}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-bold">
                      {movement.movement_type === "in" ||
                      movement.movement_type === "purchase" ||
                      movement.movement_type === "refund"
                        ? "+"
                        : "−"}
                      {Number(movement.quantity)}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {Number(movement.quantity_before)} →{" "}
                      {Number(movement.quantity_after)}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {movement.note || "-"}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {formatDateTime(movement.created_at, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}

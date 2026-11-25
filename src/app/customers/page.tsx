"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Users,
  UserPlus,
  Search,
  Wallet,
  X,
  Pencil,
  Trash2,
  History,
  Phone,
  Mail,
  Loader2,
  AlertTriangle,
  RefreshCw,
  TrendingDown,
  CheckCircle2,
  CreditCard,
} from "lucide-react";
import AppShell from "@/components/app-shell";
import {
  customerFilterLabel,
  paymentMethodLabel,
  saleStatusLabel,
  useI18n,
  type TranslationKey,
} from "@/lib/i18n";
import { useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { isMissingTableError, safeErrorDetail } from "@/lib/supabase/errors";
import { formatDate, formatDateTime, money } from "@/lib/format";

type Notice = {
  key: TranslationKey;
  variables?: Record<string, string | number>;
};

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  credit_limit: number;
  balance: number;
  notes: string | null;
  created_at: string;
};

type SaleRow = {
  id: string;
  receipt_number: string;
  total: number;
  paid: number;
  status: string;
  created_at: string;
};

type PaymentRow = {
  id: string;
  amount: number;
  payment_method: string;
  note: string | null;
  created_at: string;
};

const PAYMENT_METHODS = [
  "Cash",
  "M-Pesa",
  "Tigo Pesa",
  "Airtel Money",
  "HaloPesa",
  "Benki",
];

export default function CustomersPage() {
  const { workspace, supabase } = useWorkspace();
  const { locale, t } = useI18n();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Notice | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Zote");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [notes, setNotes] = useState("");

  const [payingCustomer, setPayingCustomer] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentKey, setPaymentKey] = useState("");
  const [paying, setPaying] = useState(false);

  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [historySales, setHistorySales] = useState<SaleRow[]>([]);
  const [historyPayments, setHistoryPayments] = useState<PaymentRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const businessId = workspace?.business_id ?? "";
  const mayView = can(workspace?.role, "customers.view");
  const mayManage = can(workspace?.role, "customers.manage");
  const mayDelete =
    workspace?.role === "owner" || workspace?.role === "admin";

  const loadCustomers = useCallback(() => {
    if (!businessId) return Promise.resolve();

    // Keep state updates inside promise callbacks so starting this loader from
    // an effect is not treated as a synchronous setState call in the effect.
    return Promise.resolve()
      .then(() => {
        setLoading(true);
        setError(null);

        return supabase
          .from("customers")
          .select(
            "id,name,phone,email,address,credit_limit,balance,notes,created_at"
          )
          .eq("business_id", businessId)
          .order("name", { ascending: true })
          .limit(1000);
      })
      .then(({ data, error: loadError }) => {
        if (loadError) {
          setError(
            isMissingTableError(loadError.message)
              ? { key: "customers.setupHint" }
              : {
                  key: "customers.errorLoad",
                  variables: { detail: safeErrorDetail(loadError, locale) },
                }
          );
          setCustomers([]);
        } else {
          setCustomers((data ?? []) as Customer[]);
        }

        setLoading(false);
      });
  }, [businessId, locale, supabase]);

  useEffect(() => {
    if (businessId) loadCustomers();
  }, [businessId, loadCustomers]);

  const totals = useMemo(() => {
    const receivable = customers.reduce(
      (sum, item) => sum + Math.max(0, Number(item.balance)),
      0
    );
    const debtors = customers.filter(
      (item) => Number(item.balance) > 0
    ).length;

    return { receivable, debtors };
  }, [customers]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return customers.filter((item) => {
      const matchesTerm =
        !term ||
        item.name.toLowerCase().includes(term) ||
        (item.phone ?? "").toLowerCase().includes(term) ||
        (item.email ?? "").toLowerCase().includes(term);

      const balance = Number(item.balance);

      const matchesFilter =
        filter === "Zote" ||
        (filter === "Wenye deni" && balance > 0) ||
        (filter === "Waliolipa" && balance <= 0);

      return matchesTerm && matchesFilter;
    });
  }, [customers, search, filter]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setCreditLimit("");
    setNotes("");
    setShowForm(false);
  }

  function editCustomer(customer: Customer) {
    setEditingId(customer.id);
    setName(customer.name);
    setPhone(customer.phone ?? "");
    setEmail(customer.email ?? "");
    setAddress(customer.address ?? "");
    setCreditLimit(String(customer.credit_limit ?? 0));
    setNotes(customer.notes ?? "");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!name.trim()) {
      setError({ key: "customers.validation.nameRequired" });
      return;
    }

    setSaving(true);

    const payload = {
      business_id: businessId,
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      credit_limit: Number(creditLimit) || 0,
      notes: notes.trim() || null,
    };

    const result = editingId
      ? await supabase
          .from("customers")
          .update(payload)
          .eq("id", editingId)
          .eq("business_id", businessId)
      : await supabase.from("customers").insert(payload);

    if (result.error) {
      setError({
        key: "customers.errorSave",
        variables: { detail: safeErrorDetail(result.error, locale) },
      });
      setSaving(false);
      return;
    }

    setNotice({
      key: editingId ? "customers.noticeUpdated" : "customers.noticeCreated",
    });
    resetForm();
    await loadCustomers();
    setSaving(false);
  }

  async function deleteCustomer(customer: Customer) {
    if (
      !window.confirm(
        t("customers.confirmDelete", { name: customer.name })
      )
    ) {
      return;
    }

    const { error: deleteError } = await supabase
      .from("customers")
      .delete()
      .eq("id", customer.id)
      .eq("business_id", businessId);

    if (deleteError) {
      setError({
        key: "customers.errorDelete",
        variables: { detail: safeErrorDetail(deleteError, locale) },
      });
      return;
    }

    setNotice({ key: "customers.noticeDeleted" });
    await loadCustomers();
  }

  function openPayment(customer: Customer) {
    setPayingCustomer(customer);
    setPaymentAmount("");
    setPaymentMethod("Cash");
    setPaymentNote("");
    setPaymentKey(
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    setError(null);
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!payingCustomer || paying) return;

    const amount = Number(paymentAmount);
    const balance = Number(payingCustomer.balance);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError({ key: "customers.validation.invalidAmount" });
      return;
    }

    if (amount > balance) {
      setError({ key: "customers.validation.amountExceedsBalance" });
      return;
    }

    setPaying(true);
    setError(null);

    const { error: paymentError } = await supabase.rpc(
      "record_customer_payment",
      {
        p_customer_id: payingCustomer.id,
        p_amount: amount,
        p_payment_method: paymentMethod,
        p_note: paymentNote.trim() || null,
        p_idempotency_key: paymentKey || null,
      }
    );

    if (paymentError) {
      const friendly: Notice =
        paymentError.code === "PGRST202"
          ? { key: "customers.setupHint" }
          : paymentError.message.startsWith("AMOUNT_EXCEEDS_BALANCE")
            ? { key: "customers.errorAmountExceedsCurrentBalance" }
            : paymentError.message.startsWith("NOT_ALLOWED")
              ? { key: "customers.errorNotAllowed" }
              : paymentError.message.startsWith("INVALID_AMOUNT")
                ? { key: "customers.errorInvalidPaymentAmount" }
                : paymentError.message.startsWith("CUSTOMER_NOT_FOUND")
                  ? { key: "customers.errorCustomerNotFound" }
                  : {
                      key: "customers.errorRecordPayment",
                      variables: {
                        detail: safeErrorDetail(paymentError, locale),
                      },
                    };

      setError(friendly);
      setPaying(false);
      await loadCustomers();
      return;
    } else {
      setNotice({
        key: "customers.noticePaymentReceived",
        variables: { amount: money(amount) },
      });
    }

    setPayingCustomer(null);
    setPaymentKey("");
    await loadCustomers();
    setPaying(false);
  }

  async function openHistory(customer: Customer) {
    setHistoryCustomer(customer);
    setHistorySales([]);
    setHistoryPayments([]);
    setHistoryLoading(true);

    const salesResult = await supabase
      .from("sales")
      .select("id,receipt_number,total,paid,status,created_at")
      .eq("business_id", businessId)
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!salesResult.error) {
      setHistorySales((salesResult.data ?? []) as SaleRow[]);
    }

    const paymentsResult = await supabase
      .from("customer_payments")
      .select("id,amount,payment_method,note,created_at")
      .eq("business_id", businessId)
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!paymentsResult.error) {
      setHistoryPayments((paymentsResult.data ?? []) as PaymentRow[]);
    }

    setHistoryLoading(false);
  }

  if (!mayView) {
    return (
      <AppShell title={t("pages.customers")} subtitle={workspace?.business_name}>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle size={18} /> {t("common.noPermission")}
          </div>
          <p className="mt-2">{t("customers.permission.description")}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t("pages.customers")}
      subtitle={workspace?.business_name}
      actions={
        <>
          <button
            onClick={loadCustomers}
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
              <UserPlus size={17} /> {t("customers.add")}
            </button>
          )}
        </>
      }
    >
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{t(error.key, error.variables)}</span>
        </div>
      )}

      {notice && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {t(notice.key, notice.variables)}
        </div>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              {t("customers.stat.total")}
            </p>
            <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
              <Users size={19} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-extrabold">{customers.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              {t("customers.stat.receivable")}
            </p>
            <span className="rounded-xl bg-orange-50 p-2.5 text-orange-600">
              <TrendingDown size={19} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-orange-600">
            {money(totals.receivable)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              {t("customerFilter.withDebt")}
            </p>
            <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
              <CreditCard size={19} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-extrabold">{totals.debtors}</p>
        </div>
      </div>

      {showForm && (
        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold">
                {t(editingId ? "customers.form.edit" : "customers.form.create")}
              </h2>
              <p className="text-xs text-slate-500">{t("customers.form.help")}</p>
            </div>
            <button
              onClick={resetForm}
              className="rounded-lg p-2 hover:bg-slate-100"
            >
              <X size={19} />
            </button>
          </div>

          <form onSubmit={saveCustomer}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm font-semibold text-slate-700">
                {t("common.fullName")}
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("register.fullNamePlaceholder")}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("customers.form.phone")}
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t("customers.form.phonePlaceholder")}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("common.email")}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("customers.form.emailPlaceholder")}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("customers.form.address")}
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t("customers.form.addressPlaceholder")}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                {t("customers.form.creditLimit")}
                <input
                  type="number"
                  min="0"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  placeholder="0"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
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
                {saving ? t("common.saving") : t("customers.form.save")}
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
            <h2 className="font-bold">{t("customers.list.title")}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {t("customers.list.count", { count: filtered.length })}
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
                placeholder={t("customers.search.placeholder")}
                className="w-56 rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"
            >
              <option value="Zote">{customerFilterLabel("Zote", t)}</option>
              <option value="Wenye deni">
                {customerFilterLabel("Wenye deni", t)}
              </option>
              <option value="Waliolipa">
                {customerFilterLabel("Waliolipa", t)}
              </option>
            </select>
          </div>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 p-6 text-sm text-slate-500">
            <Loader2 className="animate-spin" size={16} /> {t("common.loading")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">{t("customers.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3">{t("customers.table.customer")}</th>
                  <th className="px-5 py-3">{t("customers.table.contact")}</th>
                  <th className="px-5 py-3">{t("customers.table.limit")}</th>
                  <th className="px-5 py-3">{t("customers.table.debt")}</th>
                  <th className="px-5 py-3">{t("customers.table.joined")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => {
                  const balance = Number(customer.balance);

                  return (
                    <tr key={customer.id} className="border-t border-slate-100">
                      <td className="px-5 py-4">
                        <p className="font-semibold">{customer.name}</p>
                        <p className="text-xs text-slate-400">
                          {customer.address || t("customers.table.noAddress")}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-600">
                        <p className="flex items-center gap-1.5">
                          <Phone size={13} /> {customer.phone || "-"}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5">
                          <Mail size={13} /> {customer.email || "-"}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {money(customer.credit_limit)}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`font-bold ${
                            balance > 0 ? "text-orange-600" : "text-emerald-600"
                          }`}
                        >
                          {money(balance)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {formatDate(customer.created_at, locale)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openHistory(customer)}
                            className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                            title={t("customers.action.history")}
                          >
                            <History size={16} />
                          </button>
                          {mayManage && balance > 0 && (
                            <button
                              onClick={() => openPayment(customer)}
                              className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"
                              title={t("customers.payment.title")}
                            >
                              <Wallet size={16} />
                            </button>
                          )}
                          {mayManage && (
                            <button
                              onClick={() => editCustomer(customer)}
                              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                              title={t("customers.form.edit")}
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          {mayDelete && (
                            <button
                              onClick={() => deleteCustomer(customer)}
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

      <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
        <Users size={13} /> {t("customers.footer")}
      </p>

      {payingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold">
                  {t("customers.payment.title")}
                </h2>
                <p className="text-xs text-slate-500">{payingCustomer.name}</p>
              </div>
              <button
                onClick={() => setPayingCustomer(null)}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-4 rounded-xl bg-orange-50 p-3 text-sm">
              <span className="text-slate-600">
                {t("customers.payment.remainingBalance")}
              </span>
              <b className="text-orange-700">
                {money(payingCustomer.balance)}
              </b>
            </div>

            <form onSubmit={submitPayment} className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">
                {t("customers.payment.amount")}
                <input
                  required
                  type="number"
                  min="1"
                  max={Number(payingCustomer.balance)}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                {t("customers.payment.method")}
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500"
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {paymentMethodLabel(method, t)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                {t("common.notes")}
                <input
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder={t("customers.payment.notePlaceholder")}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <button
                type="submit"
                disabled={paying}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {paying ? (
                  <>
                    <Loader2 className="animate-spin" size={17} />{" "}
                    {t("common.saving")}
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={17} /> {t("customers.payment.save")}
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {historyCustomer && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:items-center">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold">
                  {t("customers.history.title", { name: historyCustomer.name })}
                </h2>
                <p className="text-xs text-slate-500">
                  {t("customers.history.subtitle")}
                </p>
              </div>
              <button
                onClick={() => setHistoryCustomer(null)}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] text-slate-500">{t("common.debt")}</p>
                <p className="text-sm font-bold text-orange-600">
                  {money(historyCustomer.balance)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] text-slate-500">{t("common.sales")}</p>
                <p className="text-sm font-bold">{historySales.length}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] text-slate-500">
                  {t("customers.history.payments")}
                </p>
                <p className="text-sm font-bold">{historyPayments.length}</p>
              </div>
            </div>

            {historyLoading ? (
              <p className="flex items-center gap-2 p-6 text-sm text-slate-500">
                <Loader2 className="animate-spin" size={16} /> {t("common.loading")}
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {t("customers.history.creditSales")}
                  </h3>
                  {historySales.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                      {t("customers.history.emptySales")}
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <table className="w-full text-left text-xs">
                        <tbody>
                          {historySales.map((sale) => (
                            <tr
                              key={sale.id}
                              className="border-b border-slate-100 last:border-0"
                            >
                              <td className="p-3 font-semibold">
                                {sale.receipt_number}
                              </td>
                              <td className="p-3">{money(sale.total)}</td>
                              <td className="p-3 text-slate-500">
                                {formatDateTime(sale.created_at, locale)}
                              </td>
                              <td className="p-3 text-right">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
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
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {t("customers.history.receivedPayments")}
                  </h3>
                  {historyPayments.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                      {t("customers.history.emptyPayments")}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {historyPayments.map((payment) => (
                        <div
                          key={payment.id}
                          className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-xs"
                        >
                          <div>
                            <p className="font-semibold">
                              {money(payment.amount)} ·{" "}
                              {paymentMethodLabel(payment.payment_method, t)}
                            </p>
                            <p className="text-slate-500">
                              {formatDateTime(payment.created_at, locale)}
                            </p>
                          </div>
                          <span className="text-slate-500">
                            {payment.note || ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={() => setHistoryCustomer(null)}
              className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white"
            >
              {t("shell.close")}
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

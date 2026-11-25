"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Truck,
  Wallet,
  Users,
  BarChart3,
  UserCog,
  Menu,
  X,
  LogOut,
  Store,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import LanguageSwitcher from "@/components/language-switcher";
import { roleLabel, useI18n, type TranslationKey } from "@/lib/i18n";
import { useWorkspace } from "@/lib/workspace";
import { useDemoStatus } from "@/lib/demo/use-demo-status";
import { can, type Permission } from "@/lib/permissions";

type NavItem = {
  href: string;
  labelKey: TranslationKey;
  icon: typeof LayoutDashboard;
  permission: Permission;
};

const NAV: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { href: "/sales", labelKey: "nav.sales", icon: ShoppingCart, permission: "sales.use" },
  { href: "/products", labelKey: "nav.products", icon: Package, permission: "products.view" },
  { href: "/inventory", labelKey: "nav.inventory", icon: Boxes, permission: "inventory.view" },
  { href: "/purchases", labelKey: "nav.purchases", icon: Truck, permission: "purchases.view" },
  { href: "/expenses", labelKey: "nav.expenses", icon: Wallet, permission: "expenses.view" },
  { href: "/customers", labelKey: "nav.customers", icon: Users, permission: "customers.view" },
  { href: "/reports", labelKey: "nav.reports", icon: BarChart3, permission: "reports.view" },
  { href: "/team", labelKey: "nav.team", icon: UserCog, permission: "team.view" },
];

function initials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useI18n();

  const { loading, error, user, workspace, signOut, refresh } = useWorkspace();
  const { status: demoStatus } = useDemoStatus();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f8fb]">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
          <Loader2 className="animate-spin" size={20} />
          {t("shell.loading")}
        </div>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f8fb] p-5">
        <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-7 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <AlertTriangle size={24} />
          </div>
          <h1 className="text-lg font-bold text-slate-900">
            {t("shell.loadErrorTitle")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {error || t("shell.loadErrorFallback")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={refresh}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <RefreshCw size={16} /> {t("shell.retry")}
            </button>
            <button
              onClick={signOut}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              {t("shell.signOut")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const visibleNav = NAV.filter((item) => can(workspace.role, item.permission));
  const displayName =
    workspace.full_name || user?.email?.split("@")[0] || t("shell.defaultUser");

  const sidebar = (
    <div className="flex h-full flex-col bg-[#072b22] px-4 py-6 text-white">
      <Link
        href="/dashboard"
        className="mb-8 flex items-center gap-3 px-2"
        onClick={() => setMenuOpen(false)}
      >
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500 text-white shadow-lg shadow-emerald-950/30">
          <Store size={22} />
        </span>
        <span className="leading-tight">
          <span className="block text-[15px] font-extrabold tracking-wide">
            BIASHARA MKONONI
          </span>
          <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-300/80">
            {t("brand.company")}
          </span>
        </span>
      </Link>

      <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-100/40">
        {t("shell.menuMain")}
      </p>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-emerald-500 text-white shadow-lg shadow-emerald-950/20"
                  : "text-emerald-50/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon size={18} />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs font-semibold text-emerald-100">
          {workspace.business_name}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-emerald-100/60">
          {t("shell.role")}: {roleLabel(workspace.role, t)}
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-[#132033]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] lg:block">
        {sidebar}
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label={t("shell.closeMenu")}
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-slate-950/50"
          />
          <div className="absolute inset-y-0 left-0 w-[280px] shadow-2xl">
            <button
              onClick={() => setMenuOpen(false)}
              className="absolute right-3 top-4 z-10 rounded-lg bg-white/10 p-2 text-white"
              aria-label={t("shell.close")}
            >
              <X size={18} />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="lg:ml-[264px]">
        <header className="sticky top-0 z-20 flex min-h-[72px] items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMenuOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label={t("shell.openMenu")}
            >
              <Menu size={22} />
            </button>

            <div className="min-w-0">
              <h1 className="truncate text-base font-extrabold md:text-lg">
                {title}
              </h1>
              {subtitle && (
                <p className="truncate text-[11px] text-slate-500 md:text-xs">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 sm:block">
              {roleLabel(workspace.role, t)}
            </span>

            {demoStatus.isDemo && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-amber-800">
                {t("demo.badge")}
              </span>
            )}

            <LanguageSwitcher />

            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
              {initials(displayName) || "BM"}
            </div>

            <button
              onClick={signOut}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              title={t("shell.signOutTitle")}
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">{t("shell.signOut")}</span>
            </button>
          </div>
        </header>

        {demoStatus.isDemo && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 md:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
                  <AlertTriangle size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-amber-900 sm:text-sm">
                    {t("demo.bannerTitle")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-800">
                    {t("demo.bannerSubtitle")}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-amber-700">
                    <span>
                      {t("demo.bannerRole", {
                        role: roleLabel(demoStatus.role ?? workspace.role, t),
                      })}
                    </span>
                    <span>
                      {t("demo.bannerBusiness", {
                        business: demoStatus.businessName ?? workspace.business_name,
                      })}
                    </span>
                    {!demoStatus.canReset && (
                      <span>{t("demo.resetInfo")}</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/settings/demo"
                  className="flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
                >
                  <RefreshCw size={14} /> {t("demo.openSettings")}
                </Link>
                <button
                  onClick={signOut}
                  className="rounded-xl border border-amber-300 px-3 py-2 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
                >
                  {t("demo.exit")}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 py-5 md:px-8 md:py-7">
          {actions && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">{actions}</div>
            </div>
          )}

          {children}

          <p className="mt-8 text-center text-[11px] text-slate-400">
            © 2026 {t("brand.company")} · {t("brand.tagline")}
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Store,
  BarChart3,
  Package,
  ShoppingCart,
  ShieldCheck,
  UserCog,
  Boxes,
} from "lucide-react";
import LanguageSwitcher from "@/components/language-switcher";
import { roleLabel, useI18n, type TranslationKey } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { safeErrorDetail } from "@/lib/supabase/errors";
import {
  PRIVATE_DEMO_ROLES,
  PRIVATE_DEMO_START_AVAILABLE,
} from "@/lib/demo/config";

export default function Home() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | "">("");
  const [errorDetail, setErrorDetail] = useState("");

  function privateRoleIcon(role: (typeof PRIVATE_DEMO_ROLES)[number]) {
    if (role === "owner") return ShieldCheck;
    if (role === "admin") return UserCog;
    if (role === "manager") return BarChart3;
    if (role === "cashier") return ShoppingCart;
    return Boxes;
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorKey("");
    setErrorDetail("");
    setLoading(true);

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) throw error;

      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");

      // Ruhusu kurudi kwenye ukurasa wa ndani pekee.
      const destination =
        next && next.startsWith("/") && !next.startsWith("//")
          ? next
          : "/dashboard";

      router.replace(destination);
      router.refresh();
    } catch (err) {
      if (err instanceof Error && err.message) {
        setErrorKey("login.errorWithDetail");
        setErrorDetail(safeErrorDetail(err, locale));
      } else {
        setErrorKey("login.errorFallback");
        setErrorDetail("");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="brand-panel">
        <div className="brand-content">
          <Link className="brand-logo" href="/">
            <span className="brand-icon"><Store size={25} /></span>
            <span>
              <strong>BIASHARA</strong>
              <strong>MKONONI<span className="brand-dot">.</span></strong>
            </span>
          </Link>

          <div className="hero-copy">
            <span className="eyebrow">{t("login.eyebrow")}</span>
            <h1>
              {t("login.headline1")}<br />
              {t("login.headline2")}<br />
              <span>{t("login.headline3")}</span>
            </h1>
            <p>{t("login.description")}</p>
          </div>

          <div className="preview-card">
            <div className="preview-top">
              <div>
                <span className="preview-label">{t("login.previewTitle")}</span>
                <h3>{t("login.welcomeBack")}</h3>
              </div>
              <span className="preview-badge">{t("login.previewBadge")}</span>
            </div>

            <div className="preview-stats">
              <div className="preview-stat">
                <span className="preview-stat-icon green">
                  <BarChart3 size={17} />
                </span>
                <span className="preview-label">{t("login.todaySales")}</span>
                <strong>{t("login.previewValue")}</strong>
                <small>{t("login.previewNote")}</small>
              </div>

              <div className="preview-stat">
                <span className="preview-stat-icon blue">
                  <Package size={17} />
                </span>
                <span className="preview-label">{t("login.products")}</span>
                <strong>{t("login.previewValue")}</strong>
                <small>{t("login.productsInStock")}</small>
              </div>
            </div>

            <div className="preview-footer">
              <span>
                <ShoppingCart size={15} /> {t("login.salesOverview")}
              </span>
              <ShieldCheck size={18} />
            </div>
          </div>
        </div>

        <div className="brand-bottom">
          <span>© 2026 {t("brand.company")}</span>
          <span>{t("brand.madeForAfrica")}</span>
        </div>
      </section>

      <section className="form-panel">
        <div className="fixed right-4 top-4 z-50 md:right-8 md:top-6">
          <LanguageSwitcher />
        </div>

        <div className="mobile-brand">
          <span className="brand-icon"><Store size={22} /></span>
          <strong>BIASHARA MKONONI</strong>
        </div>

        <div className="form-stack">
          <div className="login-box">
            <div className="welcome-icon">
              <LockKeyhole size={24} />
            </div>

            <span className="form-eyebrow">{t("login.formEyebrow")}</span>
            <h2>{t("login.formTitle")}</h2>
            <p className="form-description">{t("login.formDescription")}</p>

            <form onSubmit={handleLogin}>
              <label htmlFor="email">{t("login.email")}</label>
              <div className="input-wrap">
                <Mail size={18} />
                <input
                  id="email"
                  type="email"
                  placeholder={t("login.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="password-heading">
                <label htmlFor="password">{t("login.password")}</label>
                <a href="/forgot-password">{t("login.forgotPassword")}</a>
              </div>

              <div className="input-wrap">
                <LockKeyhole size={18} />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("login.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShowPassword((previous) => !previous)}
                  aria-label={
                    showPassword
                      ? t("login.hidePassword")
                      : t("login.showPassword")
                  }
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {errorKey && (
                <div className="error-message" role="alert">
                  {t(errorKey, { detail: errorDetail })}
                </div>
              )}

              <button
                className="login-button"
                type="submit"
                disabled={loading}
              >
                {loading ? t("login.signingIn") : t("login.signIn")}
                {!loading && <ArrowRight size={18} />}
              </button>
            </form>

            <div className="signup-prompt">
              {t("login.noAccount")} <a href="/register">{t("login.createAccount")}</a>
            </div>

            <div className="secure-note">
              <ShieldCheck size={16} />
              {t("login.secureNote")}
            </div>
          </div>

          <section className="private-demo-panel" aria-labelledby="private-demo-heading">
            <div className="private-demo-head">
              <span className="private-demo-chip">{t("demo.privateChip")}</span>
              <h2 id="private-demo-heading">{t("demo.privateTitle")}</h2>
              <p>{t("demo.privateDescription")}</p>
              <p className="private-demo-access">{t("demo.privateAccess")}</p>
            </div>

            <ul className="private-role-grid">
              {PRIVATE_DEMO_ROLES.map((role) => {
                const Icon = privateRoleIcon(role);

                return (
                  <li className="private-role" key={role}>
                    <span className="private-role-icon"><Icon size={14} /></span>
                    {roleLabel(role, t)}
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              className="private-demo-cta"
              disabled={!PRIVATE_DEMO_START_AVAILABLE}
              aria-describedby="private-demo-note"
            >
              {t("demo.privateCta")}
              <ArrowRight size={17} />
            </button>

            <p className="private-demo-note" id="private-demo-note">
              {t("demo.privateUnavailable")}
            </p>
          </section>
        </div>

        <div className="form-bottom">
          <span>{t("brand.company")}</span>
          <span>{t("brand.simple")}</span>
        </div>
      </section>
    </main>
  );
}

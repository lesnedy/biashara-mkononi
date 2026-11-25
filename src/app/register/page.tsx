"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Store,
  User,
  Building2,
  Mail,
  Phone,
  LockKeyhole,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import LanguageSwitcher from "@/components/language-switcher";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { safeErrorDetail } from "@/lib/supabase/errors";

type Invitation = {
  full_name: string;
  email: string;
  role: string;
  business_name: string;
  expires_at: string;
};

export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterLoading />}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterLoading() {
  const { t } = useI18n();

  return (
    <main className="register-page">
      <section className="register-form-panel">
        <div className="register-box">
          <p className="form-description">{t("register.loadingForm")}</p>
        </div>
      </section>
    </main>
  );
}

function RegisterForm() {
  const searchParams = useSearchParams();
  const { locale, t } = useI18n();
  const next = searchParams.get("next");

  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : null;

  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | "">("");
  const [errorDetail, setErrorDetail] = useState("");
  const [successKey, setSuccessKey] = useState<TranslationKey | "">("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [checkingInvitation, setCheckingInvitation] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadInvitation() {
      if (!safeNext || !safeNext.startsWith("/invite/")) return;

      const token = safeNext.split("/")[2];

      if (!token || !/^[0-9a-f]{64}$/.test(token)) {
        setErrorKey("register.errorInvalidInvite");
        return;
      }

      setCheckingInvitation(true);

      const supabase = createClient();
      const { data, error } = await supabase.rpc(
        "get_business_invitation",
        { p_token: token }
      );

      if (!active) return;

      if (error || !data || data.length === 0) {
        setErrorKey("register.errorInviteNotFound");
        setCheckingInvitation(false);
        return;
      }

      const invite = data[0] as Invitation;

      setInvitation(invite);
      setFullName(invite.full_name);
      setEmail(invite.email);
      setBusinessName(invite.business_name);
      setCheckingInvitation(false);
    }

    loadInvitation();

    return () => {
      active = false;
    };
  }, [safeNext]);

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorKey("");
    setErrorDetail("");
    setSuccessKey("");

    if (password.length < 8) {
      setErrorKey("register.errorPasswordLength");
      return;
    }

    if (password !== confirmPassword) {
      setErrorKey("register.errorPasswordMismatch");
      return;
    }

    if (
      invitation &&
      email.trim().toLowerCase() !== invitation.email.toLowerCase()
    ) {
      setErrorKey("register.errorInviteEmail");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const callbackUrl = new URL(
        "/auth/callback",
        window.location.origin
      );

      if (safeNext) {
        callbackUrl.searchParams.set("next", safeNext);
      }

      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            business_name: invitation ? "" : businessName.trim(),
            phone: phone.trim(),
          },
          emailRedirectTo: callbackUrl.toString(),
        },
      });

      if (error) throw error;

      setSuccessKey("register.success");

      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (err instanceof Error && err.message) {
        setErrorKey("register.errorWithDetail");
        setErrorDetail(safeErrorDetail(err, locale));
      } else {
        setErrorKey("register.errorFallback");
        setErrorDetail("");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="register-page">
      <section className="register-brand">
        <div className="register-brand-inner">
          <Link href="/" className="register-logo">
            <span className="brand-icon"><Store size={24} /></span>
            <span>
              <strong>BIASHARA</strong>
              <strong>MKONONI<span className="brand-dot">.</span></strong>
            </span>
          </Link>

          <div className="register-message">
            <span className="eyebrow">{t("register.eyebrow")}</span>
            <h1>
              {t("register.headline")} <span>{t("register.headlineAccent")}</span>
            </h1>
            <p>{t("register.description")}</p>
            <div className="register-benefits">
              <div><ShieldCheck size={19} /> {t("register.benefitSecure")}</div>
              <div><Building2 size={19} /> {t("register.benefitControl")}</div>
              <div><Store size={19} /> {t("register.benefitAfrica")}</div>
            </div>
          </div>
        </div>
        <span className="register-copyright">© 2026 {t("brand.company")}</span>
      </section>

      <section className="register-form-panel">
        <div className="fixed right-4 top-4 z-50 md:right-8 md:top-6">
          <LanguageSwitcher />
        </div>

        <div className="register-mobile-logo">
          <span className="brand-icon"><Store size={21} /></span>
          <strong>BIASHARA MKONONI</strong>
        </div>

        <div className="register-box">
          <div className="register-heading">
            <span className="form-eyebrow">
              {invitation
                ? t("register.formEyebrowInvite")
                : t("register.formEyebrowNew")}
            </span>
            <h2>
              {invitation
                ? t("register.titleInvite", { businessName: invitation.business_name })
                : t("register.titleNew")}
            </h2>
            <p>
              {invitation
                ? t("register.descInvite")
                : t("register.descNew")}
            </p>
          </div>

          {checkingInvitation && (
            <p className="form-description">{t("register.checkingInvitation")}</p>
          )}

          <form onSubmit={handleRegister}>
            <label htmlFor="fullName">{t("register.fullName")}</label>
            <div className="input-wrap">
              <User size={18} />
              <input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t("register.fullNamePlaceholder")}
                autoComplete="name"
                required
              />
            </div>

            {!invitation && (
              <>
                <label htmlFor="businessName">{t("register.businessName")}</label>
                <div className="input-wrap">
                  <Building2 size={18} />
                  <input
                    id="businessName"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder={t("register.businessNamePlaceholder")}
                    required
                  />
                </div>
              </>
            )}

            {invitation && (
              <>
                <label>{t("register.business")}</label>
                <div className="input-wrap">
                  <Building2 size={18} />
                  <input value={invitation.business_name} readOnly />
                </div>
              </>
            )}

            <label htmlFor="phone">{t("register.phone")}</label>
            <div className="input-wrap">
              <Phone size={18} />
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+255 7XX XXX XXX"
                autoComplete="tel"
                required
              />
            </div>

            <label htmlFor="registerEmail">{t("register.email")}</label>
            <div className="input-wrap">
              <Mail size={18} />
              <input
                id="registerEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jina@example.com"
                autoComplete="email"
                readOnly={!!invitation}
                required
              />
            </div>

            <label htmlFor="registerPassword">{t("register.password")}</label>
            <div className="input-wrap">
              <LockKeyhole size={18} />
              <input
                id="registerPassword"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("register.passwordPlaceholder")}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={t("register.passwordToggle")}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <label htmlFor="confirmPassword">{t("register.confirmPassword")}</label>
            <div className="input-wrap">
              <LockKeyhole size={18} />
              <input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("register.confirmPasswordPlaceholder")}
                autoComplete="new-password"
                required
              />
            </div>

            {errorKey && (
              <div className="error-message" role="alert">
                {t(errorKey, { detail: errorDetail })}
              </div>
            )}
            {successKey && (
              <div className="success-message" role="status">
                {t(successKey)}
              </div>
            )}

            <button
              className="login-button"
              type="submit"
              disabled={loading || checkingInvitation || (!!safeNext && !invitation)}
            >
              {loading
                ? t("register.submitCreating")
                : invitation
                  ? t("register.submitJoin")
                  : t("register.submitCreate")}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <div className="signup-prompt">
            {t("register.haveAccount")}{" "}
            <Link
              href={safeNext ? `/?next=${encodeURIComponent(safeNext)}` : "/"}
            >
              {t("register.signInHere")}
            </Link>
          </div>

          <div className="secure-note">
            <ShieldCheck size={16} />
            {t("register.secureNote")}
          </div>
        </div>

        <div className="form-bottom">
          <span>{t("brand.company")}</span>
          <span>{t("brand.simple")}</span>
        </div>
      </section>
    </main>
  );
}
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LanguageSwitcher from "@/components/language-switcher";
import { roleLabel, useI18n, type TranslationKey } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { Users, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";

type Invitation = {
  full_name: string;
  email: string;
  role: string;
  business_name: string;
  expires_at: string;
};

export function InvitationLoading() {
  const { t } = useI18n();

  return (
    <main className="invite-page">
      <div className="invite-card">
        <div className="invite-loading">
          <Loader2 className="animate-spin" size={22} />
          {t("invite.loadingPage")}
        </div>
      </div>
    </main>
  );
}

export default function InvitationClient({ token }: { token: string }) {
  const router = useRouter();
  const { locale, t } = useI18n();

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [messageKey, setMessageKey] = useState<TranslationKey | "">("");
  const [userEmail, setUserEmail] = useState("");

  const tokenValid = /^[0-9a-f]{64}$/.test(token);

  useEffect(() => {
    let active = true;

    async function loadInvitation() {
      if (!tokenValid) {
        setMessageKey("invite.invalidLink");
        setLoading(false);
        return;
      }

      const supabase = createClient();

      try {
        const { data: authData } = await supabase.auth.getUser();

        if (!active) return;

        setUserEmail(authData.user?.email || "");

        const { data, error } = await supabase.rpc(
          "get_business_invitation",
          { p_token: token }
        );

        if (!active) return;

        if (error || !data || data.length === 0) {
          setMessageKey("invite.invalidLink");
          setLoading(false);
          return;
        }

        setInvitation(data[0] as Invitation);
      } catch {
        if (active) {
          setMessageKey("invite.verificationError");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadInvitation();

    return () => {
      active = false;
    };
  }, [token, tokenValid]);

  async function acceptInvitation() {
    setAccepting(true);
    setMessageKey("");

    try {
      const supabase = createClient();
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user) {
        router.push(`/?next=${encodeURIComponent(`/invite/${token}`)}`);
        return;
      }

      if (
        authData.user.email?.toLowerCase() !==
        invitation?.email.toLowerCase()
      ) {
        setMessageKey("invite.emailMismatch");
        return;
      }

      const { error } = await supabase.rpc("accept_business_invitation", {
        p_token: token,
      });

      if (error) {
        setMessageKey("invite.acceptError");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setMessageKey("invite.genericError");
    } finally {
      setAccepting(false);
    }
  }

  const emailMatches =
    !!userEmail && userEmail.toLowerCase() === invitation?.email.toLowerCase();

  if (loading) {
    return <InvitationLoading />;
  }

  const messageVariables = { email: invitation?.email ?? "" };
  const dateLocale = locale === "en" ? "en-TZ" : "sw-TZ";

  return (
    <main className="invite-page">
      <div className="fixed right-4 top-4 z-50 md:right-8 md:top-6">
        <LanguageSwitcher />
      </div>

      <div className="invite-card">
        <div className="invite-icon">
          <Users size={28} />
        </div>

        <p className="invite-brand">{t("brand.name").toUpperCase()}</p>

        <h1>{t("invite.title")}</h1>

        {!invitation ? (
          <div className="invite-error">
            <AlertTriangle size={18} />
            <span>{messageKey ? t(messageKey, messageVariables) : ""}</span>
          </div>
        ) : (
          <>
            <p className="invite-lede">{t("invite.lede")}</p>

            <div className="invite-details">
              <div>
                <p className="invite-label">{t("invite.business")}</p>
                <p className="invite-value">{invitation.business_name}</p>
              </div>

              <div>
                <p className="invite-label">{t("invite.name")}</p>
                <p className="invite-value">{invitation.full_name}</p>
              </div>

              <div>
                <p className="invite-label">{t("invite.email")}</p>
                <p className="invite-value">{invitation.email}</p>
              </div>

              <div>
                <p className="invite-label">{t("invite.role")}</p>
                <p className="invite-role">
                  <ShieldCheck size={18} />
                  {roleLabel(invitation.role, t)}
                </p>
              </div>
            </div>

            {messageKey && (
              <div className="invite-warning">
                {t(messageKey, messageVariables)}
              </div>
            )}

            {userEmail && !emailMatches && (
              <div className="invite-warning">
                {t("invite.signedInAs")} <b>{userEmail}</b>.{" "}
                {t("invite.belongsTo")} <b>{invitation.email}</b>.
              </div>
            )}

            {!userEmail ? (
              <div className="invite-actions">
                <Link
                  href={`/?next=${encodeURIComponent(`/invite/${token}`)}`}
                  className="invite-primary"
                >
                  {t("invite.signInAs", messageVariables)}
                </Link>
                <Link
                  href={`/register?next=${encodeURIComponent(`/invite/${token}`)}`}
                  className="invite-secondary"
                >
                  {t("invite.createAccount")}
                </Link>
              </div>
            ) : (
              <button
                onClick={acceptInvitation}
                disabled={accepting || !emailMatches}
                className="invite-primary"
              >
                {accepting ? t("invite.accepting") : t("invite.accept")}
              </button>
            )}

            <p className="invite-expiry">
              {t("invite.expires")}{" "}
              {new Date(invitation.expires_at).toLocaleDateString(dateLocale)}
            </p>
          </>
        )}
      </div>
    </main>
  );
}

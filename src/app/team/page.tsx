"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users,
  UserPlus,
  Trash2,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  MessageCircle,
  Mail,
  Clock,
  KeyRound,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import AppShell from "@/components/app-shell";
import {
  roleLabel,
  useI18n,
  type TranslationKey,
  type TranslateFunction,
} from "@/lib/i18n";
import { useWorkspace } from "@/lib/workspace";
import { can, type Role } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { safeErrorDetail } from "@/lib/supabase/errors";

type Notice = {
  key: TranslationKey;
  variables?: Record<string, string | number>;
};

type Member = {
  id: string;
  user_id: string;
  role: Role;
  full_name: string | null;
  created_at: string;
};

type Invitation = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type InvitationStatusCode = "accepted" | "revoked" | "expired" | "pending";

const INVITE_ROLES: { value: string; labelKey: TranslationKey }[] = [
  { value: "admin", labelKey: "inviteRole.admin" },
  { value: "manager", labelKey: "inviteRole.manager" },
  { value: "cashier", labelKey: "inviteRole.cashier" },
  { value: "storekeeper", labelKey: "inviteRole.storekeeper" },
];

function invitationStatus(invite: Invitation): {
  status: InvitationStatusCode;
  labelKey: TranslationKey;
  tone: "ok" | "muted" | "warn" | "pending";
} {
  if (invite.accepted_at) {
    return {
      status: "accepted",
      labelKey: "invitation.status.accepted",
      tone: "ok",
    };
  }
  if (invite.revoked_at) {
    return {
      status: "revoked",
      labelKey: "invitation.status.revoked",
      tone: "muted",
    };
  }

  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return {
      status: "expired",
      labelKey: "invitation.status.expired",
      tone: "warn",
    };
  }

  return {
    status: "pending",
    labelKey: "invitation.status.pending",
    tone: "pending",
  };
}

// The message state is keyed so the banner follows an immediate language
// switch. Server-supplied detail that no dictionary key interpolates is
// appended as-is instead of being stored as a translated string.
function noticeText(notice: Notice | null, t: TranslateFunction) {
  if (!notice) return null;

  const text = t(notice.key, notice.variables);
  const detail = notice.variables?.detail;

  if (typeof detail === "string" && detail && !text.includes(detail)) {
    return `${text} ${detail}`;
  }

  return text;
}

export default function TeamPage() {
  const { workspace, supabase } = useWorkspace();
  const { locale, t } = useI18n();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<Notice | null>(null);
  const [error, setError] = useState<Notice | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("cashier");
  const [saving, setSaving] = useState(false);
  const [createdLink, setCreatedLink] = useState("");
  const [copiedId, setCopiedId] = useState("");

  const businessId = workspace?.business_id ?? "";
  const currentRole = workspace?.role ?? null;
  const canManage = can(currentRole, "team.manage");

  const loadTeam = useCallback(() => {
    if (!businessId) return Promise.resolve();

    // Keep state updates inside the async continuation so starting this loader
    // from an effect is not treated as a synchronous setState call.
    return Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);

      const membersResult = await supabase
        .from("business_members")
        .select("id,user_id,role,full_name,created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: true });

      if (membersResult.error) {
        setError({
          key: "team.errorLoadMembers",
          variables: { detail: safeErrorDetail(membersResult.error, locale) },
        });
      } else {
        setMembers((membersResult.data ?? []) as Member[]);
      }

      const invitationsResult = await supabase.rpc(
        "list_business_invitations",
        { p_business_id: businessId }
      );

      if (!invitationsResult.error && invitationsResult.data) {
        setInvitations(invitationsResult.data as Invitation[]);
      } else {
        const fallback = await supabase
          .from("business_invitations")
          .select(
            "id,full_name,email,role,expires_at,accepted_at,revoked_at,created_at"
          )
          .eq("business_id", businessId)
          .order("created_at", { ascending: false });

        if (!fallback.error) {
          setInvitations((fallback.data ?? []) as Invitation[]);
        }
      }

      setLoading(false);
    });
  }, [businessId, locale, supabase]);

  useEffect(() => {
    if (businessId) loadTeam();
  }, [businessId, loadTeam]);

  async function copyLink(link: string, id: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(""), 2500);
    } catch {
      setError({ key: "team.errorCopyLink" });
    }
  }

  async function createInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!fullName.trim() || !email.trim()) {
      setError({ key: "team.validation.nameEmailRequired" });
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    setCreatedLink("");

    try {
      const response = await fetch("/api/team/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          role,
          businessId,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        invitationUrl?: string;
      };

      if (!response.ok || !payload.invitationUrl) {
        setError({
          key: "team.errorCreate",
          variables: { detail: payload.error ?? "" },
        });
        return;
      }

      setCreatedLink(payload.invitationUrl);
      setMessage({ key: "team.noticeCreated" });
      setFullName("");
      setEmail("");
      await loadTeam();
    } catch {
      setError({ key: "team.errorNetwork" });
    } finally {
      setSaving(false);
    }
  }

  async function revokeInvitation(id: string) {
    if (!window.confirm(t("team.confirm.revokeInvitation"))) return;

    const result = await supabase.rpc("revoke_business_invitation", {
      p_invitation_id: id,
    });

    if (result.error) {
      setError({
        key: "team.errorRevoke",
        variables: { detail: safeErrorDetail(result.error, locale) },
      });
      return;
    }

    setMessage({ key: "team.noticeRevoked" });
    await loadTeam();
  }

  async function updateRole(memberId: string, newRole: string) {
    const result = await supabase.rpc("update_member_role", {
      p_member_id: memberId,
      p_role: newRole,
    });

    if (result.error) {
      setError({
        key: "team.errorUpdateRole",
        variables: { detail: safeErrorDetail(result.error, locale) },
      });
      return;
    }

    setMessage({ key: "team.noticeRoleUpdated" });
    await loadTeam();
  }

  async function removeMember(memberId: string) {
    if (!window.confirm(t("team.confirm.removeMember"))) {
      return;
    }

    const result = await supabase.rpc("remove_member", {
      p_member_id: memberId,
    });

    if (result.error) {
      setError({
        key: "team.errorRemove",
        variables: { detail: safeErrorDetail(result.error, locale) },
      });
      return;
    }

    setMessage({ key: "team.noticeRemoved" });
    await loadTeam();
  }

  const pending = invitations.filter((invite) => {
    const status = invitationStatus(invite);
    return status.status === "pending";
  });

  return (
    <AppShell
      title={t("pages.team")}
      subtitle={workspace?.business_name}
      actions={
        <button
          onClick={loadTeam}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={16} /> {t("common.refresh")}
        </button>
      }
    >
      {!can(currentRole, "team.view") ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle size={18} /> {t("common.noPermission")}
          </div>
          <p className="mt-2">{t("team.permission.description")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {noticeText(error, t)}
            </div>
          )}
          {message && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {noticeText(message, t)}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <Users className="mb-3 text-emerald-600" size={22} />
              <p className="text-xs font-medium text-slate-500">
                {t("team.stat.members")}
              </p>
              <p className="mt-1 text-3xl font-extrabold">{members.length}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <Clock className="mb-3 text-amber-500" size={22} />
              <p className="text-xs font-medium text-slate-500">
                {t("team.stat.pendingInvitations")}
              </p>
              <p className="mt-1 text-3xl font-extrabold">{pending.length}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <ShieldCheck className="mb-3 text-emerald-600" size={22} />
              <p className="text-xs font-medium text-slate-500">
                {t("team.stat.owners")}
              </p>
              <p className="mt-1 text-3xl font-extrabold">
                {members.filter((m) => m.role === "owner").length}
              </p>
            </div>
          </div>

          {canManage && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <div className="mb-5 flex items-center gap-2">
                <UserPlus className="text-emerald-600" size={20} />
                <div>
                  <h2 className="font-bold">{t("team.invite.title")}</h2>
                  <p className="text-xs text-slate-500">
                    {t("team.invite.subtitle")}
                  </p>
                </div>
              </div>

              <form onSubmit={createInvitation} className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  {t("common.fullName")}
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t("team.invite.fullNamePlaceholder")}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                    required
                  />
                </label>

                <label className="text-sm font-semibold text-slate-700">
                  {t("common.email")}
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("team.invite.emailPlaceholder")}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
                    required
                  />
                </label>

                <label className="text-sm font-semibold text-slate-700">
                  {t("shell.role")}
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500"
                  >
                    {INVITE_ROLES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {t(item.labelKey)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="animate-spin" size={17} />
                        {t("team.invite.creating")}
                      </>
                    ) : (
                      <>
                        <Mail size={17} /> {t("team.invite.submit")}
                      </>
                    )}
                  </button>
                </div>
              </form>

              {createdLink && (
                <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                    {t("team.link.title")}
                  </p>
                  <p className="mt-2 break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-700">
                    {createdLink}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => copyLink(createdLink, "created")}
                      className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm"
                    >
                      {copiedId === "created" ? (
                        <Check size={15} />
                      ) : (
                        <Copy size={15} />
                      )}
                      {copiedId === "created"
                        ? t("team.link.copied")
                        : t("team.link.copy")}
                    </button>

                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        t("team.link.shareMessage", { link: createdLink })
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-bold text-white shadow-sm"
                    >
                      <MessageCircle size={15} /> {t("team.link.whatsapp")}
                    </a>

                    <a
                      href={createdLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                    >
                      <KeyRound size={15} /> {t("team.link.open")}
                    </a>
                  </div>
                  <p className="mt-3 text-[11px] text-emerald-800/80">
                    {t("team.link.help")}
                  </p>
                </div>
              )}
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h2 className="font-bold">{t("team.invitations.title")}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {t("team.invitations.subtitle")}
              </p>
            </div>

            {invitations.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">
                {t("team.invitations.empty")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-5 py-3">{t("team.table.employee")}</th>
                      <th className="px-5 py-3">{t("shell.role")}</th>
                      <th className="px-5 py-3">{t("team.table.expires")}</th>
                      <th className="px-5 py-3">{t("common.status")}</th>
                      <th className="px-5 py-3">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((invite) => {
                      const status = invitationStatus(invite);
                      const isPending = status.status === "pending";

                      return (
                        <tr key={invite.id} className="border-t border-slate-100">
                          <td className="px-5 py-4">
                            <p className="font-semibold">{invite.full_name}</p>
                            <p className="text-xs text-slate-500">
                              {invite.email}
                            </p>
                          </td>
                          <td className="px-5 py-4 text-slate-600">
                            {roleLabel(invite.role, t)}
                          </td>
                          <td className="px-5 py-4 text-slate-500">
                            {formatDate(invite.expires_at, locale)}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                status.tone === "ok"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : status.tone === "warn"
                                    ? "bg-orange-50 text-orange-700"
                                    : status.tone === "pending"
                                      ? "bg-blue-50 text-blue-700"
                                      : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {t(status.labelKey)}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            {isPending && canManage ? (
                              <button
                                onClick={() => revokeInvitation(invite.id)}
                                className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                              >
                                <Trash2 size={15} /> {t("common.remove")}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
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

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h2 className="font-bold">{t("team.members.title")}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {t("team.members.subtitle")}
              </p>
            </div>

            {loading ? (
              <p className="flex items-center gap-2 p-6 text-sm text-slate-500">
                <Loader2 className="animate-spin" size={16} /> {t("common.loading")}
              </p>
            ) : members.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">
                {t("team.members.empty")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-5 py-3">{t("shell.defaultUser")}</th>
                      <th className="px-5 py-3">{t("shell.role")}</th>
                      <th className="px-5 py-3">{t("team.table.joined")}</th>
                      <th className="px-5 py-3">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id} className="border-t border-slate-100">
                        <td className="px-5 py-4">
                          <p className="font-semibold">
                            {member.full_name || t("shell.defaultUser")}
                          </p>
                          <p className="font-mono text-[11px] text-slate-400">
                            {member.user_id.slice(0, 8)}…
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          {member.role === "owner" ? (
                            <span className="font-semibold text-emerald-700">
                              {roleLabel("owner", t)}
                            </span>
                          ) : canManage ? (
                            <select
                              value={member.role}
                              onChange={(e) =>
                                updateRole(member.id, e.target.value)
                              }
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"
                            >
                              {INVITE_ROLES.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {t(item.labelKey)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-slate-600">
                              {roleLabel(member.role, t)}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-slate-500">
                          {formatDate(member.created_at, locale)}
                        </td>
                        <td className="px-5 py-4">
                          {member.role !== "owner" && canManage ? (
                            <button
                              onClick={() => removeMember(member.id)}
                              className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={15} /> {t("common.remove")}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}

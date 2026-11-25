"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { asRole, type Role } from "@/lib/permissions";

export type Workspace = {
  business_id: string;
  business_name: string;
  role: Role;
  owner_id: string;
  currency: string;
  allow_negative_stock: boolean;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  receipt_footer: string | null;
};

type WorkspaceState = {
  loading: boolean;
  error: string;
  user: User | null;
  workspace: Workspace | null;
};

const initialState: WorkspaceState = {
  loading: true,
  error: "",
  user: null,
  workspace: null,
};

const MISSING_SETUP_MESSAGE =
  "Mfumo wa biashara haujakamilika kwenye seva. Msimamizi wa mfumo anahitaji kukamilisha usanidi wa hifadhidata.";

export function useWorkspace() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [state, setState] = useState<WorkspaceState>(initialState);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setState({
        loading: false,
        error: "Tafadhali ingia kwenye akaunti yako kwanza.",
        user: null,
        workspace: null,
      });
      return;
    }

    // Preferred path: membership-aware workspace resolution.
    const { data: rows, error: workspaceError } = await supabase.rpc(
      "get_my_workspace"
    );

    if (!workspaceError && Array.isArray(rows) && rows.length > 0) {
      const row = rows[0] as Record<string, unknown>;
      const role = asRole(String(row.role ?? ""));

      if (!role) {
        setState({
          loading: false,
          error: "Nafasi yako kwenye biashara haitambuliki.",
          user,
          workspace: null,
        });
        return;
      }

      setState({
        loading: false,
        error: "",
        user,
        workspace: {
          business_id: String(row.business_id),
          business_name: String(row.business_name ?? "Biashara Yangu"),
          role,
          owner_id: String(row.owner_id ?? user.id),
          currency: String(row.currency ?? "TZS"),
          allow_negative_stock: Boolean(row.allow_negative_stock),
          full_name: (row.full_name as string | null) ?? null,
          phone: (row.phone as string | null) ?? null,
          email: (row.email as string | null) ?? null,
          logo_url: (row.logo_url as string | null) ?? null,
          receipt_footer: (row.receipt_footer as string | null) ?? null,
        },
      });
      return;
    }

    // Fallback for databases where the new RPC has not been applied yet.
    // It preserves the original owner-only behaviour instead of breaking.
    const { data: business } = await supabase
      .from("businesses")
      .select("id, name, owner_id, currency, allow_negative_stock")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (business) {
      setState({
        loading: false,
        error: "",
        user,
        workspace: {
          business_id: business.id,
          business_name: business.name,
          role: "owner",
          owner_id: business.owner_id,
          currency: business.currency ?? "TZS",
          allow_negative_stock: Boolean(business.allow_negative_stock),
          full_name:
            (user.user_metadata?.full_name as string | undefined) ?? null,
          phone: null,
          email: user.email ?? null,
          logo_url: null,
          receipt_footer: null,
        },
      });
      return;
    }

    // No business yet: create one for the owner (idempotent).
    const businessName =
      (user.user_metadata?.business_name as string | undefined)?.trim() ||
      "Biashara Yangu";

    const phone =
      (user.user_metadata?.phone as string | undefined)?.trim() || null;

    const { data: createdId, error: createError } = await supabase.rpc(
      "create_business",
      { p_name: businessName, p_phone: phone }
    );

    if (createError) {
      if (createError.code === "PGRST202") {
        setState({
          loading: false,
          error: MISSING_SETUP_MESSAGE,
          user,
          workspace: null,
        });
        return;
      }

      setState({
        loading: false,
        error:
          "Imeshindikana kuandaa biashara yako. Tafadhali wasiliana na msaada.",
        user,
        workspace: null,
      });
      return;
    }

    setState({
      loading: false,
      error: "",
      user,
      workspace: {
        business_id: String(createdId),
        business_name: businessName,
        role: "owner",
        owner_id: user.id,
        currency: "TZS",
        allow_negative_stock: false,
        full_name:
          (user.user_metadata?.full_name as string | undefined) ?? null,
        phone,
        email: user.email ?? null,
        logo_url: null,
        receipt_footer: null,
      },
    });
  }, [supabase]);

  useEffect(() => {
    let active = true;

    void Promise.resolve().then(() => {
      if (active) void load();
    });

    return () => {
      active = false;
    };
  }, [load]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/");
  }, [supabase, router]);

  return { ...state, supabase, refresh: load, signOut };
}

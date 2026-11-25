import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { asRole } from "@/lib/permissions";
import type { DemoStatus } from "@/lib/demo/use-demo-status";

// Route Handlers are uncached by default in Next.js 16 Cache Components.
// createClient() reads request cookies, keeping this handler request-scoped.

type StatusRow = {
  is_demo: boolean;
  business_id: string | null;
  business_name: string | null;
  role: string | null;
  can_reset: boolean;
  last_reset_at: string | null;
};

const anonymousStatus: DemoStatus = {
  configured: isAdminConfigured(),
  isDemo: false,
  businessId: null,
  businessName: null,
  role: null,
  canReset: false,
  lastResetAt: null,
  unavailableReason: null,
};

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(anonymousStatus);
  }

  const { data, error } = await supabase.rpc("demo_current_status");

  if (error) {
    const reason =
      error.code === "PGRST202" ? "DEMO_SCHEMA_NOT_APPLIED" : "DEMO_STATUS_UNAVAILABLE";

    return NextResponse.json({
      ...anonymousStatus,
      configured: isAdminConfigured(),
      unavailableReason: reason,
    });
  }

  const rows = Array.isArray(data) ? (data as StatusRow[]) : [];
  const row = rows[0];

  if (!row) {
    return NextResponse.json({
      ...anonymousStatus,
      configured: isAdminConfigured(),
    });
  }

  const status: DemoStatus = {
    configured: isAdminConfigured(),
    isDemo: Boolean(row.is_demo),
    businessId: row.is_demo ? row.business_id : null,
    businessName: row.is_demo ? row.business_name : null,
    role: row.is_demo ? asRole(row.role) : null,
    canReset: Boolean(row.is_demo && row.can_reset),
    lastResetAt: row.is_demo ? row.last_reset_at : null,
    unavailableReason: null,
  };

  return NextResponse.json(status);
}

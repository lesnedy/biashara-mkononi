import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { consumeRateLimit } from "@/lib/demo/rate-limit";

// Route Handlers are uncached by default in Next.js 16 Cache Components.
// This handler reads the request body and session cookies on every call.

const requestSchema = z.object({
  confirm: z.literal("RESET"),
});

type ResetResult = {
  status: "ok" | "error";
  message: string;
  business_id: string | null;
};

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Tafadhali ingia kwenye akaunti yako kwanza." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Thibitisha kuweka neno RESET kabla ya kuendelea." },
      { status: 400 }
    );
  }

  // Key on the authenticated user only. A client-controlled forwarding header
  // must not be able to create unlimited rate-limit buckets.
  const limit = consumeRateLimit(`demo-reset:${user.id}`, {
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });

  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Umejaribu mara nyingi. Jaribu tena baada ya sekunde ${limit.retryAfterSeconds}.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const { data, error } = await supabase.rpc("reset_demo_business");

  if (error) {
    if (error.code === "PGRST202") {
      return NextResponse.json(
        { error: "Mfumo wa demo haujasanidiwa kwenye hifadhidata." },
        { status: 503 }
      );
    }

    if (error.code === "28000") {
      return NextResponse.json(
        { error: "Tafadhali ingia tena kwenye akaunti yako." },
        { status: 401 }
      );
    }

    if (error.code === "42501") {
      return NextResponse.json(
        { error: "Hauna ruhusa ya kurekebisha data ya demo." },
        { status: 403 }
      );
    }

    console.error("Demo reset RPC failed:", error.message);
    return NextResponse.json(
      { error: "Imeshindikana kurekebisha data ya demo. Jaribu tena." },
      { status: 500 }
    );
  }

  const rows = Array.isArray(data) ? (data as ResetResult[]) : [];
  const result = rows[0];

  if (!result || result.status !== "ok") {
    return NextResponse.json(
      { error: result?.message ?? "Imeshindikana kurekebisha data ya demo." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    businessId: result.business_id,
    message: "Data ya demo imerekebishwa kwa hali ya awali.",
  });
}

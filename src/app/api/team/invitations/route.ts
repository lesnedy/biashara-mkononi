
import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

const allowedRoles = [
  "admin",
  "manager",
  "cashier",
  "storekeeper",
];

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Tafadhali ingia kwanza kwenye akaunti yako." },
        { status: 401 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Taarifa zilizotumwa si sahihi." },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Taarifa hazijakamilika." },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;

    const fullName =
      typeof data.fullName === "string" ? data.fullName.trim() : "";

    const email =
      typeof data.email === "string"
        ? data.email.trim().toLowerCase()
        : "";

    const role = typeof data.role === "string" ? data.role : "";

    if (!fullName || fullName.length > 120) {
      return NextResponse.json(
        { error: "Weka jina sahihi la mfanyakazi." },
        { status: 400 }
      );
    }

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return NextResponse.json(
        { error: "Weka email sahihi." },
        { status: 400 }
      );
    }

    if (!allowedRoles.includes(role)) {
      return NextResponse.json(
        { error: "Nafasi uliyochagua hairuhusiwi." },
        { status: 400 }
      );
    }

    const requestedBusinessId =
      typeof data.businessId === "string" ? data.businessId : "";

    // Resolve the business through membership (Owner or Admin), never by
    // assuming the caller owns a business.
    let membershipQuery = supabase
      .from("business_members")
      .select("business_id, role")
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"]);

    if (requestedBusinessId) {
      membershipQuery = membershipQuery.eq("business_id", requestedBusinessId);
    }

    const { data: membership, error: membershipError } =
      await membershipQuery.limit(1).maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json(
        {
          error:
            "Biashara haijapatikana au huna ruhusa ya kutuma mialiko.",
        },
        { status: 403 }
      );
    }

    const business = { id: membership.business_id as string };

    const { data: pendingInvitation, error: pendingError } =
      await supabase
        .from("business_invitations")
        .select("id")
        .eq("business_id", business.id)
        .eq("email", email)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();

    if (pendingError) {
      console.error("Invitation lookup failed:", pendingError);

      return NextResponse.json(
        { error: "Imeshindikana kuhakiki mialiko ya awali." },
        { status: 500 }
      );
    }

    if (pendingInvitation) {
      return NextResponse.json(
        {
          error:
            "Tayari kuna mwaliko ambao haujaisha muda wake kwa email hii.",
        },
        { status: 409 }
      );
    }

    const token = randomBytes(32).toString("hex");

    const tokenHash = createHash("sha256")
      .update(token)
      .digest("hex");

    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { error: insertError } = await supabase
      .from("business_invitations")
      .insert({
        business_id: business.id,
        full_name: fullName,
        email,
        role,
        token_hash: tokenHash,
        invited_by: user.id,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("Invitation creation failed:", insertError);

      return NextResponse.json(
        { error: "Imeshindikana kutengeneza mwaliko." },
        { status: 500 }
      );
    }

    const origin = new URL(request.url).origin;
    const invitationUrl = `${origin}/invite/${token}`;

    return NextResponse.json({
      message: "Mwaliko umetengenezwa.",
      invitationUrl,
      expiresAt,
    });
  } catch (error) {
    console.error("Invitation API error:", error);

    return NextResponse.json(
      { error: "Kuna tatizo la seva. Jaribu tena." },
      { status: 500 }
    );
  }
}

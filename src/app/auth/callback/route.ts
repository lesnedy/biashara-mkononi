
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next");

  // Ruhusu redirect ya ndani pekee.
  const safeNext =
    requestedNext &&
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";

  if (!code) {
    return NextResponse.redirect(
      new URL("/?error=auth-callback", origin)
    );
  }

  try {
    const supabase = await createClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Auth callback error:", error.message);

      return NextResponse.redirect(
        new URL("/?error=auth-callback", origin)
      );
    }

    return NextResponse.redirect(
      new URL(safeNext, origin)
    );
  } catch (error) {
    console.error("Auth callback failed:", error);

    return NextResponse.redirect(
      new URL("/?error=auth-callback", origin)
    );
  }
}

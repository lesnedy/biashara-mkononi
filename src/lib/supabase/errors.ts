/**
 * Supabase/PostgREST reports a missing table in a couple of different ways:
 * the older Postgres wording and the newer schema-cache wording. Treat both
 * as a database setup problem rather than showing the raw error to users.
 */
export function isMissingTableError(message: string | null | undefined) {
  if (!message) return false;

  return (
    /could not find the table\b/i.test(message) ||
    /relation\s+"[^"]+"\s+does not exist/i.test(message) ||
    /\btable\s+"?[^"\s]+"?\s+does not exist/i.test(message)
  );
}

/** True when PostgREST could not resolve an RPC signature. */
export function isMissingFunctionError(message: string | null | undefined) {
  if (!message) return false;

  return (
    /could not find the function\b/i.test(message) ||
    /\bfunction\s+"?[^"\s]+"?\s+does not exist/i.test(message)
  );
}

const AUTH_ERROR_DETAILS: Record<string, { en: string; sw: string }> = {
  invalid_credentials: {
    en: "the email or password is incorrect",
    sw: "barua pepe au nenosiri si sahihi",
  },
  email_not_confirmed: {
    en: "please confirm your email address first",
    sw: "tafadhali thibitisha barua pepe yako kwanza",
  },
  email_address_invalid: {
    en: "the email address is invalid",
    sw: "barua pepe si sahihi",
  },
  weak_password: {
    en: "the password is too weak",
    sw: "nenosiri ni dhaifu sana",
  },
  user_already_registered: {
    en: "an account already exists for this email",
    sw: "akaunti tayari ipo kwa barua pepe hii",
  },
};

/**
 * Convert a raw Supabase/PostgREST error into a short, non-sensitive phrase
 * suitable for display. Never pass `error.message` directly to the UI.
 */
export function safeErrorDetail(
  error: { message?: string | null; code?: string | null } | null | undefined,
  locale: string
): string {
  const english = locale === "en";
  if (!error) return "";

  const code = error.code ?? "";
  const message = error.message ?? "";
  const authDetail = AUTH_ERROR_DETAILS[code];
  if (authDetail) return english ? authDetail.en : authDetail.sw;

  if (error.code === "PGRST205" || isMissingTableError(message)) {
    return english
      ? "database setup is incomplete"
      : "usanidi wa hifadhidata haukamilika";
  }
  if (error.code === "PGRST202" || isMissingFunctionError(message)) {
    return english
      ? "a database function is unavailable"
      : "kazi ya hifadhidata haipatikani";
  }
  if (error.code === "42501" || /permission denied/i.test(message)) {
    return english ? "permission denied" : "ruhusa imekataliwa";
  }
  return english ? "a database error occurred" : "hitilafu ya hifadhidata";
}

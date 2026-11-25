import type { Role } from "@/lib/permissions";

/**
 * PRIVATE DEMO UI CONFIGURATION
 *
 * Shared public demo accounts have been permanently removed. This module
 * contains browser-safe UI constants only. No credentials, business IDs,
 * service-role keys or provisioning secrets belong here.
 *
 * The private-demo start endpoint does not exist yet. Keep
 * PRIVATE_DEMO_START_AVAILABLE false until it is implemented and verified;
 * the login page renders the CTA as disabled in the meantime.
 */

export const PRIVATE_DEMO_START_AVAILABLE = false;
export const PRIVATE_DEMO_TTL_HOURS = 24;

export const PRIVATE_DEMO_ROLES: readonly Role[] = [
  "owner",
  "admin",
  "manager",
  "cashier",
  "storekeeper",
];

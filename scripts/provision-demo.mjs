/**
 * BIASHARA MKONONI — DEMO ACCOUNT PROVISIONING (MANUAL, SERVER ONLY)
 *
 * Usage:
 *   node scripts/provision-demo.mjs --dry-run
 *   node scripts/provision-demo.mjs
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local or the process environment.
 * This script is never called by the application. It must be run manually
 * after the administrator has reviewed and applied the demo migration.
 *
 * Safety rules enforced here:
 *   - aborts if any demo email already belongs to a non-demo auth user
 *   - aborts if a different business already uses the demo business name
 *   - never deletes or updates existing auth users or real businesses
 *   - never passes business_name/businessName in auth metadata, so the
 *     existing handle_new_user() registration behaviour is not simulated
 *   - idempotent: safe to re-run once the accounts already exist
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const DEMO_BUSINESS_ID = "11111111-1111-4111-8111-000000000001";
const DEMO_BUSINESS_NAME = "BIASHARA MKONONI DEMO";
const DRY_RUN = process.argv.includes("--dry-run");

// Keep in sync with src/lib/demo/config.ts (tests/verify-demo-config.test.mjs checks this).
const ACCOUNTS = [
  { role: "owner", email: "owner@gmail.com", password: "owner@123", full_name: "Demo Owner" },
  { role: "admin", email: "admin@gmail.com", password: "admin@123", full_name: "Demo Admin" },
  { role: "manager", email: "manager@gmail.com", password: "manager@123", full_name: "Demo Manager" },
  { role: "cashier", email: "cashier@gmail.com", password: "cashier@123", full_name: "Demo Cashier" },
  { role: "storekeeper", email: "storekeeper@gmail.com", password: "storekeeper@123", full_name: "Demo Storekeeper" },
];

function fail(message) {
  console.error(`\nABORTED: ${message}\n`);
  process.exit(1);
}

function loadEnv() {
  const fileEnv = {};
  const envPath = path.join(ROOT, ".env.local");

  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match) {
        fileEnv[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function listAllUsers(admin) {
  const users = [];
  const perPage = 200;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    users.push(...data.users);
    if (data.users.length < perPage) return users;
  }

  fail("More than 10,000 auth users; pagination guard reached. Review manually.");
}

function unwrap(error, label) {
  if (!error) return;
  if (error.code === "PGRST205") {
    fail(`${label} is not available. Apply supabase/migrations/20261125000100_demo_system.sql first.`);
  }
  fail(`${label}: ${error.message}`);
}

async function main() {
  const { url, serviceKey } = loadEnv();

  if (!url || !serviceKey) {
    fail(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. See .env.example."
    );
  }

  console.log(DRY_RUN ? "MODE: dry run (no changes)\n" : "MODE: provisioning (changes enabled)\n");

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Verify the demo migration was applied.
  const registry = await admin
    .from("demo_businesses")
    .select("business_id,label,display_name")
    .limit(5);
  unwrap(registry.error, "public.demo_businesses");

  // 2. Load existing demo state.
  const existingAccounts = await admin
    .from("demo_accounts")
    .select("user_id,email,role,business_id");
  unwrap(existingAccounts.error, "public.demo_accounts");

  const knownDemoUsers = new Map(
    (existingAccounts.data ?? []).map((row) => [row.email.toLowerCase(), row])
  );

  for (const row of existingAccounts.data ?? []) {
    if (row.business_id !== DEMO_BUSINESS_ID) {
      fail(`A demo account is registered to unexpected business ${row.business_id}.`);
    }
  }

  // 3. Refuse to adopt pre-existing non-demo users with the demo emails.
  const authUsers = await listAllUsers(admin);
  const authByEmail = new Map(authUsers.map((user) => [user.email?.toLowerCase(), user]));

  for (const account of ACCOUNTS) {
    const existingAuthUser = authByEmail.get(account.email);
    const registeredDemoUser = knownDemoUsers.get(account.email);

    if (existingAuthUser && !registeredDemoUser) {
      fail(
        `${account.email} already exists as a real auth user. Refusing to take over an existing account.`
      );
    }

    if (registeredDemoUser) {
      const registeredRole = registeredDemoUser.role;
      if (registeredRole !== account.role) {
        fail(`${account.email} is registered with role ${registeredRole}, expected ${account.role}.`);
      }
      if (existingAuthUser && registeredDemoUser.user_id !== existingAuthUser.id) {
        fail(`${account.email} registry points at a different auth user.`);
      }
    }
  }

  // 4. Refuse to touch a different business that already uses the demo name.
  const namedBusinesses = await admin
    .from("businesses")
    .select("id,name,owner_id")
    .eq("name", DEMO_BUSINESS_NAME);
  unwrap(namedBusinesses.error, "public.businesses");

  for (const business of namedBusinesses.data ?? []) {
    if (business.id !== DEMO_BUSINESS_ID) {
      fail(
        `Another business already uses "${DEMO_BUSINESS_NAME}" (id ${business.id}). Refusing to modify it.`
      );
    }
  }

  const registryRow = (registry.data ?? []).find(
    (row) => row.business_id === DEMO_BUSINESS_ID
  );
  if (registryRow && registryRow.label !== "shared") {
    fail(`Demo business is registered with unexpected label "${registryRow.label}".`);
  }

  const businessResult = await admin
    .from("businesses")
    .select("id,name,owner_id")
    .eq("id", DEMO_BUSINESS_ID)
    .maybeSingle();
  unwrap(businessResult.error, "public.businesses");

  if (DRY_RUN) {
    console.log(`Would create/reuse business ${DEMO_BUSINESS_ID} (${DEMO_BUSINESS_NAME}).`);
    for (const account of ACCOUNTS) {
      console.log(
        `Would ${knownDemoUsers.has(account.email) ? "reuse" : "create"} ${account.role}: ${account.email}`
      );
    }
    console.log("\nDry run complete. No changes were made.");
    return;
  }

  // 5. Create auth users first (owner first so the business has a valid owner).
  const userIds = new Map();

  for (const account of ACCOUNTS) {
    const existing = knownDemoUsers.get(account.email);
    if (existing) {
      userIds.set(account.role, existing.user_id);
      continue;
    }

    const created = await admin.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      // Deliberately no business_name / businessName: do not emulate signup.
      user_metadata: { demo: true, demo_role: account.role },
    });

    if (created.error) fail(`Creating ${account.email}: ${created.error.message}`);
    userIds.set(account.role, created.data.user.id);

    const profileUpdate = await admin
      .from("profiles")
      .update({ full_name: account.full_name })
      .eq("id", created.data.user.id);
    if (profileUpdate.error) {
      console.warn(`  profile name for ${account.email} not set: ${profileUpdate.error.message}`);
    }

    console.log(`Created auth user ${account.email}`);
  }

  const ownerId = userIds.get("owner");
  if (!ownerId) fail("Missing demo owner user id.");

  // 6. Create the single demo business once.
  if (!businessResult.data) {
    const created = await admin
      .from("businesses")
      .insert({ id: DEMO_BUSINESS_ID, name: DEMO_BUSINESS_NAME, owner_id: ownerId })
      .select("id")
      .single();
    unwrap(created.error, "creating demo business");
    console.log(`Created demo business ${DEMO_BUSINESS_ID}`);
  } else if (businessResult.data.owner_id !== ownerId) {
    fail(
      `Demo business owner is ${businessResult.data.owner_id}, expected demo owner ${ownerId}.`
    );
  }

  // 7. Register the demo business and its accounts.
  if (!registryRow) {
    const registered = await admin.from("demo_businesses").insert({
      business_id: DEMO_BUSINESS_ID,
      label: "shared",
      display_name: DEMO_BUSINESS_NAME,
      currency: "TZS",
      created_by: ownerId,
    });
    unwrap(registered.error, "registering demo business");
  }

  for (const account of ACCOUNTS) {
    if (knownDemoUsers.has(account.email)) continue;

    const registered = await admin.from("demo_accounts").insert({
      business_id: DEMO_BUSINESS_ID,
      user_id: userIds.get(account.role),
      email: account.email,
      role: account.role,
    });
    unwrap(registered.error, `registering ${account.email}`);
  }

  // 8. Ensure every role has exactly one business membership.
  for (const account of ACCOUNTS) {
    const userId = userIds.get(account.role);
    const membership = await admin
      .from("business_members")
      .select("id,role")
      .eq("business_id", DEMO_BUSINESS_ID)
      .eq("user_id", userId)
      .maybeSingle();
    unwrap(membership.error, `reading membership for ${account.email}`);

    if (!membership.data) {
      const inserted = await admin.from("business_members").insert({
        business_id: DEMO_BUSINESS_ID,
        user_id: userId,
        role: account.role,
        full_name: account.full_name,
      });
      unwrap(inserted.error, `adding membership for ${account.email}`);
      console.log(`Added ${account.role} membership for ${account.email}`);
    } else if (membership.data.role !== account.role) {
      fail(`${account.email} has membership role ${membership.data.role}, expected ${account.role}.`);
    }
  }

  // 9. Seed realistic demo data (idempotent, scoped to the demo business).
  const seeded = await admin.rpc("demo_seed_business", {
    p_business_id: DEMO_BUSINESS_ID,
  });
  unwrap(seeded.error, "seeding demo data");

  const counts = {};
  for (const table of [
    "stores",
    "products",
    "customers",
    "sales",
    "sale_items",
    "suppliers",
    "purchases",
    "expenses",
  ]) {
    const result = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("business_id", DEMO_BUSINESS_ID);
    if (!result.error) counts[table] = result.count ?? 0;
  }

  console.log("\nDemo provisioning complete.");
  console.log(`Business: ${DEMO_BUSINESS_NAME} (${DEMO_BUSINESS_ID})`);
  console.log(`Members: ${ACCOUNTS.length} role accounts`);
  console.log(`Seed counts: ${JSON.stringify(counts)}`);
}

main().catch((error) => {
  console.error("UNEXPECTED ERROR", error);
  process.exit(1);
});

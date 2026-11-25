import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  PRIVATE_DEMO_ROLES,
  PRIVATE_DEMO_START_AVAILABLE,
} from "../src/lib/demo/config.ts";
import { consumeRateLimit } from "../src/lib/demo/rate-limit.ts";

const ROOT = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const SHARED_CREDENTIALS = [
  "owner@gmail.com",
  "admin@gmail.com",
  "manager@gmail.com",
  "cashier@gmail.com",
  "storekeeper@gmail.com",
  "owner@123",
  "admin@123",
  "manager@123",
  "cashier@123",
  "storekeeper@123",
];

const PRIVATE_KEYS = [
  "demo.privateChip",
  "demo.privateTitle",
  "demo.privateDescription",
  "demo.privateAccess",
  "demo.privateCta",
  "demo.privateUnavailable",
  "login.previewBadge",
  "login.previewValue",
  "login.previewNote",
];

test("private demo config exposes no shared credentials or account registry", () => {
  const config = read("src/lib/demo/config.ts");

  for (const credential of SHARED_CREDENTIALS) {
    assert.ok(!config.includes(credential), `config still contains ${credential}`);
  }

  assert.doesNotMatch(config, /\bDEMO_ACCOUNTS\b/);
  assert.doesNotMatch(config, /\bfindDemoAccount\b/);
  assert.doesNotMatch(config, /\bDEMO_BUSINESS_NAME\b/);
  assert.equal(PRIVATE_DEMO_START_AVAILABLE, false);
  assert.deepEqual([...PRIVATE_DEMO_ROLES], [
    "owner",
    "admin",
    "manager",
    "cashier",
    "storekeeper",
  ]);
});

test("login page contains no shared demo cards, credentials or autofill", () => {
  const page = read("src/app/page.tsx");
  const config = read("src/lib/demo/config.ts");
  const source = `${page}\n${config}`;

  for (const credential of SHARED_CREDENTIALS) {
    assert.ok(!source.includes(credential), `source still contains ${credential}`);
  }

  assert.doesNotMatch(page, /\bDEMO_ACCOUNTS\b/);
  assert.doesNotMatch(page, /selectDemoAccount/);
  assert.doesNotMatch(page, /demo-use-button/);
  assert.doesNotMatch(page, /demo\.sharedNotice/);
  assert.doesNotMatch(page, /demo\.setupPending/);
  assert.doesNotMatch(page, /demo\.fillCredentials/);
  assert.doesNotMatch(page, /login\.live/);
  assert.doesNotMatch(page, /login\.growthWeek/);
  assert.doesNotMatch(page, /live-dot/);
});

test("login page renders a disabled private demo panel", () => {
  const page = read("src/app/page.tsx");

  assert.match(page, /private-demo-panel/);
  assert.match(page, /t\("demo\.privateTitle"\)/);
  assert.match(page, /t\("demo\.privateDescription"\)/);
  assert.match(page, /t\("demo\.privateAccess"\)/);
  assert.match(page, /PRIVATE_DEMO_ROLES\.map/);
  assert.match(page, /t\("demo\.privateCta"\)/);
  assert.match(page, /disabled=\{!PRIVATE_DEMO_START_AVAILABLE\}/);
  assert.match(page, /t\("demo\.privateUnavailable"\)/);
});

test("ordinary login, registration and password visibility are preserved", () => {
  const page = read("src/app/page.tsx");

  assert.match(page, /signInWithPassword/);
  assert.match(page, /href="\/forgot-password"/);
  assert.match(page, /href="\/register"/);
  assert.match(page, /showPassword/);
  assert.match(page, /autoComplete="current-password"/);
  assert.match(page, /params\.get\("next"\)/);
  assert.match(page, /router\.replace\(destination\)/);
});

test("private demo translations exist in both dictionaries and shared claims are gone", () => {
  const i18n = read("src/lib/i18n.tsx");

  for (const key of PRIVATE_KEYS) {
    const occurrences = i18n.split(`"${key}"`).length - 1;
    assert.ok(occurrences >= 2, `${key} must be defined in both dictionaries`);
  }

  assert.match(i18n, /inandaliwa|inaandaliwa/i);
  assert.match(i18n, /coming soon/i);

  for (const stale of [
    "login.live",
    "login.growthWeek",
    "demo.title",
    "demo.subtitle",
    "demo.fillCredentials",
    "demo.sharedNotice",
    "demo.setupPending",
  ]) {
    assert.doesNotMatch(i18n, new RegExp(`"${stale.replace(/\./g, "\\.")}"`));
  }

  assert.doesNotMatch(i18n, /\+12\.8%/);
});

test("demo rate limit blocks requests after the configured threshold", () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  const options = { limit: 2, windowMs: 60_000, now: 1_000 };

  assert.equal(consumeRateLimit(key, options).allowed, true);
  assert.equal(consumeRateLimit(key, options).allowed, true);

  const blocked = consumeRateLimit(key, options);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 60);
});

test("demo migration scopes every delete to the demo business", () => {
  const migration = read("supabase/migrations/20261125000100_demo_system.sql");
  const deletes = [...migration.matchAll(/delete from public\.[\w.]+[^\n]*/g)].map(
    (match) => match[0]
  );

  assert.ok(deletes.length > 0, "expected scoped deletes in reset/seed functions");

  for (const statement of deletes) {
    assert.match(
      statement,
      /where business_id = (?:%L|v_business|p_business_id)/,
      `unscoped delete in migration: ${statement}`
    );
  }

  assert.match(migration, /demo_is_owner\(v_business\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.doesNotMatch(migration, /\btruncate\s+(table\s+)?public\./i);
});

test("no secret key name is exposed through a NEXT_PUBLIC_ variable", () => {
  const example = read(".env.example");
  assert.doesNotMatch(example, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(example, /^SUPABASE_SERVICE_ROLE_KEY=/m);
});

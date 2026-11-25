import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  isMissingFunctionError,
  safeErrorDetail,
} from "../src/lib/supabase/errors.ts";

const ROOT = process.cwd();

function appTsxFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...appTsxFiles(fullPath));
    } else if (entry.name.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

test("recognizes missing RPC signatures", () => {
  assert.equal(
    isMissingFunctionError(
      "Could not find the function public.complete_sale(p_business_id) in the schema cache"
    ),
    true
  );
  assert.equal(isMissingFunctionError("some unrelated error"), false);
});

test("safeErrorDetail redacts raw database details", () => {
  const sw = "Could not find the table 'public.sales' in the schema cache";
  const en = "permission denied for table private_notes";

  assert.equal(
    safeErrorDetail({ code: "PGRST205", message: sw }, "sw"),
    "usanidi wa hifadhidata haukamilika"
  );
  assert.equal(
    safeErrorDetail({ code: "PGRST202", message: en }, "en"),
    "a database function is unavailable"
  );
  assert.equal(
    safeErrorDetail({ code: "42501", message: en }, "en"),
    "permission denied"
  );
  assert.equal(
    safeErrorDetail({ message: "invalid input syntax for type numeric" }, "en"),
    "a database error occurred"
  );
});

test("safeErrorDetail maps common auth errors", () => {
  assert.equal(
    safeErrorDetail({ code: "invalid_credentials", message: "raw" }, "sw"),
    "barua pepe au nenosiri si sahihi"
  );
  assert.equal(
    safeErrorDetail({ code: "email_not_confirmed", message: "raw" }, "en"),
    "please confirm your email address first"
  );
});

test("pages never interpolate raw Supabase error messages", () => {
  const rawDetail = /variables:\s*\{\s*(?:detail|message):\s*[^}]*\.message\b/;

  for (const file of appTsxFiles(path.join(ROOT, "src", "app"))) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      rawDetail,
      `raw error message rendered in ${path.relative(ROOT, file)}`
    );
  }
});

test("unaudited client-side fallbacks are removed", () => {
  const checks = [
    ["src/app/inventory/page.tsx", /\.update\(\{\s*quantity/],
    ["src/app/customers/page.tsx", /\.update\(\{\s*balance/],
    ["src/app/products/page.tsx", /\.update\(\{\s*quantity:\s*opening/],
    ["src/app/team/page.tsx", /\.update\(\{\s*role/],
    ["src/app/team/page.tsx", /\.from\("business_members"\)\s*\.delete/],
    ["src/app/team/page.tsx", /\.from\("business_invitations"\)\s*\.delete/],
  ];

  for (const [relativePath, pattern] of checks) {
    assert.doesNotMatch(
      fs.readFileSync(path.join(ROOT, relativePath), "utf8"),
      pattern,
      `unaudited fallback still present in ${relativePath}`
    );
  }
});

test("new bilingual error and unavailable-state keys exist", () => {
  const i18n = fs.readFileSync(path.join(ROOT, "src/lib/i18n.tsx"), "utf8");

  for (const key of [
    "dashboard.unavailable",
    "reports.unavailable",
    "products.errorOpeningStock",
  ]) {
    const occurrences = i18n.split(`"${key}"`).length - 1;
    assert.ok(occurrences >= 2, `${key} must exist in both dictionaries`);
  }

  assert.doesNotMatch(
    i18n,
    /"sales\.errorRpcInsufficientStock": "[^"]*\{detail\}"/,
    "insufficient-stock notice must not embed a raw error detail"
  );
});

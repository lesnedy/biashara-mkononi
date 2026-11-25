import assert from "node:assert/strict";
import test from "node:test";

import { isMissingTableError } from "../src/lib/supabase/errors.ts";

test("recognizes both Postgres and PostgREST missing-table messages", () => {
  assert.equal(
    isMissingTableError(
      "Could not find the table 'public.sales' in the schema cache"
    ),
    true
  );
  assert.equal(
    isMissingTableError('relation "public.sales" does not exist'),
    true
  );
  assert.equal(isMissingTableError("table sales does not exist"), true);
});

test("keeps unrelated errors and missing columns as load errors", () => {
  for (const message of [
    undefined,
    null,
    "",
    "Could not find the 'total' column of 'sales' in the schema cache",
    "invalid input syntax for type numeric",
  ]) {
    assert.equal(isMissingTableError(message), false, String(message));
  }
});

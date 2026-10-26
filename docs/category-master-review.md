# Category master table and CSV review

## Scope and behavior

- Admin-only row editing, explicit save/undo, status toggles, optimistic `updated_at` updates. Staff retains read access. No deletion UI or DELETE grant.
- CSV export/import is admin-only. Export includes saved category configuration only, with a UTF-8 BOM and spreadsheet-formula escaping. Import accepts UTF-8 with/without BOM, quoted commas/quotes/newlines, at most 256 KiB and 500 records. Shift_JIS and malformed data are rejected.
- Columns (exact order): `id,new_key,parent_id,parent_new_key,category_name,display_order,is_active,updated_at`.
- Existing rows retain `id` and `updated_at`; unknown IDs fail. New rows leave both blank and supply a unique ASCII `new_key`. `parent_id` references an existing UUID; `parent_new_key` references a new row, including a later CSV row. Both parent fields cannot be populated together. No name matching, implicit deletion, or automatic cascading deactivation.
- Preview shows before/after values and errors. Confirmation performs one RPC transaction; any failure rolls back all writes. Every attempt invalidates the preview. An uncertain network result asks for reloading/exporting instead of automatic retry.
- Names are compared case-sensitively after matching JavaScript whitespace trimming, including tabs/full-width spaces. Inactive rows also participate in sibling uniqueness. Different parents may use the same name.
- An active category must have an active parent. Parent deactivation fails while active children remain; CSV may explicitly deactivate/move children and parent in the same transaction.
- Existing transaction/category IDs remain unchanged. Existing inactive categories remain readable for history. No customer CSV, OCR, Auth/Storage or transaction-access changes.

## Migration and permissions

Formal CLI-generated migration: `supabase/migrations/20261026040515_category_master_atomic_csv.sql`.

- Preflight aborts on existing duplicates, invalid names/levels, active children of inactive parents, or cycles. No corrective UPDATE/DELETE.
- Adds a stored normalized-name generated column and deferrable sibling uniqueness constraint (NULL root parent included), plus a normalized-name length check.
- Adds an INVOKER statement guard using the same advisory transaction lock as the existing hierarchy trigger, before row locks. Repeatable Read writes are explicitly rejected to avoid stale snapshots after waiting. Default Read Committed and Serializable are supported; serialization/conflict errors require a new preview.
- Adds a deferrable INVOKER active-parent constraint trigger. Existing hierarchy/cycle/level triggers and all RLS policies/column grants remain unchanged.
- `public.save_category_batch(jsonb)` is SECURITY INVOKER with empty search_path, auth.uid and private.is_admin checks, strict field/type/count/size checks, all revision checks under the lock, projected full-graph validation and parent-first writes. DB-generated IDs are used for new rows. Sibling uniqueness and active-parent checks are deferred only inside the batch, then forced immediate before returning.
- PUBLIC/anon EXECUTE are revoked on the new RPC; only authenticated is granted EXECUTE, with admin checked inside. Trigger functions revoke PUBLIC/anon/authenticated direct EXECUTE. The private immutable text-normalization helper grants only authenticated EXECUTE; it reads no data. No SECURITY DEFINER is added.
- Applying the stored generated column scans existing rows and requires a table DDL lock. Apply during a low-write window. The application must not expose CSV import before the migration is installed.
- Rollback commands are in the migration comments. Roll back the app first, then drop RPC/triggers/constraints/generated column/helper. This removes validation, never rewrites category or transaction data. Do not repair migration history implicitly.

## Verification

- Typecheck, lint, full unit/PGlite suite and production build.
- Real PostgreSQL 17 concurrency tests: concurrent parent disable/child insert, sibling duplicate, opposite parent moves, and identical CSV revision writers. One conflicting writer is rejected; no invalid graph commits. Repeatable Read rejection verified. Reproducible test: `python app/tests/database/category-concurrency.py` using the pinned official image, no network/host ports, synthetic data, container removed on exit.
- CSV parser/action tests: malformed quotes, newlines, BOM, invalid UTF-8, formula prefixes, limits, unknown IDs/parents, duplicate keys/names, exact microseconds, admin gate, export allowlist/no-store, single RPC and no retry.
- DB tests: reversed-order new parent/child, sibling rename swap, joint deactivation, stale revision before any writes, injected late-write failure rollback, legacy-migration failure preserves data, direct-write constraints and ACLs.
- Browser: actual components with synthetic adapters; 1440/390 px, file preview/confirmation/error, staff boundary, repeated row save/undo, new-row reset, clean server refresh and preserved dirty draft, no page overflow/browser errors/external calls. HOME regression also runs separately with local SQL.
- Not verified: real authenticated production UI/PostgREST export/import. No production writes, push, PR or deployment in this task. Migration awaits independent review/application.

Local-only screenshots and logs: `docs/category-review-artifacts/` (not included in the application or commit).

# Two-level category editor

The category master now shows parent and child names together, with child edits in place and a separate parent editor that explains the effect of a rename. Root creation, child creation/move, active status, search and cancel are explicit operations. Internal UUIDs are not displayed; IDs and purchase item relationships remain unchanged. Existing display_order is preserved on edits (new rows use zero); CSV remains available in a collapsed supplementary panel with its existing columns and atomic save contract.

## Integrity and permissions

- Existing requireProfile/requireAdmin, table RLS, grants, category write lock, sibling-name constraint, active-parent constraint and save_category_batch RPC are unchanged.
- A draft retains its original microsecond updated_at even if refreshed data arrives. The existing action compares ID and revision; a conflict leaves the draft intact.
- Only root categories can be selected as a child's parent. Parent editing cannot reparent a root. Malformed/deeper data blocks editing rather than silently flattening it.
- CSV preview rejects a final graph containing third-level nodes. The new database CHECK enforces the same limit for direct API and CSV writes, including moves of parents that still have children. Existing hierarchy triggers derive and propagate category_level; a failed descendant constraint rolls back the whole operation.
- One table editor at a time; search and CSV controls are inert during editing; pending saves cannot be cancelled. Tab/Escape and focus restoration are supported. Page unload/navigation warns about an unsaved draft.
- Staff retain read-only master access. Customer, HOME, transaction, document and storage permissions are not modified.

## Migration

20261026081626_category_two_levels.sql adds only category_max_two_levels CHECK (category_level <= 2). It locks the category table, checks existing depth and parent relationships, then validates the constraint in the same transaction. lock_timeout is five seconds. If lock acquisition or preflight fails, retry only after checking the result; do not repair data automatically. Applying it briefly blocks category reads/writes. No rows are deleted, moved, renamed or otherwise rewritten.

Read-only production preflight on 2026-10-26: total 4 categories, maximum level 2, zero deeper rows. This is distinct from local synthetic fixture testing. Migration is not yet applied by this branch.

Rollback: after application rollback if required, separately review `alter table public.product_categories drop constraint category_max_two_levels;`. No permission or RPC rollback is needed. The old app remains compatible with existing two-level rows; any attempted third-level write will fail after migration.

## Verification

- npm ci and npm run check: TypeScript, lint, 236 tests across 22 files, production build.
- Real React component in Chromium using local synthetic action adapters: desktop, 390/320 widths, explicit saves/cancel, Escape/Enter/Tab, focus, conflict draft preservation after refresh, pending save controls, parent rename, empty root, duplicate inactive sibling, active-parent guard, child relocation, filters/empty/reset, staff readonly, retained CSV panel. No JavaScript errors.
- PGlite migration tests: legacy depth preflight rollback/no rewriting, direct third-level rejection, parent-with-child move rejection, CSV all-or-nothing rollback, valid two-level movement, unchanged admin/RPC gates.
- Actual isolated PostgreSQL concurrency: inactive parent race, duplicate names, cycle race, concurrent depth violation, stale CSV revision race, repeatable-read rejection. Six cases passed; synthetic data, no exposed ports.
- Real authenticated Supabase/browser E2E remains unverified. No production mutation tests or production credentials were used.

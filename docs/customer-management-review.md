# Customer directory and admin-only customer updates

## Behavior

The customer list supports independent name/kana, registration store, telephone, repeat-customer card and registration-date from/to filters, combined with AND. Name matches name OR kana with a case-insensitive literal substring. Telephone/card are literal substrings; leading zeros are preserved. No punctuation removal or kana-script conversion is performed. Dates use Asia/Tokyo midnight through the following exclusive midnight and accept finite 0001-01-01 through 9999-12-31. SQL validates NULL page, page bounds and input lengths too.

Customer selection opens an inline right detail panel; at narrow widths the panel follows the list. Selection, filters and pagination use the URL. Closing preserves applied filters, Escape closes the read-only panel, focus moves to its heading and returns to the selected row on close. The panel is keyed by actor ID, role and customer ID so editing state is not shared across identities/selections. Admins receive an edit form; staff do not. The existing direct customer route shows a read-only record to staff within the original store scope. Staff can still register a new customer at their own store.

CSV is not included. Transaction customer/store linkage is unchanged: a transaction must reference a customer record registered at that same store. Cross-store directory discovery does not authorize reuse of another store's record for a local transaction.

## Database and security

Formal CLI-generated migration: `supabase/migrations/20261026033404_customer_directory_admin_updates.sql`.

- Existing customer SELECT RLS stays store-scoped. The new directory returns only id, store_id, name, name_kana, phone, membership_card_number and created_at. Store labels contain only id/name. No address, DOB, occupation, DM status, identification fields, first/last visit dates or documents are returned.
- `public.get_customer_directory` is SECURITY INVOKER and delegates to `private.customer_directory`, SECURITY DEFINER with empty search_path. The narrowly privileged reader is necessary to read cross-store allowlisted columns without opening the sensitive base table. It derives identity from auth.uid() and requires an active admin, or an active staff member with an active assigned store. It checks this independently even when called directly. No actor/role argument or dynamic SQL exists.
- Both exact function signatures revoke PUBLIC and anon execution and grant authenticated execution. The internal function is in the unexposed private schema. Existing schema USAGE is reused; no schema or external permissions are broadened.
- The existing permissive `customers.store_update` policy is replaced with private.is_admin() in both USING and WITH CHECK. Adding another permissive policy would not restrict staff. Existing INSERT and column grants remain. Server Action independently rejects existing-record updates from staff.
- Customer-related document policies, transaction policies, Storage policies and private.can_access_store remain unchanged. Directory store labels never replace the writable/accessible store list used by businessSession/storeAllowed.
- Administrative edits still use the authenticated session and existing base-table RLS. New read output is validated against a strict client-projection schema before rendering. RPC failures/unknown fields produce safe feedback without a stale detail panel.
- Service-role is privileged and can bypass RLS; this change does not claim to constrain arbitrary privileged SQL. Application service clients are used only in existing upload/AI paths, not customer edits. The existing service RPCs still verify their actor/store; import review saves document reviewed_result only. The controlled visit-date trigger remains privileged and continues to maintain derived dates after staff records transactions.
- No data backfill, customer merge, deletion, registered-store change or table-column addition.

## Verification

`npm --prefix app run check`: typecheck, lint, 15 test files / 151 tests, production build passed.

Additional SQL/PGlite tests cover exact projection, staff cross-store discovery vs base-table isolation, direct staff UPDATE denial, admin UPDATE, staff own-store INSERT vs other-store denial, derived visit-date maintenance, inactive caller/profile/store, inactive target historical customers, anon grants, direct internal-function auth gate, kana/literal wildcard search, JST dates, infinity/range/NULL-page rejection and pagination. Existing image/Storage/service processing tests apply the new migration; tests verify cross-store directory selection does not expose images/imports, and AI/review processing does not alter customer records.

Server tests cover auth-before-query, invalid input, RPC argument mapping, staff cross-store URL, no sensitive full-record reads for staff, per-request admin/staff separation, unexpected-field rejection, network/RPC errors and missing selection. Browser review uses actual page/layout/form components with synthetic read/Router adapters: selection/edit/close repeated three times, Escape, direct URLs, back navigation, rapid selections, role switch, cross-store no-edit/no-related link, missing/error state, 1440px/390px and no page-wide overflow. The existing portal screens were smoke tested too. Local screenshots are excluded from source control and deployment.

Browser adapters are not real authentication/PostgREST E2E. Live migration application, owner/ACL verification and authenticated production E2E remain rollout checks. Do not deploy this app change before the migration: the directory endpoint is required.

## Rollout and rollback

Review/apply the migration first; verify the function owners, exact ACLs, active/inactive/anonymous access and store boundaries, then deploy the app. No migration history repair is required by this feature.

To remove the new read surface, drop the public wrapper first and then the private reader using the exact signatures. Reverting the UI alone leaves the admin-only UPDATE restriction in force. Restoring staff UPDATE permission is a separate authorization decision, not an automatic rollback step. Original data and other resource policies are untouched.

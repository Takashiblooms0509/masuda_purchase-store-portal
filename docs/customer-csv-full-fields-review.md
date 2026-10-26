# Customer identification choices and 13-column CSV

Review draft only. No production migration, push, or deployment. Base main: 8394c9f74ba4620915c713736f56b1211b9a6908.

## Format

Exact headers (in order): 登録店舗, 氏名, フリガナ, 生年月日, 性別, 職業, 電話番号, メンバーズカード番号(リピーターNo,), 郵便番号, 住所, DM可否, 本人確認書類の種類, 本人確認書類番号.
The card header contains a literal comma and is quoted in the CSV. No ※ suffix.

UTF-8 with optional BOM, output BOM/CRLF; 32 KiB, 20 data rows. 登録店舗 is the existing active store CODE, never a display name or UUID. Required: code/name. The dialog lists allowed codes and names. Staff own-store only; admin can select active stores. DOB: YYYY-MM-DD, actual calendar date. Gender: 男性/女性/その他/未回答 or blank. DM: 可/不可 or blank (unknown). Types: 運転免許証/マイナンバーカード/パスポート/その他 or blank. Phone/card/postal/document numbers remain strings, preserving zeros; spreadsheet columns must be text. Memo and images are excluded.

## Identity safety and legacy behavior

My Number card type is permitted, number must be blank. UI disables it; parser/server/schema/database trigger reject a nonempty value. No inference from length: other document numbers can be 12 digits. Test identifiers are obviously synthetic.

Existing private customer_detail projection returns NULL for identification_number when type is マイナンバーカード or the existing enum spelling my_number_card. Response shape, auth gate, owner and ACL are unchanged. The admin edit page now uses that projection instead of SELECT *. No existing raw number is sent to the client through these pages. Existing admin edits read only the current type; the update omits identification_number for My Number types, preserving it without reading. Type changes away from My Number are blocked in this form for separate remediation. Optimistic type predicate rejects a concurrent type change. Unknown legacy type remains a visible existing option; unchanged values are not normalized or deleted. SQL guard permits unchanged legacy type/number on unrelated updates; it rejects changing new values to invalid types or relabelling an unchanged legacy My Number number.

Base table SELECT grants/RLS remain unchanged. Thus existing authorized direct table access is NOT revoked by this patch; the projection is a portal retrieval safeguard, not column-level encryption or a universal database read prohibition. No actual legacy identity values were inspected. Any separate remediation/access revocation needs its own review. Image guidance says My Number card front only; no image content detection, deletion or OCR is added.

## Migration/security/compatibility

20261026092625_customer_csv_full_fields.sql has no new columns, no data rewrite, no RLS/grant widening. A SECURITY INVOKER trigger validates new identity values on direct/service writes. Existing private.customer_detail remains SECURITY DEFINER, fixed empty search_path and existing gate/ACL; only the number expression changes. New public.insert_customer_csv_v2 is SECURITY INVOKER, empty search_path, PUBLIC/anon revoked, authenticated granted. It uses existing RLS, active profile gate, own-store check, write advisory lock, receipt digest, exact candidate recheck, and atomic insert-only transaction. All 13 columns have explicit mapping and validation. No update/upsert branch exists.

Legacy insert_customer_csv and its response/ACL remain unchanged; legacy/new writers share the lock and receipt table. Migration before new app deployment keeps old 5-column clients usable. Deploy rollback can restore old app without removing the new RPC/guard/projection; do not roll back the safety projection merely to restore UI. Structural rollback (if separately reviewed) drops v2 and the new trigger/function; no stored rows are modified. Keep prior private.customer_detail definition available for comparison, but restoring raw-number output is not recommended.

## Validation

npm run check: typecheck, lint, 257 tests in 23 files, production build PASS.
Actual React components with production-emitted CSS: 1440/390/320 widths, centered add/CSV dialogs, right detail, all form fields, type choices/disabled number, CSV preview/duplicate selection, Escape/focus restoration PASS. Uses synthetic adapters, not real Supabase authentication.
PGlite full migration chain: direct identity guards, legacy preservation/projection, v2 fields, atomic rollback, idempotent digest/replay, field/type/date rejection, staff other-store denial, inactive and anon denial, exact legacy RPC definition compatibility, v2 invoker/ACL.
Isolated PostgreSQL 17 concurrency: original six checks plus v2 identical retry, v2 duplicate race, legacy/v2 writer race PASS. No production users/data/credentials created.

Remaining: independent migration/API review; final user confirmation of My Number blank-only policy; actual authenticated browser E2E; authorized migration/release gate. No production publication claimed.

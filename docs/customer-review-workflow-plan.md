# Customer workflow implementation / review checkpoint

Branch: feat/customer-review-workflow. Base: 8fcf4bc0304c3c702b08b34911d5f9ad9c71473f.
Production migration, push, PR, merge and deployment have NOT been performed.

## Implemented UI and field coverage

HOME-size 44px search controls; six columns 名前・店舗・年齢・性別・カード番号・登録日時; aligned add action; wide bounded right-side native dialog; two-column facts; keyboard focus/close/Escape; memo below identity; recent transactions and identity-image tabs with pagination. Actual component screenshots are local synthetic verification artifacts only and are not shipped in the app bundle.

Fields: name, name_kana, birth_date (age derived), occupation, postal_code, address, phone, dm_allowed, membership_card_number, identification_type, identification_number; added nullable gender (female/male/other/unspecified) and memo (1000-character bound). Store chosen only for new customers; existing store/system IDs/timestamps not editable. first_visit_date/last_visit_date remain derived from transactions. Identity number masked by default. Missing newly added fields from old forms do not clear existing new-column values.

Repository migrations have no customer notes/memo/gender column. Transaction/item notes are unrelated. Confirm actual production metadata before applying to detect drift; no actual production data was inspected or copied.

## Final authorization scope

All active, assigned-to-active-store staff and active admins can read all stores' customer business fields, identity images and customer-associated transaction summaries via a narrow authenticated customer surface. Existing customer updates remain admin-only. Staff can create NEW customers in their own active store, including insert-only CSV. Admin chooses eligible active stores. No existing-row upsert/merge import.

Base customers SELECT, purchase_transactions SELECT, can_access_store, HOME/reporting and Storage policies are unchanged. New all-store reads do not grant cross-store transaction editing or general raw-file access. Direct staff customer detail links redirect to the customer surface; document management links are admin-only.

## CSV contract

Template headers, in exact order: 登録店舗コード,氏名,フリガナ,電話番号,リピーターズカード番号.
Template output only, not export of existing customer records. No DOB, address, gender, memo, identity number, image path, internal UUID, role or update operation in CSV.
UTF-8/BOM/CRLF; 32 KiB and 20 data rows; quoted commas/newlines/doubled quotes; leading zeros retained; formula-like cells and malformed/extra/reordered headers rejected. Existing candidates shown and initially excluded; explicit selection means a distinct new person. Matching candidates within the same file require file correction before import. Unknown/ineligible store codes rejected; staff store resolved from current profile. Server validates and RPC revalidates before writes.

One RPC transaction covers all rows. New/changed candidate sets reject the batch; partial inserts roll back. SHA256 digest and actor/request key receipt permit same-payload retry without duplicate insertion; a changed payload with the same key is rejected. Receipts contain no imported plaintext. They live in private schema with own-actor RLS and no exposed public table.

## Exact migration and security changes

File: 20261026062254_customer_review_workflow.sql
SHA256: bad166dfd7df046d46ed0808ed8fac7d0f6240295aeafc493ebd52ef0d4aee41

1. customers: add nullable gender/memo and corresponding existing-role column write grants; existing row policies stay in place.
2. private.customer_reader_allowed(): SECURITY DEFINER, empty search_path, derives identity from auth.uid()/current profiles/store state. No arguments to spoof an actor. Authenticated execute only, no PUBLIC/anon.
3. private.customer_detail(uuid,integer,integer): SECURITY DEFINER, same gate, explicit JSON business projection, required customer ID. History 10 rows/page, documents 20/page, pages 1..10000. Ownership is customer_id, not a caller-supplied store or arbitrary query. No raw AI result, storage path, upload metadata, auth data or secrets returned. public.get_customer_detail is INVOKER with identical authenticated-only ACL.
4. Existing private.customer_directory projection gains only gender and derived age; DOB remains absent. Existing signature, filter logic, wrapper and ACL retained.
5. public.customer_media_source(uuid,uuid,uuid): SECURITY INVOKER, service_role execute only. Rechecks supplied actor against current profiles/store eligibility, joins document.customer_id to requested customer and resolves stored image metadata. Server obtains actor from authenticated session, never from request data. Authenticated/anon cannot call this function. Existing server credential reused, no secret/config changes.
6. Dedicated customer image endpoint signs only server-resolved path in the fixed private bucket for 60 seconds. Response private/no-store/no-referrer, no arbitrary bucket/path accepted. A previously issued signed capability may remain usable until its 60-second expiry after revocation; no shared cache or permanent/public image URL.
7. customer_documents replaces its permissive ALL policy with unchanged scoped SELECT plus admin-only INSERT/UPDATE. Existing metadata server action also checks admin. prepare_document_upload and complete_document_upload retain signatures/ACL/logic, with an added active-admin check only for customer_document kind. Import-document upload behavior is unchanged. Staff can enter identity fields when creating a customer but cannot mutate document metadata/upload images.
8. private.customer_write_guard statement trigger serializes customer INSERT/UPDATE/DELETE using transaction advisory lock 73620491. CSV uses the same lock; repeatable-read import rejected, read-committed/serializable supported. Existing refresh_customer_visits body gains that lock before its existing row locks to keep ordering consistent; visit aggregation itself unchanged.
9. private.customer_import_receipts has own-actor SELECT/INSERT RLS; no UPDATE/DELETE grant. public.insert_customer_csv is INVOKER, authenticated-only; strict allowlist, size/type/length/store checks, candidate-set comparison, insert-only SQL, digest-bound idempotency. No service-role customer writes.

Trusted function ownership must be verified after application (expected migration administrator/postgres, never a user-controlled owner). Private schema must remain unexposed by the Data API. No broadening of can_access_store or bucket policy is required.

## Validation and limits

Full check command: npm --prefix app run check (type generation/TypeScript, ESLint, full unit and actual-SQL tests, Next production build). Completed successfully: 22 test files / 231 tests, TypeScript, ESLint and Next production build. Six real-PostgreSQL concurrency scenarios and actual-component browser regression (including paging) also passed.
New security tests cover anonymous/inactive/unassigned/freshly disabled sessions; own-store insert/cross-store denial; existing update/upsert and document metadata denial; service upload denial; customer/document mismatch; explicit projections and ACLs; invalid pagination; atomic rollback; repeat request; changed candidates; history/document pagination without overlap. API tests cover trusted actor derivation, no arbitrary path, 60-second signing, no-store, no privileged client before authentication, CSV insert-only/authorization and unknown-outcome handling.
Real PostgreSQL 17, network-disabled ephemeral container: simultaneous same-request retry, separate requests matching same person, ordinary insert/update versus import, visit refresh versus admin update, unsupported isolation. PGlite tests alone are not presented as real concurrency evidence.
Actual React page/components exercised using local synthetic adapters at desktop/mobile 1440/390/320px, including pagination tab retention, form fields/cancel, masks, staff read/no edit, CSV candidate exclusion, empty filters, repeated Escape/focus restoration. These are not real authenticated production E2E tests.

Outstanding release steps: independent code/SQL review; metadata/owner/ACL preflight; approved migration application; deployment/CI and real authenticated E2E. No actual user/identity image was sent anywhere; no OpenAI call. Synthetic fixtures only.

## Operational considerations and rollback

Customer writes across stores are serialized during the short transaction: CSV has a 20-row cap; concurrent customer and visit-date writes may wait. Migration DDL briefly locks affected tables. No existing records are deleted, inferred, backfilled or rewritten.

Rollback application first, then restore the prior private.customer_directory definition (original migration, CREATE OR REPLACE only) for compatibility with old strict response parsing. Revoke new public/private customer-detail and CSV entry points; remove the new write guard and restore prior refresh_customer_visits definition together. Keep memo/gender columns and receipts to avoid data loss. Do not automatically restore staff document-edit permissions: that would undo the approved read-only-existing-record policy. Restore legacy upload functions/policies only with explicit authorization. No migration-history repair is part of this work.

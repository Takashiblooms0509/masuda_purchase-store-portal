# Customer dialog placement

A read-only fetch of the CSS actually served by the production login page reproduced the same reset defect in `.customer-dialog`: at 1440×900 its native modal rectangle started at x=0/y=0, width=720, margin=0. Customer add mode selection, direct entry and CSV import share that class.

The right-side `.customer-detail` is intentionally different and already explicitly positioned. With the same production CSS its rectangle was x=744/y=16, width=680/height=720 at 1440×900, correctly 16px from the right edge. Its placement is unchanged.

The application patch only adds `position:fixed; inset:0; margin:auto` to `.customer-dialog`. No component logic, fields, permissions, API, database or OCR changes.

Verification: npm run check (typecheck, lint, 237 tests and production build); actual customer component browser regression with both development CSS and CSS emitted by the production build (`CUSTOMER_BUILT_CSS=1 node app/tests/browser/customer-workflow.mjs`). At 1440/390/320 widths, add/direct/CSV are centered within 2px; long direct forms scroll internally with close controls visible; right detail remains right-aligned on desktop and full-screen on mobile. Keyboard, Escape, close/reopen, focus restoration and existing CSV/role behavior pass. Tests use synthetic server adapters, not live authenticated Supabase E2E.

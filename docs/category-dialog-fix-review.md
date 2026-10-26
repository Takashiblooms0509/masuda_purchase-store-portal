# Category action row and dialog correction

The existing category modal relied on the browser's default dialog margin. Tailwind's production preflight resets margins to zero, so showModal() placed it at the upper-left. With the previous production CSS and a 1440×900 viewport, the computed dialog was x=0, y=0, width=540, margin=0. The standalone prototype did not include that reset. Earlier browser tests checked keyboard and responsive overflow but not centering, and the Vite harness did not exercise the actual production CSS output.

The category dialog class now explicitly sets position:fixed, inset:0, margin:auto, and max-width:none. Both parent add/edit and the new CSV modal use this same class. CSV gets a bounded scrollable body and a fixed header/close control. No customer or other screen styling changes.

CSV output and import are now top-row actions beside parent creation. The collapsed supplementary section is removed; the existing export route, CSV template, parser, preview, confirmation and atomic save APIs remain unchanged. Import opens a modal; closing clears its local preview. Preview/save requests disable close and Escape until completion. Staff see none of these edit/CSV actions. Inline draft editing blocks CSV actions.

Validation:
- npm run check: typecheck, lint, 237 tests, production build.
- node app/tests/browser/category-master.mjs: actual React components with synthetic server adapters.
- CATEGORY_BUILT_CSS=1 node app/tests/browser/category-master.mjs: same real components using the CSS modules and global/preflight CSS emitted by next build, rather than Vite-generated development CSS.
- Both modes assert horizontal/vertical centering (within 2px), 1440/390/320 widths, parent and CSV dialogs, action-row alignment, focus/Tab/Escape/close/reopen, CSV invalid headers/preview/confirmation, pending-close protection, draft/conflict preservation and staff restrictions. No live DB mutation or live authenticated E2E.

No migration, RPC, CSV contract, permissions, customer fields or OCR changes. Review/merge approval is still required before production release.

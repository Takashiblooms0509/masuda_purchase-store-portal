# Portal visual refresh

Base: main `4971b338e737861bb47815e54a4461a4654329f0`.
Branch: `feat/portal-visual-refresh`. Runtime changes are CSS-only.

## Scope

Production changes are limited to `app/src/app/globals.css` and `app/src/components/home/home.module.css`.
White surfaces, near-black typography/buttons, restrained blue-purple links/focus, thin borders and consistent spacing now cover the login, shared shell, customers/list/detail/new, purchases/list/detail/new, category forms/list, document imports/detail/review, errors, stores/users administration and pending-account view. HOME retains its chart gradient, filters and copy; redundant inner padding is removed to align it with the other pages. Small screens use a two-column navigation, single-column forms and horizontally scrollable tables. Hidden inputs remain hidden. Error/warning/success states retain distinct colors and text; keyboard focus is visible.

No application TS/TSX, business actions, routes, database schema, RLS, role visibility, auth configuration or package dependencies changed. Future customer/category functions were not added. GREEN ASSET PORTAL remains the brand; no HOME tagline was added.

## Verification

- `npm --prefix app run check`: typecheck, lint, all 11 test files / 126 tests, production build passed.
- `node app/tests/browser/portal-style.mjs`: actual 14 page components plus shared layout/forms, using explicitly synthetic read adapters. Screenshots at 1440px and 390px; no page-wide overflow. Includes customer/detail/new, transaction/detail/new, login/pending, categories, imports/detail, errors, stores/users. Additional import review form snapshots at both widths.
- Keyboard category edit expansion and input focus; transaction line add/remove repeated three times and item outcome selector; empty states for five lists; staff presentation excludes admin navigation/store filter. No persistence or real authentication tested.
- `HOME_TEST_OUTPUT=... node app/tests/browser/home.mjs`: existing real HOME component + local HTTP + PGlite SQL tests passed, including mixed-item 50%, category and date selection/clear, amount/visit toggle, six repeated filter cycles, empty/invalid range, keyboard pie selection and 390px overflow.
- Visually inspected login, customer list/detail, categories, purchase mobile, import review and HOME screenshots. Browser harness made no external requests and reported no page errors.
- A local `next start` production-runtime login check could not reach the page: required Supabase public environment variables are absent, so the existing proxy rejects the request. No credentials or environment settings were added. Production build itself passed. This is an environment limitation, not evidence of an auth regression.

## Evidence and limitations

Local-only `docs/portal-style-artifacts/review-gallery.html` is an offline image gallery. PNGs and check logs are stored alongside it; HOME evidence is under `home/`. These generated files are not committed or deployed. All data in screenshots is synthetic. Browser adapter script is outside production code and does not add a route.

`app/tests/browser/home.mjs` gained only an optional output-directory environment variable to avoid overwriting the previous HOME evidence. New portal-style harness uses the already available local Vite/Playwright/Chromium setup; no package changes.

Real authenticated E2E, persisted save/upload/AI operations, real production data, Safari/Firefox and device testing remain unverified. Deployment-transition Server Action behavior was not investigated or changed. Existing local prototypes and visual artifacts are excluded from this change.

## Color contrast

Calculated from sRGB CSS colors using relative luminance. Normal text target 4.5:1; input boundary/focus target 3:1. See [W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

| Pair | Ratio |
| --- | --- |
| body/white | 16.85:1 |
| muted/white | 5.59:1 |
| muted/surface | 5.26:1 |
| button | 16.05:1 |
| link/white | 6.41:1 |
| badge | 7.09:1 |
| focus/white | 4.80:1 |
| input-border/white | 3.34:1 |
| input-border/home-filter | 3.17:1 |
| error | 6.30:1 |
| warning | 6.22:1 |
| success | 6.12:1 |
| HOME muted/detail | 5.31:1 |

HOME muted text is now #626875 (previous #727987 was 4.37:1 on white); enabled input borders are #858d9c (previous #b8beca was 1.87:1 on white). These are targeted checks of shared text/control colors, not a claim of complete WCAG conformance. Decorative separators are intentionally lighter; disabled controls are excluded. Keyboard and layout checks are documented above.

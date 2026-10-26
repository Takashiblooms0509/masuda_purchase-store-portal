// Local-only integration harness: real HOME component -> test HTTP -> proposed SQL/PGlite.
// No app routes, production connections, credentials or fixtures are installed in the app.
import { createServer } from "vite";
import { PGlite } from "@electric-sql/pglite";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const app = path.resolve(import.meta.dirname, "../.."),
  repo = path.dirname(app);
const temp = await mkdtemp(path.join(tmpdir(), "green-home-browser-"));
const output = path.join(repo, "docs/home-review-artifacts");
await mkdir(output, { recursive: true });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const db = new PGlite();
let server, browser;
try {
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create schema auth;grant usage on schema auth to anon,authenticated;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;`,
  );
  for (const file of [
    "202610010001_phase1_auth_stores.sql",
    "202610010002_phase2_business.sql",
  ])
    await db.exec(
      await readFile(path.join(repo, "supabase/migrations", file), "utf8"),
    );
  await db.exec(
    await readFile(
      path.join(repo, "supabase/migrations/20261026024940_home_item_outcomes_reporting.sql"),
      "utf8",
    ),
  );
  await db.query(
    "insert into public.stores(id,code,name) values($1,'A','テスト A 店'),($2,'B','テスト B 店')",
    [id(10), id(11)],
  );
  await db.query("insert into auth.users values($1,'test@example.test')", [
    id(1),
  ]);
  await db.query(
    "update public.profiles set role='admin',is_active=true where id=$1",
    [id(1)],
  );
  await db.query(
    "insert into public.customers(id,store_id,name) values($1,$2,'架空顧客'),($3,$4,'架空顧客')",
    [id(20), id(10), id(21), id(11)],
  );
  await db.query(
    "insert into public.product_categories(id,category_name) values($1,'金属'),($2,'カード')",
    [id(30), id(31)],
  );
  for (const [n, store, customer, at] of [
    [100, 10, 20, "2026-10-01T01:00Z"],
    [101, 10, 20, "2026-10-02T01:00Z"],
    [102, 11, 21, "2026-10-03T01:00Z"],
  ])
    await db.query(
      "insert into public.purchase_transactions(id,store_id,customer_id,visit_datetime,transaction_status,purchase_total) values($1,$2,$3,$4,'not_completed',999999)",
      [id(n), id(store), id(customer), at],
    );
  for (const [n, t, c, status, amount] of [
    [200, 100, 30, "not_completed", 900],
    [201, 100, 31, "completed", 1000],
    [202, 101, 30, "pending", 100],
    [203, 101, null, "completed", null],
    [204, 102, 30, "completed", 2000],
  ])
    await db.query(
      "insert into public.purchase_items(id,purchase_transaction_id,product_category_id,item_name,purchase_status,purchase_amount) values($1,$2,$3,$4,$5,$6)",
      [id(n), id(t), c ? id(c) : null, "検証商品 " + n, status, amount],
    );
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id(1),
  ]);
  await writeFile(
    path.join(temp, "index.html"),
    '<html lang="ja"><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/entry.tsx"></script></body></html>',
  );
  await writeFile(
    path.join(temp, "navigation.ts"),
    "export const useRouter=()=>({replace:(url)=>window.loadHome(url)});",
  );
  await writeFile(
    path.join(temp, "link.tsx"),
    `import React from 'react';export default function Link({href,children,prefetch,...props}){return <a {...props} href={href} onClick={e=>{if(href==='/'||href.startsWith('/?')){e.preventDefault();props.onClick?.(e);window.loadHome(href);}}}>{children}</a>}`,
  );
  await writeFile(
    path.join(temp, "entry.tsx"),
    `import '${path.join(app, "src/app/globals.css")}';import React from 'react';import{createRoot}from'react-dom/client';import{HomeDashboard}from'${path.join(app, "src/components/home/dashboard.tsx")}';import{parseHomeFilters,homeReportSchema}from'${path.join(app, "src/lib/home/report.ts")}';
 const root=createRoot(document.getElementById('root'));window.loadHome=async url=>{const filters=parseHomeFilters(Object.fromEntries(new URL(url,location.origin).searchParams),new Date('2026-10-26T00:00Z')).data;const report=homeReportSchema.parse(await(await fetch('/__home_test_report?'+new URLSearchParams(filters))).json());root.render(<><p>ローカル検証専用 · すべて架空データ</p><div className="workspace"><header className="topbar">GREEN ASSET PORTAL</header><main className="page-content"><HomeDashboard filters={filters} report={report} stores={[{id:'${id(10)}',name:'テスト A 店'},{id:'${id(11)}',name:'テスト B 店'}]} categories={[{id:'${id(30)}',category_name:'金属',is_active:true},{id:'${id(31)}',category_name:'カード',is_active:true}]}/></main></div></>)};window.loadHome('/');`,
  );
  server = await createServer({
    configFile: false,
    root: temp,
    logLevel: "error",
    resolve: {
      alias: {
        "next/navigation": path.join(temp, "navigation.ts"),
        "next/link": path.join(temp, "link.tsx"),
        "@": path.join(app, "src"),
        react: path.join(app, "node_modules/react"),
        "react-dom": path.join(app, "node_modules/react-dom"),
      },
    },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [app, temp] } },
    plugins: [
      {
        name: "local-home-sql-test",
        configureServer(s) {
          s.middlewares.use("/__home_test_report", async (req, res) => {
            try {
              const p = new URL(req.url, "http://127.0.0.1").searchParams;
              const { rows } = await db.query(
                "select public.get_home_report($1,$2,$3,$4,$5,$6) as value",
                [
                  p.get("from"),
                  p.get("to"),
                  p.get("store") === "all" ? null : p.get("store"),
                  p.get("day") || null,
                  ["all", "uncategorized"].includes(p.get("category"))
                    ? null
                    : p.get("category"),
                  p.get("category") === "uncategorized",
                ],
              );
              res.setHeader("content-type", "application/json");
              res.end(JSON.stringify(rows[0].value));
            } catch {
              res.statusCode = 500;
              res.end("{}");
            }
          });
        },
      },
    ],
  });
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await chromium.launch({
    executablePath: process.env.HOME_TEST_CHROMIUM || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(`http://127.0.0.1:${port}`)) external.push(r.url());
  });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByRole("heading", { name: "HOME", exact: true }).waitFor();
  const metrics = () =>
    page.getByRole("region", { name: "集計結果" }).innerText();
  const waitMetric = async (text) => {
    await page
      .getByRole("region", { name: "集計結果" })
      .getByText(text, { exact: true })
      .waitFor();
  };
  await waitMetric("3 件");
  assert.match(await metrics(), /75.0%/);
  assert.match(await metrics(), /3,000/);
  await page.screenshot({
    path: path.join(output, "home-live-component.png"),
    fullPage: true,
  });
  await page.locator("input[name=from]").fill("2026-10-01");
  await page.locator("input[name=to]").fill("2026-10-01");
  await page.getByRole("button", { name: "条件を適用" }).click();
  await waitMetric("50.0%");
  await waitMetric("1 件");
  await page.getByRole("button", { name: /2026-10-01/ }).click();
  await page.getByRole("link", { name: "検証商品 200" }).waitFor();
  await page.getByLabel("カテゴリ", { exact: true }).selectOption(id(30));
  await waitMetric("0.0%");
  assert.equal(
    await page.getByRole("link", { name: "検証商品 201" }).count(),
    0,
  );
  assert.match(await metrics(), /0 点/);
  await page.screenshot({
    path: path.join(output, "home-category-filter.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "カテゴリ解除 ×" }).click();
  await waitMetric("50.0%");
  await page
    .getByRole("button", { name: "日付選択を解除", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "日付を選択", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "来店数", exact: true }).click();
  await page
    .getByRole("button", { name: "2026-10-01 1件", exact: true })
    .waitFor();
  for (let n = 0; n < 6; n++) {
    await page.getByRole("link", { name: "当月に戻す" }).click();
    await waitMetric("3 件");
    await page.locator("select[name=store]").selectOption(id(11));
    await waitMetric("100.0%");
    await waitMetric("1 件");
    await page.getByLabel("カテゴリ", { exact: true }).selectOption(id(31));
    await waitMetric("0 件");
    await waitMetric("—");
  }
  await page.screenshot({
    path: path.join(output, "home-empty.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "当月に戻す" }).click();
  await waitMetric("3 件");
  await page.locator("input[name=from]").fill("2026-10-20");
  await page.locator("input[name=to]").fill("2026-10-01");
  await page.getByRole("button", { name: "条件を適用" }).click();
  await page.getByRole("alert").waitFor();
  await waitMetric("3 件");
  await page.getByRole("link", { name: "当月に戻す" }).click();
  await page.getByRole("button", { name: "買取金額", exact: true }).click();
  await page.locator("svg path").first().focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "カテゴリ解除 ×" }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: path.join(output, "home-mobile.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS actual React HOME + local HTTP + PGlite SQL: mixed-item 50%, category drilldown/clear, daily detail/clear, metric switch, store/category intersection, 6 repeated cycles, empty, invalid range preserves displayed scope, keyboard pie, mobile no overflow, no browser errors or external requests.",
  );
} finally {
  await browser?.close();
  await server?.close();
  await db.close();
}

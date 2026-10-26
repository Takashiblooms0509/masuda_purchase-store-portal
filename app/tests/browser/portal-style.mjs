// Visual review of actual page/layout/form components, with synthetic read adapters.
// No real authentication, persistence, AI or external connection is exercised.
import { createServer } from "vite";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const app = path.resolve(import.meta.dirname, "../..");
const output =
  process.env.PORTAL_TEST_OUTPUT ||
  path.join(app, "../docs/portal-style-artifacts");
const temp = await mkdtemp(path.join(tmpdir(), "portal-style-"));
await mkdir(output, { recursive: true });
const fixture = `
import {readingFixture} from "${app}/tests/fixtures/purchase-reading.ts";
import {initialReview,AI_SCHEMA_VERSION} from "@/lib/ai/schemas";
export const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const stamp='2026-10-26T01:00:00Z';
const stores=[{id:id(10),code:'SAMPLE-A',name:'検証 A 店',is_active:true},{id:id(11),code:'SAMPLE-B',name:'検証 B 店',is_active:false}];
const customers=[1,2,3].map(n=>({id:id(n),store_id:id(n===3?11:10),name:'架空顧客 '+n,name_kana:'テスト',membership_card_number:'DEMO-00'+n,phone:'未登録',address:'検証用住所（架空）',first_visit_date:'2026-10-01',last_visit_date:'2026-10-26',created_at:stamp,updated_at:stamp}));
const categories=[{id:id(20),category_name:'金属',parent_category_id:null,category_level:1,display_order:1,is_active:true},{id:id(21),category_name:'カード',parent_category_id:null,category_level:1,display_order:2,is_active:true},{id:id(22),category_name:'検証・無効カテゴリ',parent_category_id:id(20),category_level:2,display_order:3,is_active:false}];
const transactions=[1,2,3].map(n=>({id:id(30+n),store_id:id(10),customer_id:id(n),document_number:'DEMO-00'+n,visit_datetime:stamp,transaction_status:n===2?'not_completed':'completed',purchase_item_count:2,purchase_total:12000,source_document_id:null,updated_at:stamp}));
const profile={id:id(90),name:'検証管理者',email:'review@example.test',role:'admin',is_active:true,store_id:id(10)};
const imports=[{id:id(40),store_id:id(10),file_name:'架空の買取計算書.png',document_type:'purchase_document',processing_status:'failed',created_at:stamp,updated_at:stamp,file_url:null,error_message:'検証用：画像を確認してください。',retry_count:1}];
const tables={stores,customers,product_categories:categories,purchase_transactions:transactions,profiles:[profile,{...profile,id:id(91),name:'検証スタッフ',role:'staff',is_active:false}],document_imports:imports,customer_documents:[{id:id(50),customer_id:id(1),document_type:'drivers_license',file_name:'架空の書類.png',file_url:null,created_at:stamp}],purchase_items:[{id:id(60),purchase_transaction_id:id(31),item_name:'検証商品',purchase_status:'completed',product_category_id:id(20),quantity:1,purchase_amount:12000,category_reviewed:true,raw_item_name:null,category_confidence:null}]};
function from(table){if(window.__review){imports[0]={...imports[0],processing_status:'review_required',error_message:null,ai_schema_version:AI_SCHEMA_VERSION,ai_result:readingFixture,reviewed_result:initialReview(readingFixture)};}let rows=window.__empty?[]:[...(tables[table]||[])];let one=false;const q=new Proxy({}, {get:(_,key)=>{if(key==='then')return resolve=>resolve({data:one?rows[0]??null:rows,error:null,count:rows.length});return (...args)=>{if(key==='eq')rows=rows.filter(r=>r[args[0]]===args[1]);if(key==='in')rows=rows.filter(r=>args[1].includes(r[args[0]]));if(key==='single'||key==='maybeSingle')one=true;return q;};}});return q;}
async function rpc(name,args){
 if(window.__rpcError)return {data:null,error:{message:'PRIVATE ERROR'}};
 const projected=customers.map(c=>({id:c.id,store_id:c.store_id,name:c.name,name_kana:c.name_kana,phone:c.phone,membership_card_number:c.membership_card_number,created_at:c.created_at}));
 let filtered=window.__empty?[]:projected.filter(c=>(!args.p_store||c.store_id===args.p_store)&&(!args.p_name||(c.name+' '+c.name_kana).includes(args.p_name))&&(!args.p_phone||c.phone.includes(args.p_phone))&&(!args.p_card||c.membership_card_number.includes(args.p_card)));
 return {data:{customers:filtered,total:filtered.length,selected:projected.find(c=>c.id===args.p_selected)||null,stores:stores.map(s=>({id:s.id,name:s.name}))},error:null};
}
export const requireProfile=async()=>({profile:{...profile,id:window.__staff?id(91):id(90),role:window.__staff?'staff':'admin'},store:stores[0],stores:window.__staff?stores.slice(0,1):stores,supabase:{from,rpc}});
export const requireAdmin=requireProfile;
export const businessSession=requireProfile;
export const getSession=async()=>({allowed:false});
export const validId=x=>x;
export const storeAllowed=(session,id)=>session.stores.some(s=>s.id===id);
`;
await writeFile(path.join(temp, "fixture.ts"), fixture);
await writeFile(
  path.join(temp, "navigation.ts"),
  `export const useRouter=()=>({refresh(){},push(href){window.navigateCustomers(href)},replace(href){window.navigateCustomers(href)}});export const notFound=()=>{throw Error('Fixture missing')};export const redirect=()=>{};`,
);
await writeFile(
  path.join(temp, "link.tsx"),
  `import React from 'react';export default function Link({href,children,prefetch,scroll,...props}){return <a href={href} {...props} onClick={e=>{props.onClick?.(e);if(new URL(href,location.origin).pathname==='/customers'){e.preventDefault();window.navigateCustomers(href)}}}>{children}</a>}`,
);
await writeFile(
  path.join(temp, "image.tsx"),
  `import React from 'react';export default function Image({fill,unoptimized,...props}){return <img {...props}/>}`,
);
await writeFile(
  path.join(temp, "config.ts"),
  `export const uploadConfigured=()=>false;export const readingConfigured=()=>false;export const getSupabaseConfig=()=>{throw Error('No external connections in visual review')};`,
);
await writeFile(path.join(temp, "empty.ts"), "export {};");
const routes = {
  login: "login",
  pending: "account-pending",
  customers: "(portal)/customers",
  customer: "(portal)/customers/[id]",
  customerNew: "(portal)/customers/new",
  purchases: "(portal)/purchases",
  purchase: "(portal)/purchases/[id]",
  purchaseNew: "(portal)/purchases/new",
  categories: "(portal)/categories",
  imports: "(portal)/imports",
  importDetail: "(portal)/imports/[id]",
  errors: "(portal)/errors",
  stores: "(portal)/admin/stores",
  users: "(portal)/admin/users",
};
await writeFile(
  path.join(temp, "index.html"),
  '<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/entry.tsx"></script></html>',
);
await writeFile(
  path.join(temp, "entry.tsx"),
  `
import React from 'react';import{createRoot}from'react-dom/client';import '${app}/src/app/globals.css';import Layout from '${app}/src/app/(portal)/layout.tsx';
${Object.entries(routes)
  .map(
    ([key, route]) => `import ${key} from '${app}/src/app/${route}/page.tsx';`,
  )
  .join("\n")}
const pages={${Object.keys(routes).join(",")}};const root=createRoot(document.getElementById('root'));
window.show=async(name,empty=false,staff=false)=>{window.__empty=empty;window.__staff=staff;const n=name==='customer'?1:name==='purchase'?31:40;const content=await pages[name]({params:Promise.resolve({id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0')}),searchParams:Promise.resolve(window.__params||{})});const view=['login','pending'].includes(name)?content:await Layout({children:content});root.render(<React.Fragment key={name+empty+staff}><p style={{margin:0,padding:'6px 20px',background:'#efedf8',fontSize:11}}>ローカル画面検証 · すべて架空データ · 保存・認証は検証対象外</p>{view}</React.Fragment>);};window.navigateCustomers=href=>{history.pushState(null,'',href);window.__params=Object.fromEntries(new URL(href,location.origin).searchParams);return window.show('customers',false,window.__staff)};window.onpopstate=()=>{window.__params=Object.fromEntries(new URL(location.href).searchParams);window.show('customers',false,window.__staff)};window.show('customers');
`,
);
let server, browser;
try {
  server = await createServer({
    configFile: false,
    root: temp,
    logLevel: "error",
    resolve: {
      alias: {
        "@": path.join(app, "src"),
        "next/link": path.join(temp, "link.tsx"),
        "next/navigation": path.join(temp, "navigation.ts"),
        "next/image": path.join(temp, "image.tsx"),
        "server-only": path.join(temp, "empty.ts"),
        react: path.join(app, "node_modules/react"),
        "react-dom": path.join(app, "node_modules/react-dom"),
      },
    },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [app, temp] } },
    plugins: [
      {
        name: "synthetic-read-only-adapters",
        enforce: "pre",
        async load(id) {
          if (
            id.endsWith("/lib/auth/session.ts") ||
            id.endsWith("/lib/business/access.ts")
          )
            return `export * from '${temp}/fixture.ts';`;
          if (
            id.endsWith("/lib/documents/config.ts") ||
            id.endsWith("/lib/supabase/config.ts")
          )
            return `export * from '${temp}/config.ts';`;
          if (id.endsWith("actions.ts") && id.startsWith(app + "/src/")) {
            const source = await readFile(id, "utf8");
            return [...source.matchAll(/export async function (\w+)/g)]
              .map(
                (m) =>
                  `export async function ${m[1]}(){return {message:'ローカル検証：保存しません',customers:[],documents:[]}}`,
              )
              .join("\n");
          }
        },
      },
    ],
  });
  await server.listen();
  const origin = "http://127.0.0.1:" + server.httpServer.address().port;
  browser = await chromium.launch({
    executablePath: process.env.HOME_TEST_CHROMIUM || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(origin)) external.push(r.url());
  });
  await page.goto(origin);
  await page.getByRole("heading", { name: "顧客管理", exact: true }).waitFor();
  const show = async (name, empty = false, staff = false) => {
    await page.evaluate(
      async ([n, e, s]) => window.show(n, e, s),
      [name, empty, staff],
    );
    await page.waitForTimeout(120);
  };
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    for (const name of Object.keys(routes)) {
      await show(name);
      assert.equal(await page.locator("h1").count(), 1, name + " heading");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        name + " " + width + " overflow",
      );
      await page.screenshot({
        path: path.join(output, `${name}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await show("categories");
  await page.locator("summary").first().focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("details[open]").count(), 1);
  await page.screenshot({
    path: path.join(output, "category-edit-keyboard.png"),
    fullPage: true,
  });
  await show("purchase");
  for (let n = 0; n < 3; n++) {
    await page.getByRole("button", { name: "明細行を追加" }).click();
    assert.equal(await page.locator("fieldset").count(), 2);
    await page.getByRole("button", { name: "この明細行を削除" }).last().click();
  }
  await page.getByLabel("明細 1 の成約状態").selectOption("not_completed");
  assert.equal(
    await page.getByLabel("明細 1 の成約状態").inputValue(),
    "not_completed",
  );
  await show("customerNew");
  const input = page.locator("input[name=name]");
  await input.fill("ローカル入力");
  await input.focus();
  assert.equal(
    await input.evaluate((el) => getComputedStyle(el).outlineStyle),
    "solid",
  );
  await page.screenshot({
    path: path.join(output, "customer-input-focus.png"),
    fullPage: true,
  });
  for (const name of [
    "customers",
    "purchases",
    "categories",
    "imports",
    "errors",
  ]) {
    await show(name, true);
    await page.screenshot({
      path: path.join(output, `${name}-empty.png`),
      fullPage: true,
    });
  }
  await show("customers", false, true);
  assert.equal(
    await page.getByRole("link", { name: "店舗管理", exact: true }).count(),
    0,
  );
  assert.equal(await page.locator("select[name=store]").count(), 1);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await page.evaluate(() => {
    window.__review = true;
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await show("importDetail");
    await page
      .getByRole("button", { name: "確認内容を保存", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: path.join(output, `import-review-${width}.png`),
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await page.evaluate(() => {
    window.__params = {};
  });
  await show("customers");
  for (let n = 0; n < 3; n++) {
    await page.getByRole("link", { name: "架空顧客 1", exact: true }).click();
    await page.getByRole("complementary", { name: "顧客詳細" }).waitFor();
    await page
      .getByRole("button", { name: "顧客情報を編集", exact: true })
      .click();
    await page
      .getByRole("button", { name: "編集を閉じる", exact: true })
      .click();
    await page.getByRole("link", { name: "顧客詳細を閉じる" }).click();
    await page
      .getByRole("complementary", { name: "顧客詳細" })
      .waitFor({ state: "detached" });
  }
  await page.getByRole("link", { name: "架空顧客 2", exact: true }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: path.join(output, `customer-panel-${width}.png`),
      fullPage: true,
    });
  }
  await show("customers", false, true);
  assert.equal(
    await page
      .getByRole("button", { name: "顧客情報を編集", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("complementary", { name: "顧客詳細" })
    .locator("h2")
    .focus();
  await page.keyboard.press("Escape");
  await page
    .getByRole("complementary", { name: "顧客詳細" })
    .waitFor({ state: "detached" });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);

  await page.evaluate(() =>
    window.navigateCustomers(
      "/customers?selected=00000000-0000-4000-8000-000000000003",
    ),
  );
  await page
    .getByRole("complementary", { name: "顧客詳細" })
    .getByText("架空顧客 3", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("link", { name: "書類・来店履歴を確認" }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "顧客情報を編集" }).count(),
    0,
  );
  assert.equal(
    await page.getByText("検証用住所（架空）", { exact: true }).count(),
    0,
  );
  await page.evaluate(() =>
    window.navigateCustomers(
      "/customers?selected=00000000-0000-4000-8000-000000000001",
    ),
  );
  await page
    .getByRole("complementary", { name: "顧客詳細" })
    .getByText("架空顧客 1", { exact: true })
    .waitFor();
  await page.goBack();
  await page
    .getByRole("complementary", { name: "顧客詳細" })
    .getByText("架空顧客 3", { exact: true })
    .waitFor();
  await page.evaluate(() => {
    window.__rpcError = true;
    return window.show("customers", false, true);
  });
  await page.getByRole("alert").waitFor();
  assert.equal(
    await page.getByRole("complementary", { name: "顧客詳細" }).count(),
    0,
  );
  assert.equal(
    await page.getByText("PRIVATE ERROR", { exact: true }).count(),
    0,
  );
  await page.evaluate(() => {
    window.__rpcError = false;
    window.__params = { selected: "00000000-0000-4000-8000-000000000099" };
    return window.show("customers", false, true);
  });
  await page
    .getByText("顧客が見つからないか、閲覧権限がありません。")
    .waitFor();
  await page.evaluate(() => {
    window.__params = {};
    return window.show("customers", false, true);
  });
  for (const name of ["架空顧客 1", "架空顧客 2", "架空顧客 3"])
    await page.getByRole("link", { name, exact: true }).click();
  await page
    .getByRole("complementary", { name: "顧客詳細" })
    .getByText("架空顧客 3", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "顧客情報を編集" }).count(),
    0,
  );
  await page.screenshot({
    path: path.join(output, "customer-cross-store-staff.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const result =
    "PASS: cross-store projection, direct URL, browser back via Router adapter, rapid selection, user role switch, missing/error no stale panel; customer panel select/edit/close 3 cycles, staff no edit, Escape, 1440/390px; import review form at both widths; 14 actual page components and shared layout at 1440/390px, no page overflow; keyboard details/focus; 3 add/remove item cycles and state selector; 5 empty views; staff layout. Synthetic read adapters, no authenticated E2E or persistence. No browser errors/external requests.";
  console.log(result);
  await writeFile(path.join(output, "browser-check.txt"), result + "\n");
} finally {
  await browser?.close();
  await server?.close();
}

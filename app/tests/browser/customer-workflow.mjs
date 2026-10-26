// Actual customer page/forms/components, synthetic local adapters only. No live authentication/DB/API.
import { createServer } from "vite";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, mkdir, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url),
  { chromium } = require("playwright");
const app = path.resolve(import.meta.dirname, "../.."),
  temp = await mkdtemp(path.join(tmpdir(), "customer-workflow-")),
  out = path.join(app, "../docs/customer-workflow-artifacts");
await mkdir(out, { recursive: true });
const builtMode = process.env.CUSTOMER_BUILT_CSS === "1";
let builtCss = "";
if (builtMode) {
  const dir = path.join(app, ".next/static/chunks");
  builtCss = (
    await Promise.all(
      (await readdir(dir))
        .filter((f) => f.endsWith(".css"))
        .map((f) => readFile(path.join(dir, f), "utf8")),
    )
  ).join("\n");
  assert(builtCss.includes(".customer-dialog"), "Run production build first");
}
await writeFile(
  path.join(temp, "fixture.ts"),
  `
export const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
export const stores=[10,11].map(n=>({id:id(n),code:n===10?'A':'B',name:'架空'+n+'店',is_active:true,created_at:'2026-01-01',updated_at:'2026-01-01'}));
export const customers=[20,21].map(n=>({id:id(n),store_id:id(n===20?10:11),name:'架空顧客'+n,name_kana:'カクウ',birth_date:'1990-01-01',gender:'female',occupation:'架空職業',postal_code:'000-0000',address:'架空県サンプル町',phone:'000-0000-0000',dm_allowed:false,membership_card_number:'DEMO-'+n,identification_type:'運転免許証',identification_number:'DEMO-NOT-VALID',memo:'架空メモ',first_visit_date:'2026-01-01',last_visit_date:'2026-10-01',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'}));
export const businessSession=async()=>({profile:{id:id(window.staff?2:1),role:window.staff?'staff':'admin',store_id:id(10)},stores:window.staff?stores.slice(0,1):stores,supabase:{rpc:async(name,args)=>{
 if(window.fail)return {data:null,error:{code:'FAIL'}};
 if(name==='get_customer_detail'){const c=customers.find(c=>c.id===args.p_customer);return {data:c?{customer:c,store_name:stores.find(s=>s.id===c.store_id).name,documents:[{id:id(40),document_type:'drivers_license',file_name:'架空画像.png',created_at:c.created_at,has_image:true}],document_count:21,transactions:[{id:id(60),visit_datetime:c.created_at,transaction_status:'completed',notes:'架空取引',purchase_amount:10000,completed_items:1,not_completed_items:1}],transaction_count:11}:null,error:null};}
 const projected=customers.map(c=>Object.fromEntries(['id','store_id','name','name_kana','phone','membership_card_number','created_at','gender'].map(k=>[k,c[k]]).concat([['age',36]])));
 const filtered=projected.filter(c=>(!args.p_name||(c.name+c.name_kana).includes(args.p_name))&&(!args.p_store||args.p_store===c.store_id)&&(!args.p_phone||c.phone.includes(args.p_phone))&&(!args.p_card||c.membership_card_number.includes(args.p_card)));
 return {data:{customers:filtered,total:filtered.length,selected:projected.find(c=>c.id===args.p_selected)||null,stores:stores.map(s=>({id:s.id,name:s.name}))},error:null};}}});
export const storeAllowed=(s,id)=>s.stores.some(x=>x.id===id);export const saveError=()=>'';
`,
);
await writeFile(
  path.join(temp, "actions.ts"),
  `
import {customers,id} from './fixture';import {previewCustomerCsv} from '${app}/src/lib/customers/csv';
export async function saveCustomer(prev,form){window.saveCalls=(window.saveCalls||0)+1;window.lastSave=Object.fromEntries(form);return {message:'架空保存成功',success:true};}
export async function saveCustomerDocument(){return {message:'使用しません'};}
export async function previewCustomerImport(prev,form){try{const p=previewCustomerCsv(await form.get('file').text());if(p.errors.length)return{message:p.errors.map(x=>x.message).join(' ')};return {message:'架空プレビュー',success:true,request:crypto.randomUUID(),rows:p.rows.map(r=>({...r.value,line:r.line,store_id:id(10),store_name:'架空10店',candidates:r.value.name==='架空顧客20'?[{id:id(20),name:'架空顧客20'}]:[]}))};}catch(e){return{message:e.message};}}
export async function confirmCustomerImport(prev,form){window.importCalls=(window.importCalls||0)+1;return{message:'架空CSV保存成功',success:true};}
`,
);
await writeFile(
  path.join(temp, "nav.ts"),
  `export const useRouter=()=>({push:href=>window.go(href),refresh:()=>window.go(location.href)});export const redirect=()=>{};`,
);
await writeFile(
  path.join(temp, "link.tsx"),
  `import React from 'react';export default function Link({href,scroll,prefetch,children,...props}){return <a href={href} {...props} onClick={e=>{props.onClick?.(e);if(new URL(href,location.origin).pathname==='/customers'){e.preventDefault();window.go(href)}}}>{children}</a>}`,
);
await writeFile(
  path.join(temp, "index.html"),
  '<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/entry.tsx"></script></html>',
);
await writeFile(
  path.join(temp, "entry.tsx"),
  `
import React from 'react';import{createRoot}from'react-dom/client';import Page from '${app}/src/app/(portal)/customers/page';import '${app}/src/app/globals.css';const root=createRoot(document.getElementById('root'));window.go=async href=>{history.pushState(null,'',href);const params=Object.fromEntries(new URL(href,location.origin).searchParams);root.render(<main style={{padding:24}} key={String(window.staff)}>{await Page({searchParams:Promise.resolve(params)})}</main>);};window.onpopstate=()=>window.go(location.href);document.addEventListener('submit',e=>{if(e.target.classList.contains('customer-search')){e.preventDefault();window.go('/customers?'+new URLSearchParams(new FormData(e.target)));}});window.go('/customers');
`,
);
let server, browser;
try {
  server = await createServer({
    configFile: false,
    root: temp,
    logLevel: "error",
    esbuild: { jsx: "automatic" },
    resolve: {
      alias: {
        "@": path.join(app, "src"),
        "next/link": path.join(temp, "link.tsx"),
        "next/navigation": path.join(temp, "nav.ts"),
        react: path.join(app, "node_modules/react"),
        "react-dom": path.join(app, "node_modules/react-dom"),
      },
    },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [app, temp] } },
    plugins: [
      {
        name: "local-only",
        enforce: "pre",
        load(id) {
          if (builtMode && id.endsWith("/src/app/globals.css")) return builtCss;
          if (id.endsWith("/lib/business/access.ts"))
            return `export * from '${temp}/fixture.ts'`;
          if (
            id.endsWith("/customers/actions.ts") ||
            id.endsWith("/customers/csv-actions.ts")
          )
            return `export * from '${temp}/actions.ts'`;
        },
      },
    ],
  });
  await server.listen();
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const origin = "http://127.0.0.1:" + server.httpServer.address().port;
  await p.goto(origin);
  await p.getByRole("heading", { name: "顧客管理" }).waitFor();
  assert.equal(
    await p
      .locator("thead th")
      .allTextContents()
      .then((x) => x.join(",")),
    "名前,店舗,年齢,性別,カード番号,登録日時",
  );
  assert.equal(
    (await p.locator(".customer-search input").first().boundingBox()).height,
    44,
  );
  await p.getByRole("link", { name: "架空顧客21", exact: true }).click();
  await p.locator(".customer-detail[open]").waitFor();
  assert((await p.locator(".customer-detail").boundingBox()).x > 700);
  assert((await p.locator(".customer-facts").innerText()).includes("架空県"));
  assert(
    !(await p.locator(".customer-facts").innerText()).includes("DEMO-NOT"),
  );
  await p.getByRole("button", { name: "表示", exact: true }).click();
  assert((await p.locator(".customer-facts").innerText()).includes("DEMO-NOT"));
  await p.getByRole("tab", { name: "直近の取引" }).click();
  assert(
    (await p.locator("#customer-tab-content").innerText()).includes("10,000"),
  );
  await p.keyboard.press("ArrowLeft");
  assert.equal(
    await p
      .getByRole("tab", { name: "基本情報" })
      .getAttribute("aria-selected"),
    "true",
  );
  await p.getByRole("button", { name: "編集", exact: true }).click();
  await p.locator("[name=address]").fill("破棄する架空値");
  await p.getByRole("button", { name: "キャンセル", exact: true }).click();
  assert(!(await p.locator(".customer-facts").innerText()).includes("破棄"));
  await p.screenshot({ path: path.join(out, "desktop-detail.png") });
  await p.keyboard.press("Escape");
  await p.locator(".customer-detail").waitFor({ state: "detached" });
  assert.equal(
    await p.evaluate(() => document.activeElement.textContent),
    "架空顧客21",
  );
  await p.evaluate(() => {
    window.staff = true;
    return window.go(
      "/customers?selected=00000000-0000-4000-8000-000000000021",
    );
  });
  await p.locator(".customer-detail[open]").waitFor();
  assert.equal(
    await p.getByRole("button", { name: "編集", exact: true }).count(),
    0,
  );
  assert((await p.locator(".customer-facts").innerText()).includes("架空県"));
  await p.getByRole("tab", { name: "本人確認画像" }).click();
  assert.match(
    await p.locator("#customer-tab-content a").first().getAttribute("href"),
    /customers\/.*\/documents\//,
  );
  await p.getByRole("link", { name: "次へ", exact: true }).click();
  await p.waitForFunction(() => location.search.includes("documentPage=2"));
  assert.equal(
    await p
      .getByRole("tab", { name: "本人確認画像" })
      .getAttribute("aria-selected"),
    "true",
  );
  await p.getByRole("link", { name: "前へ", exact: true }).click();
  await p.waitForFunction(() => location.search.includes("documentPage=1"));
  await p.getByRole("tab", { name: "直近の取引" }).click();
  await p.getByRole("link", { name: "次へ", exact: true }).click();
  await p.waitForFunction(() => location.search.includes("historyPage=2"));
  assert.equal(
    await p
      .getByRole("tab", { name: "直近の取引" })
      .getAttribute("aria-selected"),
    "true",
  );
  await p.keyboard.press("Escape");
  await p.getByRole("button", { name: "顧客を追加", exact: true }).click();
  await p.getByRole("button", { name: "直接入力", exact: true }).click();
  for (const key of [
    "name",
    "name_kana",
    "birth_date",
    "occupation",
    "postal_code",
    "address",
    "phone",
    "dm_allowed",
    "membership_card_number",
    "identification_type",
    "identification_number",
    "gender",
    "memo",
  ])
    assert.equal(
      await p.locator(".customer-dialog [name=" + key + "]").count(),
      1,
      key,
    );
  await p.keyboard.press("Escape");
  await p.getByRole("button", { name: "顧客を追加", exact: true }).click();
  await p.getByRole("button", { name: "CSVから追加", exact: true }).click();
  await p
    .locator("input[type=file]")
    .setInputFiles({
      name: "test.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "登録店舗コード,氏名,フリガナ,電話番号,リピーターズカード番号\nA,架空顧客20,,,\nA,新規架空,,,",
      ),
    });
  await p.getByRole("button", { name: "プレビューと検証" }).click();
  await p.getByText("重複候補：", { exact: false }).waitFor();
  const checks = p.locator("fieldset input[type=checkbox]");
  assert.equal(await checks.nth(0).isChecked(), false);
  assert.equal(await checks.nth(1).isChecked(), true);
  await p.setViewportSize({ width: 390, height: 844 });
  await p.screenshot({ path: path.join(out, "mobile-csv.png") });
  assert(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await checks.last().check();
  await p.getByRole("button", { name: "確認して一括登録" }).click();
  await p.getByText("架空CSV保存成功").waitFor();
  assert.equal(await p.evaluate(() => window.importCalls), 1);
  await p.keyboard.press("Escape");
  await p.getByRole("link", { name: "架空顧客20", exact: true }).click();
  await p.locator(".customer-detail[open]").waitFor();
  assert.equal(
    Math.round((await p.locator(".customer-detail").boundingBox()).width),
    390,
  );
  await p.screenshot({ path: path.join(out, "mobile-detail.png") });
  await p.keyboard.press("Tab");
  assert(
    await p.evaluate(() => document.activeElement.closest("dialog") !== null),
  );
  await p.setViewportSize({ width: 320, height: 568 });
  assert(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await p.keyboard.press("Escape");

  for (const width of [1440, 390, 320]) {
    await p.setViewportSize({ width, height: 844 });
    const centered = async (label) => {
      const r = await p.locator(".customer-dialog").boundingBox();
      assert(
        Math.abs(r.x + r.width / 2 - width / 2) < 2,
        label + " horizontal center",
      );
      assert(
        Math.abs(r.y + r.height / 2 - 422) < 2,
        label + " vertical center",
      );
      assert(
        r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= 845,
        label + " inside viewport",
      );
      console.log(label, width, r);
    };
    await p.getByRole("button", { name: "顧客を追加", exact: true }).click();
    await centered("choice");
    await p.getByRole("button", { name: "直接入力", exact: true }).click();
    await p.locator(".customer-dialog [name=name]").waitFor();
    await centered("direct");
    const scroll = await p
      .locator(".customer-dialog-body")
      .evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight }));
    assert(scroll.scroll > scroll.client, "direct form scrolls internally");
    await p
      .locator(".customer-dialog-body")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    assert(
      await p.getByRole("button", { name: "追加画面を閉じる" }).isVisible(),
    );
    await p.screenshot({
      path: path.join(out, "centered-direct-" + width + ".png"),
    });
    await p.keyboard.press("Escape");
    await p.locator(".customer-dialog").waitFor({ state: "hidden" });
    assert(
      await p
        .getByRole("button", { name: "顧客を追加", exact: true })
        .evaluate((el) => el === document.activeElement),
    );
    await p.getByRole("button", { name: "顧客を追加", exact: true }).click();
    await p.getByRole("button", { name: "CSVから追加", exact: true }).click();
    await p.locator(".customer-dialog input[type=file]").waitFor();
    await centered("CSV");
    await p.keyboard.press("Tab");
    assert(
      await p.evaluate(
        () => document.activeElement.closest(".customer-dialog") !== null,
      ),
    );
    await p.getByRole("button", { name: "追加画面を閉じる" }).click();
    await p.getByRole("link", { name: "架空顧客20", exact: true }).click();
    await p.locator(".customer-detail[open]").waitFor();
    const r = await p.locator(".customer-detail").boundingBox();
    if (width > 620) {
      assert(Math.abs(width - r.x - r.width - 16) < 2, "detail stays right");
      assert(Math.abs(r.y - 16) < 2);
    } else {
      assert(Math.abs(r.x) < 2 && Math.abs(r.y) < 2);
      assert(Math.abs(r.width - width) < 2 && Math.abs(r.height - 844) < 2);
    }
    console.log("right detail", width, r);
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.keyboard.press("Escape");
    await p.locator(".customer-detail").waitFor({ state: "detached" });
  }
  console.log(builtMode ? "PRODUCTION BUILT CSS" : "VITE CSS");
  for (let i = 0; i < 3; i++) {
    await p.getByRole("link", { name: "架空顧客20", exact: true }).click();
    await p.locator(".customer-detail[open]").waitFor();
    await p.keyboard.press("Escape");
    await p.locator(".customer-detail").waitFor({ state: "detached" });
  }
  await p.locator(".customer-search [name=name]").fill("該当なし");
  await p.getByRole("button", { name: "検索", exact: true }).click();
  await p.getByText("該当する顧客はありません。").waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS actual components desktop/mobile, 6 columns/HOME height, authorized staff detail/no edit, masks/tabs, form inventory/cancel, CSV duplicate exclusion/confirm, empty search, repeated Escape/focus restoration; synthetic adapters only",
  );
} finally {
  await browser?.close();
  await server?.close();
}

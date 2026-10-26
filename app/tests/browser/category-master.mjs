// Actual React category component with synthetic in-memory server adapters; no live Auth/DB.
import { createServer } from "vite";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, mkdir, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url),
  { chromium } = require("playwright");
const app = path.resolve(import.meta.dirname, "../.."),
  temp = await mkdtemp(path.join(tmpdir(), "category-master-")),
  out = path.join(app, "../docs/category-review-artifacts");
await mkdir(out, { recursive: true });
const builtMode = process.env.CATEGORY_BUILT_CSS === "1";
let builtCss = "",
  builtClasses = {};
if (builtMode) {
  const directory = path.join(app, ".next/static/chunks");
  builtCss = (
    await Promise.all(
      (await readdir(directory))
        .filter((f) => f.endsWith(".css"))
        .map((f) => readFile(path.join(directory, f), "utf8")),
    )
  ).join("\n");
  const prefix = builtCss.match(/\.([A-Za-z0-9]+)_csvDialog/)?.[1];
  assert(prefix, "Run production build first; category CSV dialog CSS missing");
  for (const m of builtCss.matchAll(
    new RegExp("\\." + prefix + "_([A-Za-z0-9]+)", "g"),
  ))
    builtClasses[m[1]] = prefix + "_" + m[1];
}

await writeFile(
  path.join(temp, "actions.ts"),
  `import {parseCategoryCsv,previewCategories} from '${app}/src/lib/categories/csv';export async function saveCategory(prev,form){window.calls++;window.lastForm=Object.fromEntries(form);if(window.delay)await new Promise(r=>setTimeout(r,300));if(window.conflict)return {message:'他の更新がありました。再読み込みしてください。'};const values={category_name:form.get('category_name').trim(),parent_category_id:form.get('parent_category_id')||null,is_active:form.get('is_active')==='on',display_order:Number(form.get('display_order')),updated_at:new Date().toISOString()};const old=window.rows.find(c=>c.id===form.get('id'));if(old)Object.assign(old,values);else window.rows.push({...values,id:crypto.randomUUID(),created_at:values.updated_at,category_level:values.parent_category_id?2:1});return {success:true,message:'保存成功',updatedAt:values.updated_at};}export async function previewCategoryImport(prev,form){try{const preview=previewCategories(parseCategoryCsv(await form.get('file').text()),window.rows);return {message:'架空プレビュー',preview,success:!preview.errors.length};}catch(e){return {message:e.message};}}export async function confirmCategoryImport(){window.importCalls=(window.importCalls||0)+1;await new Promise(r=>setTimeout(r,300));return {message:'架空CSV保存成功',success:true};}`,
);
await writeFile(
  path.join(temp, "nav.ts"),
  `export const useRouter=()=>({refresh:()=>window.render()});`,
);
await writeFile(
  path.join(temp, "entry.tsx"),
  `import React from 'react';import {createRoot} from 'react-dom/client';import {CategoryMaster} from '${app}/src/app/(portal)/categories/master-table';import '${app}/src/app/globals.css';const root=createRoot(document.getElementById('root'));let n=0;const row=(name,parent=null,active=true)=>({id:String(++n),category_name:name,parent_category_id:parent,is_active:active,category_level:parent?2:1,display_order:0,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00.123456Z'});window.rows=[row('貴金属'),row('金','1'),row('銀','1'),row('切手'),row('切手','4'),row('ばら','4',false),row('アクセサリー'),row('金','7'),row('時計')];window.calls=0;window.render=()=>root.render(<main style={{padding:24}}><CategoryMaster key={String(window.staff)} categories={window.rows.map(x=>({...x}))} admin={!window.staff}/></main>);window.render();`,
);
await writeFile(
  path.join(temp, "index.html"),
  '<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/entry.tsx"></script></html>',
);
await writeFile(
  path.join(temp, "link.tsx"),
  `import React from 'react';export default function Link({children,href,...props}){return <a href={href} {...props}>{children}</a>}`,
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
        "next/navigation": path.join(temp, "nav.ts"),
        "next/link": path.join(temp, "link.tsx"),
        react: path.join(app, "node_modules/react"),
        "react-dom": path.join(app, "node_modules/react-dom"),
      },
    },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [app, temp] } },
    plugins: [
      {
        name: "synthetic-actions",
        enforce: "pre",
        resolveId(source) {
          if (builtMode && source === "./master.module.css")
            return "\0built-category-styles";
        },
        load(id) {
          if (id === "\0built-category-styles")
            return "export default " + JSON.stringify(builtClasses);
          if (builtMode && id.endsWith("/src/app/globals.css")) return builtCss;
          if (id.endsWith("/categories/actions.ts"))
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
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  p.setDefaultTimeout(6000);
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://127.0.0.1:" + server.httpServer.address().port);
  await p.getByRole("heading", { name: "商品カテゴリ", exact: true }).waitFor();
  const child = (name = "金", parent = "貴金属") =>
    p
      .getByRole("row")
      .filter({ has: p.getByRole("cell", { name, exact: true }) })
      .filter({ hasText: parent })
      .first();
  const edit = () =>
    child().getByRole("button", { name: "編集", exact: true }).click();
  const save = () =>
    p.getByRole("button", { name: "保存", exact: true }).click();
  const cancel = () =>
    p.getByRole("button", { name: "キャンセル", exact: true }).click();
  assert.equal(
    (await p.getByLabel("カテゴリ名", { exact: true }).boundingBox()).height,
    44,
  );
  assert.match(
    await p.locator("tbody").innerText(),
    /子カテゴリはまだありません/,
  );
  assert.equal(
    await p.getByRole("cell", { name: "金", exact: true }).count(),
    2,
  );
  await edit();
  await p.getByLabel("子カテゴリ名", { exact: true }).fill("取消");
  await p.keyboard.press("Escape");
  assert.equal(await p.evaluate(() => window.calls), 0);
  await edit();
  await p.getByLabel("子カテゴリ名", { exact: true }).fill("銀");
  await save();
  assert.match(await p.getByRole("alert").innerText(), /同名/);
  await cancel();
  await p
    .getByRole("button", { name: "＋ 切手に子を追加", exact: true })
    .click();
  await p.getByLabel("子カテゴリ名", { exact: true }).fill("ばら");
  await save();
  assert.match(await p.getByRole("alert").innerText(), /同名/);
  await cancel();
  await edit();
  await p.evaluate(() => (window.conflict = true));
  await p.getByLabel("子カテゴリ名", { exact: true }).fill("金の変更");
  await save();
  assert.match(await p.getByRole("alert").innerText(), /他の更新/);
  assert.equal(
    await p.getByLabel("子カテゴリ名", { exact: true }).inputValue(),
    "金の変更",
  );
  await p.evaluate(() => {
    window.rows[1].category_name = "他の管理者の変更";
    window.render();
  });
  assert.equal(
    await p.getByLabel("子カテゴリ名", { exact: true }).inputValue(),
    "金の変更",
  );
  await cancel();
  assert.equal(
    await p
      .getByRole("cell", { name: "他の管理者の変更", exact: true })
      .count(),
    1,
  );
  await p.evaluate(() => {
    window.conflict = false;
    window.rows[1].category_name = "金";
    window.render();
  });
  // Refreshed rows can leave name/state/parent filters; keep the draft and Cancel accessible.
  for (const changed of ["name", "state", "parent", "missing"]) {
    await p.getByLabel("親カテゴリ", { exact: true }).selectOption("1");
    await p.getByLabel("子の状態", { exact: true }).selectOption("active");
    await p.getByLabel("カテゴリ名", { exact: true }).fill("金");
    await p.getByRole("button", { name: "検索", exact: true }).click();
    await edit();
    await p.getByLabel("子カテゴリ名", { exact: true }).fill("保持する入力");
    await p.evaluate((changed) => {
      window.savedRows = window.rows.map((c) => ({ ...c }));
      const c = window.rows.find((c) => c.id === "2");
      if (changed === "name") {
        c.category_name = "別名";
        window.rows.find((c) => c.id === "1").category_name = "別親名";
      }
      if (changed === "state") c.is_active = false;
      if (changed === "parent") c.parent_category_id = "4";
      if (changed === "missing")
        window.rows = window.rows.filter((c) => c.id !== "2");
      c.updated_at = "2026-10-26T10:00:00Z";
      window.conflict = true;
      window.render();
    }, changed);
    await p
      .getByText(
        "更新により編集中の行が検索条件から外れました。入力内容は保持しています。",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await p.getByLabel("子カテゴリ名", { exact: true }).inputValue(),
      "保持する入力",
    );
    await save();
    assert.equal(
      await p.evaluate(() => window.lastForm.updated_at),
      "2026-01-01T00:00:00.123456Z",
    );
    await cancel();
    assert.equal(
      await p.getByRole("button", { name: "検索", exact: true }).isEnabled(),
      true,
    );
    await p.evaluate(() => {
      window.rows = window.savedRows;
      window.conflict = false;
      window.render();
    });
    await p.getByRole("button", { name: "解除", exact: true }).click();
  }
  await edit();
  await p.getByLabel("子カテゴリ名", { exact: true }).fill("純金");
  await p.evaluate(() => (window.delay = true));
  await p.getByLabel("子カテゴリ名", { exact: true }).press("Enter");
  await p.getByRole("button", { name: "保存中…" }).waitFor();
  assert.equal(
    await p
      .getByRole("button", { name: "キャンセル", exact: true })
      .isDisabled(),
    true,
  );
  await p.keyboard.press("Escape");
  assert.equal(
    await p.getByLabel("子カテゴリ名", { exact: true }).isVisible(),
    true,
  );
  await p.getByRole("cell", { name: "純金", exact: true }).waitFor();
  assert.equal(
    await p.evaluate(() => window.lastForm.updated_at),
    "2026-01-01T00:00:00.123456Z",
  );
  await p
    .getByRole("row")
    .filter({ has: p.getByRole("cell", { name: "純金", exact: true }) })
    .getByRole("button", { name: "親を編集" })
    .click();
  await p.getByLabel("状態", { exact: true }).selectOption("inactive");
  await save();
  assert.match(await p.getByRole("alert").innerText(), /有効な子/);
  await p.getByLabel("状態", { exact: true }).selectOption("active");
  await p.getByLabel("親カテゴリ名", { exact: true }).fill("金属");
  await save();
  await p
    .locator('dialog[aria-labelledby="parent-editor-title"]')
    .waitFor({ state: "hidden" });
  assert.equal(
    await p.getByRole("cell", { name: "金属", exact: true }).count(),
    1,
  );
  assert.equal(await p.evaluate(() => window.rows[1].parent_category_id), "1");
  await p.getByLabel("親カテゴリ", { exact: true }).selectOption("9");
  await p.getByRole("button", { name: "検索", exact: true }).click();
  await p
    .getByRole("button", { name: "＋ 時計に子を追加", exact: true })
    .click();
  await p.getByLabel("子カテゴリ名", { exact: true }).fill("腕時計");
  await p
    .locator("tbody")
    .getByLabel("親カテゴリ", { exact: true })
    .selectOption("7");
  assert.equal(
    await p.getByLabel("子カテゴリ名", { exact: true }).inputValue(),
    "腕時計",
  );
  await save();
  await p.getByRole("button", { name: "解除", exact: true }).click();
  assert.equal(
    await p.evaluate(
      () => window.rows.filter((c) => !c.parent_category_id).length,
    ),
    4,
  );
  assert.equal(
    await p.evaluate(
      () =>
        window.rows.find((c) => c.category_name === "腕時計")
          .parent_category_id,
    ),
    "7",
  );
  await p
    .getByRole("button", { name: "親カテゴリを追加", exact: true })
    .click();
  await p.getByLabel("親カテゴリ名", { exact: true }).fill("空親");
  await p.getByLabel("状態", { exact: true }).selectOption("inactive");
  await save();
  await p
    .locator('dialog[aria-labelledby="parent-editor-title"]')
    .waitFor({ state: "hidden" });
  await p
    .getByRole("button", { name: "＋ 空親に子を追加", exact: true })
    .click();
  await p.getByLabel("子カテゴリ名", { exact: true }).fill("無効親の子");
  await p.getByLabel("状態", { exact: true }).selectOption("active");
  await save();
  assert.match(await p.getByRole("alert").innerText(), /有効な親/);
  await cancel();
  await p.getByLabel("カテゴリ名", { exact: true }).fill("不存在");
  await p.getByRole("button", { name: "検索", exact: true }).click();
  assert.match(
    await p.locator("tbody").innerText(),
    /一致するカテゴリはありません/,
  );
  await p.getByRole("button", { name: "解除", exact: true }).click();
  assert.equal(
    await p.getByText("補助機能：CSV出力・取込", { exact: true }).count(),
    0,
  );
  const parentAction = await p
    .getByRole("button", { name: "親カテゴリを追加", exact: true })
    .boundingBox();
  const exportAction = await p
    .getByRole("link", { name: "CSV出力", exact: true })
    .boundingBox();
  const importAction = await p
    .getByRole("button", { name: "CSV取込", exact: true })
    .boundingBox();
  assert.equal(parentAction.y, exportAction.y);
  assert.equal(exportAction.y, importAction.y);
  assert.equal(parentAction.height, importAction.height);
  await p.getByRole("button", { name: "CSV取込", exact: true }).click();
  await p.getByRole("link", { name: "空テンプレート" }).waitFor();
  const header =
    "id,new_key,parent_id,parent_new_key,category_name,display_order,is_active,updated_at\n";
  await p.getByLabel("CSVファイル").setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("wrong\nvalue"),
  });
  await p
    .getByRole("button", { name: "取込内容をプレビュー", exact: true })
    .click();
  await p.getByText(/^列名・順序が異なります/).waitFor();
  assert.equal(
    await p
      .getByRole("button", { name: "確認した全行を保存", exact: true })
      .count(),
    0,
  );
  await p.getByLabel("CSVファイル").setInputFiles({
    name: "good.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(header + ",newroot,,,CSV新親,0,true,\n"),
  });
  await p
    .getByRole("button", { name: "取込内容をプレビュー", exact: true })
    .click();
  await p.getByRole("heading", { name: /取込前確認/ }).waitFor();
  await p.getByRole("checkbox").check();
  await p
    .getByRole("button", { name: "確認した全行を保存", exact: true })
    .click();
  await p.getByRole("button", { name: "保存中…", exact: true }).waitFor();
  assert.equal(
    await p.getByRole("button", { name: "CSV取込を閉じる" }).isDisabled(),
    true,
  );
  await p.keyboard.press("Escape");
  assert.equal(
    await p.getByRole("dialog", { name: "カテゴリCSV取込" }).isVisible(),
    true,
  );
  await p.getByText("架空CSV保存成功", { exact: true }).waitFor();
  assert.equal(await p.evaluate(() => window.importCalls), 1);
  await p.getByRole("button", { name: "CSV取込を閉じる" }).click();
  await p
    .getByRole("button", { name: "＋ 時計に子を追加", exact: true })
    .click();
  assert.equal(
    await p.getByRole("button", { name: "CSV取込", exact: true }).isDisabled(),
    true,
  );
  await cancel();
  for (let i = 0; i < 2; i++) {
    await p.evaluate(() => {
      window.staff = true;
      window.render();
    });
    await p.getByRole("status").filter({ hasText: "閲覧専用" }).waitFor();
    assert.equal(
      await p.getByRole("button", { name: "編集", exact: true }).count(),
      0,
    );
    assert.equal(await p.locator("details").count(), 0);
    await p.evaluate(() => {
      window.staff = false;
      window.render();
    });
    await p
      .getByRole("button", { name: "親カテゴリを追加", exact: true })
      .waitFor();
  }
  await p.screenshot({
    path: path.join(out, "two-level-desktop.png"),
    fullPage: true,
  });
  for (const width of [1440, 390, 320]) {
    await p.setViewportSize({ width, height: 844 });
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await p
      .getByRole("button", { name: "親カテゴリを追加", exact: true })
      .click();
    await p.locator("dialog[open]").waitFor();
    const parentRect = await p
      .locator('dialog[aria-labelledby="parent-editor-title"]')
      .boundingBox();
    assert(
      Math.abs(parentRect.x + parentRect.width / 2 - width / 2) < 2,
      "parent horizontal center",
    );
    assert(
      Math.abs(parentRect.y + parentRect.height / 2 - 844 / 2) < 2,
      "parent vertical center",
    );
    console.log("parent dialog", width, parentRect);
    await p.screenshot({ path: path.join(out, `parent-dialog-${width}.png`) });
    await p.getByLabel("親カテゴリ名", { exact: true }).focus();
    await p.keyboard.press("Shift+Tab");
    assert.equal(
      await p.evaluate(() =>
        document
          .querySelector('dialog[aria-labelledby="parent-editor-title"]')
          .contains(document.activeElement),
      ),
      true,
    );
    await p.keyboard.press("Escape");
    await p
      .locator('dialog[aria-labelledby="parent-editor-title"]')
      .waitFor({ state: "hidden" });
    await p.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(
      await p
        .getByRole("button", { name: "親カテゴリを追加", exact: true })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    for (let repeat = 0; repeat < 2; repeat++) {
      await p.getByRole("button", { name: "CSV取込", exact: true }).click();
      const csv = p.getByRole("dialog", { name: "カテゴリCSV取込" });
      await csv.waitFor();
      const r = await csv.boundingBox();
      if (repeat === 0) {
        console.log("CSV dialog", width, r);
        await p.screenshot({ path: path.join(out, `csv-dialog-${width}.png`) });
      }
      assert(
        Math.abs(r.x + r.width / 2 - width / 2) < 2,
        "CSV horizontal center",
      );
      assert(Math.abs(r.y + r.height / 2 - 844 / 2) < 2, "CSV vertical center");
      assert.equal(
        await p.getByRole("heading", { name: /取込前確認/ }).count(),
        0,
      );
      await p.getByRole("button", { name: "CSV取込を閉じる" }).focus();
      await p.keyboard.press("Shift+Tab");
      assert.equal(
        await csv.evaluate((el) => el.contains(document.activeElement)),
        true,
      );
      await p.keyboard.press("Escape");
      await csv.waitFor({ state: "hidden" });
      assert.equal(
        await p
          .getByRole("button", { name: "CSV取込", exact: true })
          .evaluate((el) => el === document.activeElement),
        true,
      );
    }
    await p
      .getByRole("button", { name: "＋ 時計に子を追加", exact: true })
      .click();
    await p.getByLabel("子カテゴリ名", { exact: true }).fill("取消");
    await cancel();
  }
  await p.screenshot({
    path: path.join(out, "two-level-mobile.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(builtMode ? "PRODUCTION BUILT CSS" : "VITE CSS");
  console.log(
    "PASS actual category React component: desktop/mobile, edit/cancel/keyboard, stale revision preserved, pending guard, parent rename/disable, empty parent, duplicate inactive, anchored move, filter/reset, readonly staff, top CSV actions, CSV preview/error/confirm and pending close guard, centered parent/CSV overlays; JS errors 0. Synthetic adapters, NOT authenticated E2E.",
  );
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    console.log((await page.locator("body").innerText()).slice(-4000));
    await page.screenshot({
      path: path.join(out, "failure.png"),
      fullPage: true,
    });
  }
  throw error;
} finally {
  await browser?.close();
  await server?.close();
}

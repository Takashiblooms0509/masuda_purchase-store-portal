import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
const migration = "20261026040515_category_master_atomic_csv.sql";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db: PGlite;
const row = (values: Record<string, unknown> = {}) => ({
  id: null,
  new_key: "root",
  parent_id: null,
  parent_new_key: null,
  category_name: "金属",
  display_order: 0,
  is_active: true,
  updated_at: null,
  ...values,
});
const run = (rows: unknown) =>
  db.query("select public.save_category_batch($1::jsonb) result", [
    JSON.stringify(rows),
  ]);
const user = async (n: number | null, role = "authenticated") => {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    n ? id(n) : "",
  ]);
};
const existing = async () =>
  (
    await db.query<{ id: string; updated_at: string }>(
      "select id,updated_at::text from public.product_categories order by category_name",
    )
  ).rows;
const edit = (
  r: { id: string; updated_at: string },
  values: Record<string, unknown> = {},
) => row({ id: r.id, updated_at: r.updated_at, new_key: null, ...values });
describe("category atomic RPC and DB constraints", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      "create role anon nologin; create role authenticated nologin;create schema auth;grant usage on schema auth to anon,authenticated;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;",
    );
    for (const f of [
      "202610010001_phase1_auth_stores.sql",
      "202610010002_phase2_business.sql",
      migration,
    ])
      await db.exec(
        readFileSync(
          new URL("../../supabase/migrations/" + f, import.meta.url),
          "utf8",
        ),
      );
    await db.query(
      "insert into public.stores(id,code,name)values($1,'TEST','架空店舗')",
      [id(10)],
    );
    for (const n of [1, 2, 3])
      await db.query("insert into auth.users(id,email)values($1,$2)", [
        id(n),
        `test${n}@example.test`,
      ]);
    await db.query(
      "update public.profiles set role='admin',is_active=true where id=$1",
      [id(1)],
    );
    await db.query(
      "update public.profiles set store_id=$1,is_active=true where id=$2",
      [id(10), id(2)],
    );
  });
  beforeEach(async () => {
    await db.exec("reset role;truncate public.product_categories cascade");
    await user(1);
  });
  afterAll(async () => {
    await db.close();
  });
  it("has invoker execution, no anon/PUBLIC execute, unchanged admin-only writes", async () => {
    const r = await db.query(
      "select prosecdef,has_function_privilege('anon','public.save_category_batch(jsonb)','execute') anon,has_function_privilege('authenticated','public.save_category_batch(jsonb)','execute') authenticated from pg_proc where oid='public.save_category_batch(jsonb)'::regprocedure",
    );
    expect(r.rows).toEqual([
      { prosecdef: false, anon: false, authenticated: true },
    ]);
    for (const n of [2, 3, null]) {
      await user(n);
      await expect(run([row()])).rejects.toThrow(/category_admin_required/);
    }
    await user(null, "anon");
    await expect(run([row()])).rejects.toThrow(/permission denied/);
  });
  it("creates reversed-order new parent/child atomically with generated IDs and levels", async () => {
    await run([
      row({ new_key: "child", parent_new_key: "root", category_name: "金" }),
      row(),
    ]);
    const r = await db.query(
      "select c.category_level,p.category_name parent from public.product_categories c join public.product_categories p on p.id=c.parent_category_id",
    );
    expect(r.rows).toEqual([{ category_level: 2, parent: "金属" }]);
  });
  it("rejects root/sibling duplicates including inactive and whitespace, allows other parents", async () => {
    await run([row(), row({ new_key: "other", category_name: "カード" })]);
    await expect(
      run([row({ new_key: "dup", category_name: " 金属 ", is_active: false })]),
    ).rejects.toThrow(/category_duplicate_name/);
    await expect(
      db.query(
        "insert into public.product_categories(category_name)values(' 金属 ')",
      ),
    ).rejects.toThrow(/category_sibling_name_unique/);
    const roots = await existing();
    await run(
      roots.map((r, i) =>
        row({ new_key: "child" + i, parent_id: r.id, category_name: "共通" }),
      ),
    );
    expect((await existing()).length).toBe(4);
  });
  it("rejects active child under inactive parent for direct writes and CSV; supports joint deactivation", async () => {
    await run([
      row(),
      row({ new_key: "child", parent_new_key: "root", category_name: "金" }),
    ]);
    const all = await db.query<{
      id: string;
      category_name: string;
      parent_category_id: string | null;
      updated_at: string;
    }>(
      "select id,category_name,parent_category_id,updated_at::text from public.product_categories",
    );
    const parent = all.rows.find((r) => !r.parent_category_id)!;
    await expect(
      db.query(
        "update public.product_categories set is_active=false where id=$1",
        [parent.id],
      ),
    ).rejects.toThrow(/category_active_child/);
    await expect(run([edit(parent, { is_active: false })])).rejects.toThrow(
      /category_active_child/,
    );
    await run(
      all.rows.map((r) =>
        edit(r, {
          category_name: r.category_name,
          parent_id: r.parent_category_id,
          is_active: false,
        }),
      ),
    );
    expect(
      (
        await db.query(
          "select count(*)::int n from public.product_categories where is_active",
        )
      ).rows,
    ).toEqual([{ n: 0 }]);
    await expect(
      db.query(
        "update public.product_categories set is_active=true where parent_category_id is not null",
      ),
    ).rejects.toThrow(/category_active_child/);
  });
  it("uses the same whitespace normalization as the UI without trimming ordinary letters", async () => {
    await run([row()]);
    await expect(
      db.query(
        "insert into public.product_categories(category_name)values($1)",
        ["\t金属\u3000"],
      ),
    ).rejects.toThrow(/category_sibling_name_unique/);
    await expect(
      db.query(
        "insert into public.product_categories(category_name)values($1)",
        ["\t\u3000"],
      ),
    ).rejects.toThrow(/category_name_key_length/);
    const result = await db.query(
      "select private.category_trim_name($1) value",
      ["v金属v"],
    );
    expect(result.rows).toEqual([{ value: "v金属v" }]);
  });
  it("allows atomic sibling-name swaps without transient duplicate failure", async () => {
    await run([
      row({ category_name: "A" }),
      row({ new_key: "b", category_name: "B" }),
    ]);
    const a = await existing();
    await run([
      edit(a[0], { category_name: "B" }),
      edit(a[1], { category_name: "A" }),
    ]);
    expect(
      (
        await db.query(
          "select category_name from public.product_categories where id=$1",
          [a[0].id],
        )
      ).rows,
    ).toEqual([{ category_name: "B" }]);
  });
  it("detects stale timestamps before any writes and preserves full rollback", async () => {
    await run([row()]);
    const r = (await existing())[0];
    await db.query(
      "update public.product_categories set display_order=2 where id=$1",
      [r.id],
    );
    await expect(
      run([row({ new_key: "new", category_name: "追加" }), edit(r)]),
    ).rejects.toThrow(/category_conflict/);
    expect((await existing()).length).toBe(1);
  });
  it("rejects cycles but permits a valid ancestor reversal in final-tree order", async () => {
    await run([
      row({ category_name: "A" }),
      row({ new_key: "b", parent_new_key: "root", category_name: "B" }),
    ]);
    const r = await existing();
    await expect(
      run([edit(r[0], { category_name: "A", parent_id: r[1].id })]),
    ).rejects.toThrow(/category_cycle/);
    await run([
      edit(r[0], { category_name: "A", parent_id: r[1].id }),
      edit(r[1], { category_name: "B" }),
    ]);
    expect(
      (
        await db.query(
          "select category_level from public.product_categories where id=$1",
          [r[0].id],
        )
      ).rows,
    ).toEqual([{ category_level: 2 }]);
  });
  it("rejects malformed rows, duplicate IDs/keys, unknown IDs/references and limits", async () => {
    for (const rows of [
      null,
      [],
      Array(501).fill(row()),
      [row(), row()],
      [row({ id: id(99), new_key: null, updated_at: "2026-01-01T00:00:00Z" })],
      [row({ parent_new_key: "missing" })],
      [row({ parent_id: id(99) })],
      [row({ display_order: 1.5 })],
      [row({ is_active: "true" })],
      [{ ...row(), extra: 1 }],
      [row({ category_name: "x".repeat(101) })],
    ])
      await expect(run(rows)).rejects.toThrow();
    expect((await existing()).length).toBe(0);
  });
  it("rolls back earlier inserts if a later write fails unexpectedly", async () => {
    await db.exec(
      "reset role;create function public.category_test_failure()returns trigger language plpgsql as $$ begin if new.category_name='Z_FAIL' then raise exception 'test_failure'; end if;return new;end;$$;create trigger category_test_failure before insert on public.product_categories for each row execute function public.category_test_failure();",
    );
    await user(1);
    try {
      await expect(
        run([
          row({ new_key: "a", category_name: "A" }),
          row({ new_key: "z", category_name: "Z_FAIL" }),
        ]),
      ).rejects.toThrow(/test_failure/);
      expect((await existing()).length).toBe(0);
    } finally {
      await db.exec(
        "reset role;drop trigger category_test_failure on public.product_categories;drop function public.category_test_failure()",
      );
    }
  });
  it("migration aborts on existing duplicates without correcting data", async () => {
    const legacy = new PGlite();
    try {
      await legacy.exec(
        "create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid()returns uuid language sql stable as $$select null::uuid;$$;",
      );
      for (const f of [
        "202610010001_phase1_auth_stores.sql",
        "202610010002_phase2_business.sql",
      ])
        await legacy.exec(
          readFileSync(
            new URL("../../supabase/migrations/" + f, import.meta.url),
            "utf8",
          ),
        );
      await legacy.exec(
        "insert into public.product_categories(category_name)values('duplicate'),('duplicate');",
      );
      await expect(
        legacy.exec(
          readFileSync(
            new URL("../../supabase/migrations/" + migration, import.meta.url),
            "utf8",
          ),
        ),
      ).rejects.toThrow(/category_existing_duplicate/);
      await legacy.exec("rollback");
      expect(
        (
          await legacy.query(
            "select count(*)::int n from public.product_categories",
          )
        ).rows,
      ).toEqual([{ n: 2 }]);
      expect(
        (
          await legacy.query(
            "select count(*)::int n from information_schema.columns where table_name='product_categories' and column_name='category_name_key'",
          )
        ).rows,
      ).toEqual([{ n: 0 }]);
    } finally {
      await legacy.close();
    }
  });
});

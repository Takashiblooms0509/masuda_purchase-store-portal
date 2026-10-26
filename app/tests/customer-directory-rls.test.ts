import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
const db = new PGlite();
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = async (n: number) => {
  await db.exec("reset role;set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id(n),
  ]);
};
beforeAll(async () => {
  await db.exec(
    "create role anon nologin;create role authenticated nologin;create schema auth;grant usage on schema auth to authenticated,anon;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
  );
  for (const f of [
    "supabase/migrations/202610010001_phase1_auth_stores.sql",
    "supabase/migrations/202610010002_phase2_business.sql",
    "supabase/migrations/20261026033404_customer_directory_admin_updates.sql",
  ])
    await db.exec(await readFile(path.resolve(process.cwd(), "..", f), "utf8"));
  await db.query(
    "insert into stores(id,code,name) values($1,'A','Test A'),($2,'B','Test B')",
    [id(10), id(11)],
  );
  for (const n of [1, 2, 3])
    await db.query("insert into auth.users values($1,$2)", [
      id(n),
      `test${n}@example.test`,
    ]);
  await db.query("update profiles set store_id=$1,is_active=true where id=$2", [
    id(10),
    id(1),
  ]);
  await db.query(
    "update profiles set role='admin',is_active=true where id=$1",
    [id(2)],
  );
  for (const [n, s] of [
    [20, 10],
    [21, 11],
  ]) {
    await db.query(
      "insert into customers(id,store_id,name,identification_number,address,birth_date) values($1,$2,'Test customer','SECRET-FIXTURE','PRIVATE-FIXTURE','1990-01-01')",
      [id(n), id(s)],
    );
    await db.query(
      "insert into customer_documents(customer_id,document_type,file_name) values($1,'drivers_license','test.png')",
      [id(n)],
    );
    await db.query(
      "insert into purchase_transactions(store_id,customer_id,visit_datetime,transaction_status) values($1,$2,now(),'completed')",
      [id(s), id(n)],
    );
  }
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("Limited customer directory with formal migration", () => {
  it("staff sees cross-store allowlisted fields while base tables remain store-scoped", async () => {
    await actor(1);
    const { rows } = await db.query<{
      value: {
        customers: Record<string, unknown>[];
        selected: Record<string, unknown>;
        stores: unknown[];
      };
    }>("select get_customer_directory(p_selected:=$1) as value", [id(21)]);
    expect(rows[0].value.customers).toHaveLength(2);
    expect(rows[0].value.selected.id).toBe(id(21));
    expect(rows[0].value.stores).toHaveLength(2);
    expect(Object.keys(rows[0].value.selected).sort()).toEqual(
      [
        "id",
        "store_id",
        "name",
        "name_kana",
        "phone",
        "membership_card_number",
        "created_at",
      ].sort(),
    );
    expect(JSON.stringify(rows)).not.toContain("SECRET-FIXTURE");
    expect(JSON.stringify(rows)).not.toContain("PRIVATE-FIXTURE");
    for (const table of [
      "customers",
      "customer_documents",
      "purchase_transactions",
      "stores",
    ])
      expect((await db.query(`select * from ${table}`)).rows).toHaveLength(1);
  });
  it("staff direct UPDATE is blocked but own-store transaction visit trigger still works", async () => {
    await actor(1);
    expect(
      (
        await db.query(
          "update customers set name='No' where id=$1 returning id",
          [id(20)],
        )
      ).rows,
    ).toHaveLength(0);
    await db.query(
      "insert into purchase_transactions(store_id,customer_id,visit_datetime,transaction_status) values($1,$2,'2026-12-01T03:00Z','completed')",
      [id(10), id(20)],
    );
    const { rows } = await db.query<{ day: string }>(
      "select last_visit_date::text as day from customers where id=$1",
      [id(20)],
    );
    expect(rows[0].day).toBe("2026-12-01");
  });
  it("admin update remains available", async () => {
    await actor(2);
    expect(
      (
        await db.query(
          "update customers set name='Updated test' where id=$1 returning id",
          [id(21)],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("inactive and anonymous directory calls are rejected", async () => {
    await actor(3);
    await expect(db.query("select get_customer_directory()")).rejects.toThrow(
      "access denied",
    );
    await db.exec("reset role;set role anon");
    await expect(
      db.query("select public.get_customer_directory()"),
    ).rejects.toThrow(/permission denied/);
  });
  it("invalid filters are rejected before results", async () => {
    await actor(1);
    await expect(
      db.query("select get_customer_directory(p_page:=0)"),
    ).rejects.toThrow("Invalid customer search");
    await expect(
      db.query(
        "select get_customer_directory(p_from:='2026-11-01',p_to:='2026-10-01')",
      ),
    ).rejects.toThrow("Invalid customer search");
  });
});

describe("Directory search and eligibility edges", () => {
  it("matches kana as an alternative to name, and treats wildcard characters literally", async () => {
    await db.exec("reset role");
    await db.query(
      "update customers set name_kana='カナテスト',phone='00123',membership_card_number='001%' where id=$1",
      [id(20)],
    );
    await actor(1);
    const result = (
      await db.query<{ value: { total: number } }>(
        "select get_customer_directory(p_name:='カナ',p_phone:='001',p_card:='%') value",
      )
    ).rows[0].value;
    expect(result.total).toBe(1);
    expect(
      (
        await db.query<{ value: { total: number } }>(
          "select get_customer_directory(p_name:='%') value",
        )
      ).rows[0].value.total,
    ).toBe(0);
  });
  it("rejects infinity, out-of-range dates, NULL page and allows the upper bounded date safely", async () => {
    await actor(1);
    for (const args of [
      "p_from:='-infinity'",
      "p_to:='infinity'",
      "p_to:='294276-12-31'",
      "p_from:='0001-01-01 BC'",
      "p_page:=null",
    ])
      await expect(
        db.query(`select get_customer_directory(${args})`),
      ).rejects.toThrow("Invalid customer search");
    await expect(
      db.query(
        "select get_customer_directory(p_from:='0001-01-01',p_to:='9999-12-31')",
      ),
    ).resolves.toBeDefined();
  });
  it("covers JST registration boundary and pagination", async () => {
    await db.exec("reset role");
    await db.query(
      "update customers set created_at='2026-09-30T15:00:00Z' where id=$1",
      [id(20)],
    );
    await db.query(
      "update customers set created_at='2026-10-01T15:00:00Z' where id=$1",
      [id(21)],
    );
    await actor(1);
    const value = (
      await db.query<{ value: { total: number; customers: { id: string }[] } }>(
        "select get_customer_directory(p_from:='2026-10-01',p_to:='2026-10-01') value",
      )
    ).rows[0].value;
    expect(value.total).toBe(1);
    expect(value.customers[0].id).toBe(id(20));
    expect(
      (
        await db.query<{ value: { customers: unknown[] } }>(
          "select get_customer_directory(p_page:=2) value",
        )
      ).rows[0].value.customers,
    ).toEqual([]);
  });
  it("preserves own-store new registration and refuses cross-store insertion", async () => {
    await actor(1);
    await expect(
      db.query(
        "insert into customers(store_id,name) values($1,'New fixture')",
        [id(10)],
      ),
    ).resolves.toBeDefined();
    await expect(
      db.query("insert into customers(store_id,name) values($1,'Forbidden')", [
        id(11),
      ]),
    ).rejects.toThrow(/row-level security/);
  });
  it("includes historical inactive target stores but denies a deactivated caller store", async () => {
    await db.exec("reset role");
    await db.query("update stores set is_active=false where id=$1", [id(11)]);
    await actor(1);
    expect(
      (
        await db.query<{ value: { total: number } }>(
          "select get_customer_directory(p_store:=$1) value",
          [id(11)],
        )
      ).rows[0].value.total,
    ).toBe(1);
    await db.exec("reset role");
    await db.query("update stores set is_active=false where id=$1", [id(10)]);
    await actor(1);
    await expect(db.query("select get_customer_directory()")).rejects.toThrow(
      "access denied",
    );
    await db.exec("reset role");
    await db.query("update stores set is_active=true where id=$1", [id(10)]);
  });
  it("internal reader independently checks identity and exact public grants exclude anonymous execution", async () => {
    await actor(3);
    await expect(
      db.query("select private.customer_directory()"),
    ).rejects.toThrow("access denied");
    await db.exec("reset role");
    const rows = (
      await db.query<{
        anon: boolean;
        authenticated: boolean;
        definer: boolean;
      }>(
        "select has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated,p.prosecdef definer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname='get_customer_directory') or (n.nspname='private' and p.proname='customer_directory') order by p.prosecdef",
      )
    ).rows;
    expect(rows).toEqual([
      { anon: false, authenticated: true, definer: false },
      { anon: false, authenticated: true, definer: true },
    ]);
  });
});

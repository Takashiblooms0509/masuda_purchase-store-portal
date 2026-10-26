import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
} from "vitest";
import { homeReportSchema } from "@/lib/home/report";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1),
  staff = id(2),
  other = id(3),
  inactive = id(4),
  storeA = id(10),
  storeB = id(11),
  customerA = id(20),
  customerB = id(21),
  metal = id(30),
  card = id(31);
let db: PGlite;
async function asUser(user: string | null, role = "authenticated") {
  await db.exec(`reset role; set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user ?? "",
  ]);
}
async function report({
  from = "2026-10-01",
  to = "2026-10-31",
  store = null,
  day = null,
  category = null,
  uncategorized = false,
}: {
  from?: string;
  to?: string;
  store?: string | null;
  day?: string | null;
  category?: string | null;
  uncategorized?: boolean;
} = {}) {
  const { rows } = await db.query<{ value: unknown }>(
    "select public.get_home_report($1,$2,$3,$4,$5,$6) as value",
    [from, to, store, day, category, uncategorized],
  );
  return homeReportSchema.parse(rows[0].value);
}
async function transaction(n: number, at: string, b = false) {
  await db.query(
    "insert into public.purchase_transactions(id,store_id,customer_id,visit_datetime,transaction_status,purchase_total) values($1,$2,$3,$4,'not_completed',999999)",
    [id(n), b ? storeB : storeA, b ? customerB : customerA, at],
  );
}
async function item(
  n: number,
  t: number,
  c: string | null,
  status: string,
  amount: number | null,
) {
  await db.query(
    "insert into public.purchase_items(id,purchase_transaction_id,product_category_id,item_name,purchase_status,purchase_amount,quantity) values($1,$2,$3,'test item',$4,$5,100)",
    [id(n), id(t), c, status, amount],
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon nologin; create role authenticated nologin; create schema auth; grant usage on schema auth to anon,authenticated; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;`,
  );
  for (const name of [
    "202610010001_phase1_auth_stores.sql",
    "202610010002_phase2_business.sql",
  ])
    await db.exec(
      readFileSync(
        new URL(`../../supabase/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  await db.query(
    "insert into public.stores(id,code,name) values($1,'A','Test A'),($2,'B','Test B')",
    [storeA, storeB],
  );
  for (const u of [admin, staff, other, inactive])
    await db.query("insert into auth.users values($1,'test@example.test')", [
      u,
    ]);
  await db.query(
    "update public.profiles set role='admin',is_active=true where id=$1",
    [admin],
  );
  await db.query(
    "update public.profiles set store_id=$1,is_active=true where id=$2",
    [storeA, staff],
  );
  await db.query(
    "update public.profiles set store_id=$1,is_active=true where id=$2",
    [storeB, other],
  );
  await db.query("update public.profiles set store_id=$1 where id=$2", [
    storeA,
    inactive,
  ]);
  await db.query(
    "insert into public.customers(id,store_id,name) values($1,$2,'Test A'),($3,$4,'Test B')",
    [customerA, storeA, customerB, storeB],
  );
  await db.query(
    "insert into public.product_categories(id,category_name) values($1,'Metal'),($2,'Card')",
    [metal, card],
  );
  await transaction(90, "2026-09-01T00:00:00Z");
  await db.query(
    "insert into public.purchase_items(id,purchase_transaction_id,item_name,purchase_amount) values($1,$2,'legacy',500)",
    [id(99), id(90)],
  );
  // Match the existing production ACL reported by the parent review.
  // CREATE OR REPLACE must preserve this explicit anon EXECUTE grant.
  await db.exec(
    "grant execute on function public.save_purchase_transaction(uuid,jsonb,jsonb) to anon",
  );
  // Isolated local test DB only; no Supabase connection.
  await db.exec(
    readFileSync(
      new URL(
        "../../supabase/migrations/20261026024940_home_item_outcomes_reporting.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});
beforeEach(async () => {
  await db.exec("reset role; begin");
  await transaction(100, "2026-09-30T15:00:00Z");
  await item(200, 100, metal, "not_completed", 800);
  await item(201, 100, card, "completed", 1200.25);
  await transaction(101, "2026-10-01T14:59:59.999Z");
  await item(202, 101, metal, "pending", 600);
  await item(203, 101, metal, "completed", null);
  await item(204, 101, null, "completed", 0);
  await transaction(102, "2026-10-31T14:59:59.999Z");
  await transaction(103, "2026-10-01T00:00:00Z", true);
  await item(205, 103, metal, "completed", 9000);
  await transaction(104, "2026-09-30T14:59:59.999Z");
  await item(206, 104, metal, "completed", 700);
  await transaction(105, "2026-10-31T15:00:00Z");
  await item(207, 105, metal, "completed", 700);
});
afterEach(async () => {
  await db.exec("rollback; reset role");
});
afterAll(async () => {
  await db.close();
});
describe("HOME proposed SQL and existing store RLS", () => {
  it("preserves existing anon EXECUTE on save RPC but denies anonymous table access", async () => {
    const { rows } = await db.query<{ allowed: boolean }>(
      "select has_function_privilege('anon', 'public.save_purchase_transaction(uuid,jsonb,jsonb)', 'EXECUTE') as allowed",
    );
    expect(rows[0].allowed).toBe(true);
    await asUser(null, "anon");
    await expect(
      db.query("select public.save_purchase_transaction($1,$2,$3)", [
        id(100),
        JSON.stringify({
          store_id: storeA,
          customer_id: customerA,
          visit_datetime: "2026-10-01T00:00:00+09:00",
          transaction_status: "completed",
        }),
        JSON.stringify([]),
      ]),
    ).rejects.toThrow(/permission denied for table purchase_transactions/);
  });

  it("counts mixed outcomes as items and ignores quantity and transaction header money/status", async () => {
    await asUser(staff);
    const r = await report({
      from: "2026-10-01",
      to: "2026-10-01",
      day: "2026-10-01",
    });
    expect(r.recent.find((t) => t.id === id(100))).toMatchObject({
      completed: 1,
      not_completed: 1,
      amount: 1200.25,
    });
    expect(r.summary).toEqual({
      visits: 2,
      completed: 3,
      not_completed: 1,
      pending: 1,
      amount: 1200.25,
      unpriced: 1,
    });
    expect(r.item_count).toBe(5);
    expect(r.items).toHaveLength(5);
  });
  it("preserves store boundaries in metrics, recent, categories and details even for forged store params", async () => {
    await asUser(staff);
    const r = await report({ day: "2026-10-01" });
    expect(r.summary).toMatchObject({ visits: 3, amount: 1200.25 });
    expect(r.recent.every((t) => t.store_id === storeA)).toBe(true);
    expect(r.items.some((i) => i.id === id(205))).toBe(false);
    expect(r.categories.reduce((n, c) => n + c.amount, 0)).toBe(1200.25);
    expect((await report({ store: storeB })).summary.visits).toBe(0);
    await asUser(other);
    expect((await report()).summary.amount).toBe(9000);
    await asUser(admin);
    expect((await report()).summary.amount).toBe(10200.25);
    expect((await report({ store: storeA })).summary.amount).toBe(1200.25);
  });
  it("filters item outcomes and money by category and counts each matching visit once", async () => {
    await asUser(staff);
    const r = await report({ category: metal, day: "2026-10-01" });
    expect(r.summary).toEqual({
      visits: 2,
      completed: 1,
      not_completed: 1,
      pending: 1,
      amount: 0,
      unpriced: 1,
    });
    expect(r.items).toHaveLength(3);
    expect(r.categories).toEqual([{ id: metal, name: "Metal", amount: 0 }]);
    expect(r.recent.find((t) => t.id === id(100))).toMatchObject({
      completed: 0,
      not_completed: 1,
      amount: 0,
    });
    expect((await report({ category: card })).summary).toMatchObject({
      visits: 1,
      completed: 1,
      not_completed: 0,
      amount: 1200.25,
    });
  });
  it("distinguishes unknown category, pending, null amounts and completed zero; legacy remains pending", async () => {
    await asUser(staff);
    expect((await report({ uncategorized: true })).summary).toEqual({
      visits: 1,
      completed: 1,
      not_completed: 0,
      pending: 0,
      amount: 0,
      unpriced: 0,
    });
    expect(
      (await report({ from: "2026-09-01", to: "2026-09-01" })).summary,
    ).toMatchObject({ visits: 1, pending: 1, completed: 0, amount: 0 });
  });
  it("uses exact JST bounds regardless of DB timezone and emits empty calendar days", async () => {
    await db.exec("set local timezone='America/Los_Angeles'");
    await asUser(staff);
    const r = await report();
    expect(r.daily).toHaveLength(31);
    expect(r.daily[0].visits).toBe(2);
    expect(r.daily[1].visits).toBe(0);
    expect(r.daily[30].visits).toBe(1);
  });
  it("returns no data for inactive profile or inactive staff store", async () => {
    await asUser(inactive);
    expect((await report({ day: "2026-10-01" })).items).toEqual([]);
    await db.exec("reset role");
    await db.query("update public.stores set is_active=false where id=$1", [
      storeA,
    ]);
    await asUser(staff);
    expect((await report()).summary.visits).toBe(0);
  });
  it("denies anonymous RPC", async () => {
    await asUser(null, "anon");
    await expect(report()).rejects.toThrow(/permission denied/);
  });
  it.each([
    { from: "2026-11-01", to: "2026-10-01" },
    { from: "2020-01-01" },
    { day: "2026-09-01" },
    { category: metal, uncategorized: true },
  ])("validates RPC inputs %o", async (input) => {
    await asUser(staff);
    await expect(report(input)).rejects.toThrow(/Invalid/);
  });
  it("aggregates over 1000 records without truncation, limits only visible item details", async () => {
    await db.query(
      "insert into public.purchase_items(purchase_transaction_id,item_name,purchase_status,purchase_amount) select $1,'bulk','completed',1 from generate_series(1,1100)",
      [id(100)],
    );
    await asUser(staff);
    const r = await report({ day: "2026-10-01" });
    expect(r.summary.completed).toBe(1103);
    expect(r.summary.amount).toBe(2300.25);
    expect(r.item_count).toBe(1105);
    expect(r.items).toHaveLength(100);
  });
  it("saves statuses atomically, preserves IDs and omitted status from old clients, denies other-store update", async () => {
    await asUser(staff);
    const header = {
      store_id: storeA,
      customer_id: customerA,
      visit_datetime: "2026-10-01T00:00:00+09:00",
      transaction_status: "not_completed",
    };
    const line = {
      id: id(200),
      item_name: "reviewed",
      category_reviewed: true,
      purchase_status: "completed",
      purchase_amount: 0,
    };
    await db.query("select public.save_purchase_transaction($1,$2,$3)", [
      id(100),
      JSON.stringify(header),
      JSON.stringify([line]),
    ]);
    expect(
      (await report({ day: "2026-10-01" })).items.find((i) => i.id === id(200))
        ?.purchase_status,
    ).toBe("completed");
    await db.query("select public.save_purchase_transaction($1,$2,$3)", [
      id(100),
      JSON.stringify(header),
      JSON.stringify([{ ...line, purchase_status: undefined }]),
    ]);
    expect(
      (await report({ day: "2026-10-01" })).items.find((i) => i.id === id(200))
        ?.purchase_status,
    ).toBe("completed");
    await expect(
      db.query("select public.save_purchase_transaction($1,$2,$3)", [
        id(103),
        JSON.stringify({ ...header, store_id: storeB }),
        JSON.stringify([]),
      ]),
    ).rejects.toThrow(/not accessible/);
  });
  it("rejects invalid item status in DB", async () => {
    await asUser(staff);
    await db.exec("savepoint bad_status");
    await expect(
      db.query(
        "update public.purchase_items set purchase_status='unknown' where id=$1",
        [id(200)],
      ),
    ).rejects.toThrow(/purchase_items_purchase_status_check/);
    await db.exec("rollback to bad_status");
    expect((await report()).summary.not_completed).toBe(1);
  });
});

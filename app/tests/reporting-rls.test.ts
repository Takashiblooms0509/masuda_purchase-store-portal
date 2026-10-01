import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1),
  staffA = id(2),
  staffB = id(3),
  inactive = id(4);
const storeA = id(10),
  storeB = id(11),
  customerA = id(20),
  customerB = id(21);
const reference = "2026-10-01T03:00:00Z";
let db: PGlite;

async function asUser(uid: string | null, role = "authenticated") {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    uid ?? "",
  ]);
}
async function summary(asOf = reference) {
  const { rows } = await db.query<Record<string, unknown>>(
    "select * from public.get_dashboard_summary($1)",
    [asOf],
  );
  return Object.fromEntries(
    Object.entries(rows[0]).map(([key, value]) => [
      key,
      key === "aggregation_date"
        ? (value instanceof Date ? value.toISOString() : String(value)).slice(
            0,
            10,
          )
        : Number(value),
    ]),
  );
}
async function insert(
  date: string,
  amount: number | null,
  status = "completed",
  otherStore = false,
) {
  await db.query(
    "insert into public.purchase_transactions(store_id,customer_id,visit_datetime,transaction_status,purchase_total) values($1,$2,$3,$4,$5)",
    [
      otherStore ? storeB : storeA,
      otherStore ? customerB : customerA,
      date,
      status,
      amount,
    ],
  );
}

describe("Phase3 actual SQL aggregation and RLS", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon nologin; create role authenticated nologin;
      create schema auth; grant usage on schema auth to anon,authenticated;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;`);
    for (const migration of [
      "202610010001_phase1_auth_stores.sql",
      "202610010002_phase2_business.sql",
      "202610010003_phase3_reporting.sql",
    ])
      await db.exec(
        readFileSync(
          new URL(`../../supabase/migrations/${migration}`, import.meta.url),
          "utf8",
        ),
      );
    await db.query(
      "insert into public.stores(id,code,name) values($1,'A','検証店舗A'),($2,'B','検証店舗B')",
      [storeA, storeB],
    );
    for (const uid of [admin, staffA, staffB, inactive])
      await db.query(
        "insert into auth.users values($1,'fixture@example.test')",
        [uid],
      );
    await db.query(
      "update public.profiles set role='admin',is_active=true where id=$1",
      [admin],
    );
    await db.query(
      "update public.profiles set store_id=$1,is_active=true where id=$2",
      [storeA, staffA],
    );
    await db.query(
      "update public.profiles set store_id=$1,is_active=true where id=$2",
      [storeB, staffB],
    );
    await db.query("update public.profiles set store_id=$1 where id=$2", [
      storeA,
      inactive,
    ]);
    await db.query(
      "insert into public.customers(id,store_id,name) values($1,$2,'検証顧客A'),($3,$4,'検証顧客B')",
      [customerA, storeA, customerB, storeB],
    );
  });
  beforeEach(async () => {
    await db.exec("reset role; begin;");
    await insert("2026-09-30T14:59:59.999Z", 5);
    await insert("2026-09-30T15:00:00Z", 10.5);
    await insert("2026-10-01T14:59:59.999Z", 20.25);
    await insert("2026-10-01T15:00:00Z", 30);
    await insert("2026-10-15T03:00:00Z", 999, "not_completed");
    await insert("2026-10-31T14:59:59.999Z", 40);
    await insert("2026-10-31T15:00:00Z", 50);
    await insert("2026-10-01T09:00:00Z", 777, "not_completed");
    await insert("2026-10-01T08:00:00Z", null);
    await insert("2026-10-01T03:00:00Z", 1000, "completed", true);
  });
  afterEach(async () => {
    await db.exec("rollback; reset role;");
  });
  afterAll(async () => {
    await db.close();
  });

  it("counts all visits, completed and not-completed separately with exact JST boundaries", async () => {
    await asUser(staffA);
    expect(await summary()).toEqual({
      aggregation_date: "2026-10-01",
      today_visits: 4,
      today_completed: 3,
      today_not_completed: 1,
      today_purchase_total: 30.75,
      today_unpriced: 1,
      month_visits: 7,
      month_completed: 5,
      month_purchase_total: 100.75,
      month_unpriced: 1,
    });
  });
  it("admin sees all stores and another staff sees only their store", async () => {
    await asUser(admin);
    expect(await summary()).toMatchObject({
      today_visits: 5,
      today_completed: 4,
      today_purchase_total: 1030.75,
      month_visits: 8,
      month_completed: 6,
      month_purchase_total: 1100.75,
    });
    await db.exec("reset role");
    await asUser(staffB);
    expect(await summary()).toMatchObject({
      today_visits: 1,
      today_purchase_total: 1000,
      today_unpriced: 0,
      month_visits: 1,
    });
  });
  it("distinguishes zero from unentered money and excludes not-completed amounts", async () => {
    await insert("2026-10-01T10:00:00Z", 0);
    await asUser(staffA);
    expect(await summary()).toMatchObject({
      today_completed: 4,
      today_purchase_total: 30.75,
      today_unpriced: 1,
    });
  });
  it("returns one zero-valued summary row for an empty period", async () => {
    await asUser(staffA);
    expect(await summary("2030-01-01T03:00:00Z")).toEqual({
      aggregation_date: "2030-01-01",
      today_visits: 0,
      today_completed: 0,
      today_not_completed: 0,
      today_purchase_total: 0,
      today_unpriced: 0,
      month_visits: 0,
      month_completed: 0,
      month_purchase_total: 0,
      month_unpriced: 0,
    });
  });
  it("ignores the database session timezone and uses JST even when UTC date differs", async () => {
    await db.exec("set local timezone='America/Los_Angeles'");
    await asUser(staffA);
    expect(await summary("2026-09-30T15:00:00Z")).toMatchObject({
      aggregation_date: "2026-10-01",
      today_visits: 4,
      month_visits: 7,
    });
  });
  it("handles year change without including the previous local day", async () => {
    await insert("2026-12-31T14:59:59.999Z", 888);
    await insert("2026-12-31T15:00:00Z", 123);
    await asUser(staffA);
    expect(await summary("2026-12-31T16:00:00Z")).toMatchObject({
      aggregation_date: "2027-01-01",
      today_visits: 1,
      month_visits: 1,
      month_purchase_total: 123,
    });
  });
  it("includes leap day and excludes the start of March", async () => {
    await insert("2028-02-29T14:59:59.999Z", 25);
    await insert("2028-02-29T15:00:00Z", 50);
    await asUser(staffA);
    expect(await summary("2028-02-29T03:00:00Z")).toMatchObject({
      aggregation_date: "2028-02-29",
      today_visits: 1,
      month_visits: 1,
      month_purchase_total: 25,
    });
  });
  it("aggregates more than 1000 transactions instead of a REST row-limit slice", async () => {
    await db.query(
      "insert into public.purchase_transactions(store_id,customer_id,visit_datetime,transaction_status,purchase_total) select $1,$2,'2026-10-01T12:00:00+09:00','completed',1 from generate_series(1,1101)",
      [storeA, customerA],
    );
    await asUser(staffA);
    expect(await summary()).toMatchObject({
      today_visits: 1105,
      today_completed: 1104,
      today_purchase_total: 1131.75,
      month_visits: 1108,
      month_purchase_total: 1201.75,
    });
  });
  it("denies anonymous execution", async () => {
    await asUser(null, "anon");
    await expect(summary()).rejects.toMatchObject({ code: "42501" });
  });
  it("does not reveal data without a JWT or for an inactive account", async () => {
    for (const uid of [null, inactive]) {
      await db.exec("reset role");
      await asUser(uid);
      expect(await summary()).toMatchObject({
        today_visits: 0,
        month_visits: 0,
        month_purchase_total: 0,
      });
    }
  });
  it("disabled store blocks staff while admin retains the historical totals", async () => {
    await db.query("update public.stores set is_active=false where id=$1", [
      storeA,
    ]);
    await asUser(staffA);
    expect(await summary()).toMatchObject({ month_visits: 0 });
    await db.exec("reset role");
    await asUser(admin);
    expect(await summary()).toMatchObject({
      month_visits: 8,
      month_purchase_total: 1100.75,
    });
  });
  it("failed-import reads use the same store RLS and exclude pending files", async () => {
    await db.query(
      "insert into public.document_imports(store_id,document_type,file_name,processing_status,error_message) values($1,'purchase_document','failed-a.jpg','failed','検証用の一般的な読取エラー'),($2,'purchase_document','failed-b.jpg','failed','検証用の一般的な読取エラー'),($1,'purchase_document','pending.jpg','pending',null)",
      [storeA, storeB],
    );
    await asUser(staffA);
    const staff = await db.query(
      "select file_name from public.document_imports where processing_status='failed' order by file_name",
    );
    expect(staff.rows).toEqual([{ file_name: "failed-a.jpg" }]);
    await db.exec("reset role");
    await asUser(admin);
    const all = await db.query(
      "select file_name from public.document_imports where processing_status='failed' order by file_name",
    );
    expect(all.rows).toEqual([
      { file_name: "failed-a.jpg" },
      { file_name: "failed-b.jpg" },
    ]);
  });
});

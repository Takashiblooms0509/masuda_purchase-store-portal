import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";

const ids = {
  admin: "00000000-0000-4000-8000-000000000001",
  a: "00000000-0000-4000-8000-000000000002",
  b: "00000000-0000-4000-8000-000000000003",
  inactive: "00000000-0000-4000-8000-000000000004",
  newUser: "00000000-0000-4000-8000-000000000005",
  storeA: "10000000-0000-4000-8000-000000000001",
  storeB: "10000000-0000-4000-8000-000000000002",
};
let db: PGlite;
async function asUser(id: string | null, role = "authenticated") {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ""]);
}

describe("Phase1 migration / PostgreSQL RLS", () => {
  beforeAll(async () => {
    db = new PGlite();
    // Supabaseが提供するAuthの最低限の契約だけを再現。RLS/DDLは実migrationを実行する。
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      grant usage on schema auth to anon, authenticated;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
    `);
    await db.query("insert into auth.users(id,email) values ($1, 'admin@example.test')", [ids.admin]);
    const migration = readFileSync(new URL("../../supabase/migrations/202610010001_phase1_auth_stores.sql", import.meta.url), "utf8");
    await db.exec(migration);
    const backfilled = await db.query("select role, is_active, store_id from public.profiles where id=$1", [ids.admin]);
    expect(backfilled.rows).toEqual([{ role: "staff", is_active: false, store_id: null }]);
    await db.query("insert into public.stores(id,code,name) values ($1,'A','店舗A'), ($2,'B','店舗B')", [ids.storeA, ids.storeB]);
    for (const [key, id] of Object.entries(ids).filter(([key]) => !key.startsWith("store") && key !== "admin")) {
      await db.query("insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)", [id, `${key}@example.test`, { role: "admin", store_id: ids.storeA, is_active: true }]);
    }
  });
  beforeEach(async () => {
    await db.exec("reset role");
    await db.query("update public.stores set is_active=true");
    await db.query("update public.profiles set role='admin',is_active=true,store_id=null where id=$1", [ids.admin]);
    await db.query("update public.profiles set role='staff',is_active=true,store_id=$1 where id=$2", [ids.storeA, ids.a]);
    await db.query("update public.profiles set role='staff',is_active=true,store_id=$1 where id=$2", [ids.storeB, ids.b]);
    await db.query("update public.profiles set is_active=false,store_id=$1 where id=$2", [ids.storeA, ids.inactive]);
  });
  afterEach(async () => { await db.exec("reset role"); });
  afterAll(async () => { await db?.close(); });

  it("metadataにadminを指定しても新規ユーザーは無効staff・所属なし", async () => {
    const result = await db.query("select role,is_active,store_id,name from public.profiles where id=$1", [ids.newUser]);
    expect(result.rows).toEqual([{ role: "staff", is_active: false, store_id: null, name: "" }]);
  });
  it("匿名の店舗・profile直接アクセスを拒否", async () => {
    await asUser(null, "anon");
    await expect(db.query("select * from public.stores")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.profiles")).rejects.toThrow(/permission denied/);
  });
  it("authenticatedでもJWTなしなら0件", async () => {
    await asUser(null);
    expect((await db.query("select id from public.stores")).rows).toEqual([]);
    expect((await db.query("select id from public.profiles")).rows).toEqual([]);
  });
  it("staffは所属店舗と自分のprofileだけ閲覧", async () => {
    await asUser(ids.a);
    expect((await db.query("select id from public.stores")).rows).toEqual([{ id: ids.storeA }]);
    expect((await db.query("select id from public.profiles")).rows).toEqual([{ id: ids.a }]);
  });
  it("他店舗IDを直接指定してもstaffは取得できない", async () => {
    await asUser(ids.a);
    expect((await db.query("select id from public.stores where id=$1", [ids.storeB])).rows).toEqual([]);
    expect((await db.query("select id from public.profiles where id=$1", [ids.b])).rows).toEqual([]);
  });
  it("無効ユーザーは自分の状態以外読めない", async () => {
    await asUser(ids.inactive);
    expect((await db.query("select id from public.stores")).rows).toEqual([]);
    expect((await db.query("select id from public.profiles")).rows).toEqual([{ id: ids.inactive }]);
  });
  it("無効店舗所属のstaffには店舗アクセスを許可しない", async () => {
    await db.query("update public.stores set is_active=false where id=$1", [ids.storeA]);
    await asUser(ids.a);
    expect((await db.query("select id from public.stores")).rows).toEqual([]);
    expect((await db.query("select private.can_access_store($1) allowed", [ids.storeA])).rows).toEqual([{ allowed: false }]);
  });
  it("staffによる自己昇格・所属変更・他人の変更は0件", async () => {
    await asUser(ids.a);
    expect((await db.query("update public.profiles set role='admin' where id=$1 returning id", [ids.a])).rows).toEqual([]);
    expect((await db.query("update public.profiles set store_id=$1 where id=$2 returning id", [ids.storeB, ids.a])).rows).toEqual([]);
    expect((await db.query("update public.profiles set name='変更' where id=$1 returning id", [ids.b])).rows).toEqual([]);
  });
  it("staffは自店であっても店舗マスタを更新できない", async () => {
    await asUser(ids.a);
    expect((await db.query("update public.stores set name='変更' where id=$1 returning id", [ids.storeA])).rows).toEqual([]);
  });
  it("staffの店舗新規作成をRLSが拒否", async () => {
    await asUser(ids.a);
    await expect(db.query("insert into public.stores(code,name) values ('X','店舗X')")).rejects.toThrow(/row-level security/);
  });
  it("profileの直接作成、メール書換え、店舗削除を権限で拒否", async () => {
    await asUser(ids.admin);
    await expect(db.query("insert into public.profiles(id,email) values (gen_random_uuid(),'x@example.test')")).rejects.toThrow(/permission denied/);
    await expect(db.query("update public.profiles set email='x@example.test'")).rejects.toThrow(/permission denied/);
    await expect(db.query("delete from public.stores")).rejects.toThrow(/permission denied/);
  });
  it("有効adminは全店舗・全利用者を取得し、店舗・所属を編集できる", async () => {
    await asUser(ids.admin);
    expect((await db.query("select id from public.stores")).rows).toHaveLength(2);
    expect((await db.query("select id from public.profiles")).rows).toHaveLength(5);
    expect((await db.query("update public.stores set name='店舗B' where id=$1 returning id", [ids.storeB])).rows).toHaveLength(1);
    expect((await db.query("update public.profiles set store_id=$1 where id=$2 returning id", [ids.storeB, ids.a])).rows).toHaveLength(1);
  });
  it("有効adminは店舗作成できる", async () => {
    await asUser(ids.admin);
    expect((await db.query("insert into public.stores(code,name) values ('C','店舗C') returning code")).rows).toEqual([{ code: "C" }]);
    await db.exec("reset role");
    await db.query("delete from public.stores where code='C'");
  });
  it("admin無効化後は古いJWTがあっても権限を失う", async () => {
    await db.query("update public.profiles set is_active=false where id=$1", [ids.admin]);
    await asUser(ids.admin);
    expect((await db.query("select id from public.stores")).rows).toEqual([]);
    expect((await db.query("select id from public.profiles")).rows).toEqual([{ id: ids.admin }]);
  });
  it("店舗のない有効staffと不正なroleをDB制約で拒否", async () => {
    await expect(db.query("update public.profiles set is_active=true,store_id=null where id=$1", [ids.newUser])).rejects.toThrow(/active_staff_has_store/);
    await expect(db.query("update public.profiles set role='owner' where id=$1", [ids.newUser])).rejects.toThrow(/check constraint/);
  });
  it("Authメール変更を同期し、roleのメタデータ変更は無視", async () => {
    await db.query("update auth.users set email='changed@example.test',raw_user_meta_data=$1 where id=$2", [{ role: "admin" }, ids.newUser]);
    expect((await db.query("select email,role from public.profiles where id=$1", [ids.newUser])).rows).toEqual([{ email: "changed@example.test", role: "staff" }]);
  });
});

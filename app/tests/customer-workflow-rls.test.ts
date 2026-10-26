import { z } from "zod";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from "vitest";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db: PGlite;
let legacyDefinitions: unknown[];
let legacyCsvDefinition: unknown;
const legacyDefinitionSql =
  "select proname,pg_get_functiondef(oid) definition,proacl::text acl from pg_proc where oid in ('private.customer_directory(text,text,text,uuid,date,date,uuid,integer)'::regprocedure,'public.get_customer_directory(text,text,text,uuid,date,date,uuid,integer)'::regprocedure) order by proname";
async function actor(n: number, role = "authenticated") {
  await db.exec(`reset role;set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id(n),
  ]);
}
async function denied(sql: string, params: unknown[] = [], code = "42501") {
  await db.exec("savepoint rejected");
  await expect(db.query(sql, params)).rejects.toMatchObject({ code });
  await db.exec("rollback to savepoint rejected");
}
const row = (name = "NEW", store = 10) => ({
  store_id: id(store),
  name,
  name_kana: "",
  phone: "",
  membership_card_number: "",
  approved_duplicate_ids: [],
});
const run = (rows: unknown, request = 90) =>
  db.query<{ n: number }>("select insert_customer_csv($1,$2) n", [
    id(request),
    JSON.stringify(rows),
  ]);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;grant usage on schema auth to anon,authenticated,service_role;create table auth.users(id uuid primary key,email text);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema storage;grant usage on schema storage to anon,authenticated,service_role;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to anon,authenticated;`,
  );
  const root = new URL("../../supabase/migrations/", import.meta.url);
  for (const f of readdirSync(root)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (f === "20261026062254_customer_review_workflow.sql")
      legacyDefinitions = (await db.query(legacyDefinitionSql)).rows;
    if (f === "20261026092625_customer_csv_full_fields.sql")
      legacyCsvDefinition = (
        await db.query(
          "select pg_get_functiondef('public.insert_customer_csv(uuid,jsonb)'::regprocedure) definition",
        )
      ).rows;
    await db.exec(readFileSync(new URL(f, root), "utf8"));
  }
  await db.exec(
    "grant usage on schema public,private to service_role;grant all on all tables in schema public,storage to service_role",
  );
  await db.query(
    "insert into stores(id,code,name)values($1,'A','FAKE A'),($2,'B','FAKE B')",
    [id(10), id(11)],
  );
  for (const n of [1, 2, 3, 4])
    await db.query("insert into auth.users values($1,'fake@example.test')", [
      id(n),
    ]);
  await db.query(
    "update profiles set role='admin',is_active=true where id=$1",
    [id(1)],
  );
  await db.query("update profiles set is_active=true,store_id=$1 where id=$2", [
    id(10),
    id(2),
  ]);

  for (const [n, s] of [
    [20, 10],
    [21, 11],
  ]) {
    await db.query(
      "insert into customers(id,store_id,name,birth_date,address,identification_number,memo,gender)values($1,$2,$3,'1990-01-01','FAKE ADDRESS','FAKE-ID','FAKE MEMO','female')",
      [id(n), id(s), "FAKE" + n],
    );
    await db.query(
      "insert into customer_documents(id,customer_id,document_type,file_name,file_url,content_type)values($1,$2,'drivers_license','fake.png',$3,'image/png')",
      [id(n + 20), id(n), "fake/" + n],
    );
    await db.query(
      "insert into purchase_transactions(id,customer_id,store_id,visit_datetime,transaction_status)values($1,$2,$3,now(),'completed')",
      [id(n + 40), id(n), id(s)],
    );
  }
}, 30000);
beforeEach(async () => {
  await db.exec("reset role;begin");
  await actor(2);
});
afterEach(async () => {
  await db.exec("rollback;reset role");
});
afterAll(async () => {
  await db.close();
});
it("all-store detail is explicit business projection; base tables remain scoped", async () => {
  const r = await db.query<{
    r: {
      customer: { address: string; memo: string };
      transactions: { id: string }[];
      customers: Record<string, unknown>[];
      path: string;
    };
  }>("select get_customer_detail($1) r", [id(21)]);
  expect(r.rows[0].r.customer.address).toBe("FAKE ADDRESS");
  expect(r.rows[0].r.customer.memo).toBe("FAKE MEMO");
  expect(r.rows[0].r.transactions[0].id).toBe(id(61));
  expect(JSON.stringify(r.rows)).not.toContain("file_url");
  expect(JSON.stringify(r.rows)).not.toContain("upload_path");
  expect((await db.query("select * from customers")).rows).toHaveLength(1);
  expect(
    (await db.query("select * from purchase_transactions")).rows,
  ).toHaveLength(1);
  expect(
    (await db.query("select * from customer_documents")).rows,
  ).toHaveLength(1);
  const d = await db.query<{
    r: {
      customer: { address: string; memo: string };
      transactions: { id: string }[];
      customers: Record<string, unknown>[];
      path: string;
    };
  }>("select get_customer_directory_v2() r");
  expect(d.rows[0].r.customers).toHaveLength(2);
  expect(d.rows[0].r.customers[0]).toHaveProperty("age");
  expect(d.rows[0].r.customers[0]).not.toHaveProperty("birth_date");
});
it("rejects anonymous, inactive, unassigned and freshly deactivated sessions", async () => {
  await actor(3);
  await denied("select get_customer_detail($1)", [id(21)]);
  await actor(4);
  await denied("select get_customer_detail($1)", [id(21)]);
  await actor(2, "anon");
  await denied("select get_customer_detail($1)", [id(21)]);
  await db.exec("reset role");
  await db.query("update profiles set is_active=false where id=$1", [id(2)]);
  await actor(2);
  await denied("select get_customer_detail($1)", [id(21)]);
});
it("staff cannot update/upsert existing customers or mutate document metadata", async () => {
  expect(
    (
      await db.query(
        "update customers set memo='CHANGED' where id=$1 returning id",
        [id(20)],
      )
    ).rows,
  ).toHaveLength(0);
  await denied(
    "insert into customers(id,store_id,name)values($1,$2,'OVERWRITE') on conflict(id) do update set name=excluded.name",
    [id(20), id(10)],
  );
  expect(
    (
      await db.query(
        "update customer_documents set file_name='changed' where id=$1 returning id",
        [id(40)],
      )
    ).rows,
  ).toHaveLength(0);
  await denied(
    "insert into customer_documents(customer_id,document_type,file_name)values($1,'other','new')",
    [id(20)],
  );
});
it("staff creates own-store customers, not cross-store; admin edits", async () => {
  await db.query(
    "insert into customers(store_id,name,memo,gender)values($1,'NEW','MEMO','other')",
    [id(10)],
  );
  await denied("insert into customers(store_id,name)values($1,'OTHER')", [
    id(11),
  ]);
  await actor(1);
  expect(
    (
      await db.query(
        "update customers set memo='ADMIN' where id=$1 returning memo",
        [id(21)],
      )
    ).rows[0],
  ).toEqual({ memo: "ADMIN" });
});
it("service media resolves ownership and rechecks actor; upload handlers deny staff", async () => {
  await denied("select customer_media_source($1,$2,$3)", [
    id(2),
    id(21),
    id(41),
  ]);
  await actor(2, "service_role");
  expect(
    (
      await db.query<{
        r: {
          customer: { address: string; memo: string };
          transactions: { id: string }[];
          customers: Record<string, unknown>[];
          path: string;
        };
      }>("select customer_media_source($1,$2,$3) r", [id(2), id(21), id(41)])
    ).rows[0].r.path,
  ).toBe("fake/21");
  expect(
    (
      await db.query<{
        r: {
          customer: { address: string; memo: string };
          transactions: { id: string }[];
          customers: Record<string, unknown>[];
          path: string;
        };
      }>("select customer_media_source($1,$2,$3) r", [id(2), id(20), id(41)])
    ).rows[0].r,
  ).toBeNull();
  await denied("select customer_media_source($1,$2,$3)", [
    id(3),
    id(21),
    id(41),
  ]);
  await denied(
    "select prepare_document_upload($1,'customer_document',$2,'image/png',10)",
    [id(2), id(40)],
  );
  await denied("select complete_document_upload($1,'customer_document',$2)", [
    id(2),
    id(40),
  ]);
});
it("atomic CSV insert is idempotent and cannot update or inject extra fields", async () => {
  expect((await run([row()])).rows[0].n).toBe(1);
  expect((await run([row()])).rows[0].n).toBe(1);
  expect(
    (await db.query("select * from customers where name='NEW'")).rows,
  ).toHaveLength(1);
  await denied(
    "select insert_customer_csv($1,$2)",
    [id(90), JSON.stringify([row("CHANGED")])],
    "22023",
  );
  await denied(
    "select insert_customer_csv($1,$2)",
    [id(91), JSON.stringify([{ ...row(), id: id(20) }])],
    "22023",
  );
});
it("one invalid store rolls back whole batch, and newly appearing duplicate requires fresh preview", async () => {
  await denied("select insert_customer_csv($1,$2)", [
    id(90),
    JSON.stringify([row(), row("OTHER", 11)]),
  ]);
  expect(
    (await db.query("select * from customers where name='NEW'")).rows,
  ).toHaveLength(0);
  await denied(
    "select insert_customer_csv($1,$2)",
    [id(90), JSON.stringify([row("FAKE20")])],
    "40001",
  );
  expect(
    (await run([{ ...row("FAKE20"), approved_duplicate_ids: [id(20)] }]))
      .rows[0].n,
  ).toBe(1);
});
it("rejects unbounded/null pagination and empty/oversized batches", async () => {
  for (const p of [null, 0, 10001])
    await denied("select get_customer_detail($1,$2)", [id(20), p], "22023");
  for (const rows of [[], Array(21).fill(row())])
    await denied(
      "select insert_customer_csv($1,$2)",
      [id(90), JSON.stringify(rows)],
      "22023",
    );
});
it("ACL, invoker/definer and fixed search_path are explicit", async () => {
  const r = await db.query<{
    prosecdef: boolean;
    anon: boolean;
    auth: boolean;
  }>(
    "select prosecdef,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') auth from pg_proc where oid='private.customer_detail(uuid,integer,integer)'::regprocedure",
  );
  expect(r.rows[0]).toEqual({ prosecdef: true, anon: false, auth: true });
  expect(
    (
      await db.query<{ prosecdef: boolean }>(
        "select prosecdef from pg_proc where oid='public.get_customer_detail(uuid,integer,integer)'::regprocedure",
      )
    ).rows[0].prosecdef,
  ).toBe(false);
});

it("paginates customer-linked history and documents without overlap or unrelated rows", async () => {
  await db.exec("reset role");
  for (let n = 100; n < 124; n++) {
    await db.query(
      "insert into customer_documents(id,customer_id,document_type,file_name)values($1,$2,'other',$3)",
      [id(n), id(21), `FAKE-${n}`],
    );
    if (n < 112)
      await db.query(
        "insert into purchase_transactions(id,customer_id,store_id,visit_datetime,transaction_status)values($1,$2,$3,now(),'completed')",
        [id(n + 100), id(21), id(11)],
      );
  }
  await actor(2);
  type Page = {
    documents: { id: string }[];
    transactions: { id: string }[];
    document_count: number;
    transaction_count: number;
  };
  const first = (
    await db.query<{ r: Page }>("select get_customer_detail($1,1,1) r", [
      id(21),
    ])
  ).rows[0].r;
  const second = (
    await db.query<{ r: Page }>("select get_customer_detail($1,2,2) r", [
      id(21),
    ])
  ).rows[0].r;
  expect(first.documents).toHaveLength(20);
  expect(second.documents).toHaveLength(5);
  expect(first.transactions).toHaveLength(10);
  expect(second.transactions).toHaveLength(3);
  expect(
    new Set([...first.documents, ...second.documents].map((x) => x.id)).size,
  ).toBe(25);
  expect(
    new Set([...first.transactions, ...second.transactions].map((x) => x.id))
      .size,
  ).toBe(13);
  expect(first.document_count).toBe(25);
  expect(first.transaction_count).toBe(13);
  for (const p of [null, 0, 10001])
    await denied("select get_customer_detail($1,1,$2)", [id(21), p], "22023");
});

it("keeps legacy functions and ACL byte-for-byte and old strict response parser compatible after migration", async () => {
  expect((await db.query(legacyDefinitionSql)).rows).toEqual(legacyDefinitions);
  const customer = z.strictObject({
    id: z.uuid(),
    store_id: z.uuid(),
    name: z.string(),
    name_kana: z.string().nullable(),
    phone: z.string().nullable(),
    membership_card_number: z.string().nullable(),
    created_at: z.string(),
  });
  const legacy = z.strictObject({
    customers: z.array(customer),
    total: z.number(),
    selected: customer.nullable(),
    stores: z.array(z.strictObject({ id: z.uuid(), name: z.string() })),
  });
  const value = (
    await db.query<{ r: unknown }>(
      "select get_customer_directory(p_selected:=$1) r",
      [id(21)],
    )
  ).rows[0].r;
  const parsed = legacy.parse(value);
  expect(parsed.customers).toHaveLength(2);
  expect(parsed.selected?.id).toBe(id(21));
  expect(parsed.selected).not.toHaveProperty("age");
  expect(parsed.selected).not.toHaveProperty("gender");
});
it("versioned directory has exact authenticated-only ACL, fixed path and current-profile gate", async () => {
  const sig = "(text,text,text,uuid,date,date,uuid,integer)";
  for (const [name, definer] of [
    ["private.customer_directory_v2", true],
    ["public.get_customer_directory_v2", false],
  ] as const) {
    const result = await db.query(
      "select prosecdef,proconfig,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') authenticated from pg_proc where oid=$1::regprocedure",
      [name + sig],
    );
    expect(result.rows[0]).toEqual({
      prosecdef: definer,
      proconfig: ['search_path=""'],
      anon: false,
      authenticated: true,
    });
  }
  await actor(3);
  await denied("select get_customer_directory_v2()");
  await actor(4);
  await denied("select get_customer_directory_v2()");
  await actor(2, "anon");
  await denied("select get_customer_directory_v2()");
});

const fullRow = (name = "FULL", store = 10) => ({
  ...row(name, store),
  birth_date: "2000-02-29",
  gender: "unspecified",
  occupation: "DEMO",
  postal_code: "000-0000",
  address: "FAKE ADDRESS",
  dm_allowed: "false",
  identification_type: "運転免許証",
  identification_number: "DEMO-NOT-VALID",
});
const runFull = (rows: unknown, request = 91) =>
  db.query<{ n: number }>("select insert_customer_csv_v2($1,$2) n", [
    id(request),
    JSON.stringify(rows),
  ]);
it("imports all business fields atomically, preserves zeros and replays only identical payload", async () => {
  await actor(2);
  const input = { ...fullRow(), membership_card_number: "000001" };
  expect((await runFull([input])).rows[0].n).toBe(1);
  expect((await runFull([input])).rows[0].n).toBe(1);
  const saved = (
    await db.query(
      "select birth_date::text,gender,occupation,postal_code,address,dm_allowed,identification_type,identification_number,membership_card_number from customers where name='FULL'",
    )
  ).rows[0];
  expect(saved).toMatchObject({
    birth_date: "2000-02-29",
    gender: "unspecified",
    dm_allowed: false,
    membership_card_number: "000001",
    identification_number: "DEMO-NOT-VALID",
  });
  await denied(
    "select insert_customer_csv_v2($1,$2)",
    [id(91), JSON.stringify([{ ...input, address: "CHANGED" }])],
    "22023",
  );
});
it("validates new fields and rejects mixed invalid batches with no partial insertion", async () => {
  await actor(2);
  for (const change of [
    { birth_date: "2000/02/29" },
    { birth_date: "2025-02-29" },
    { gender: "男性" },
    { dm_allowed: "可" },
    { identification_type: "未知" },
    { identification_type: "マイナンバーカード" },
    { id: id(20) },
    { address: "=DEMO" },
  ]) {
    await denied(
      "select insert_customer_csv_v2($1,$2)",
      [
        id(92),
        JSON.stringify([fullRow("FIRST"), { ...fullRow("SECOND"), ...change }]),
      ],
      "22023",
    );
    expect(
      (
        await db.query(
          "select count(*)::int n from customers where name='FIRST'",
        )
      ).rows[0],
    ).toMatchObject({ n: 0 });
  }
});
it("keeps new RPC staff store boundary and inactive/anonymous rejection", async () => {
  await actor(2);
  await denied("select insert_customer_csv_v2($1,$2)", [
    id(92),
    JSON.stringify([fullRow("OTHER", 11)]),
  ]);
  await actor(3);
  await denied("select insert_customer_csv_v2($1,$2)", [
    id(92),
    JSON.stringify([fullRow()]),
  ]);
  await actor(2, "anon");
  await denied("select insert_customer_csv_v2($1,$2)", [
    id(92),
    JSON.stringify([fullRow()]),
  ]);
});
it("enforces identification guard for direct writes without changing unrelated legacy values", async () => {
  await actor(1);
  await denied(
    "insert into customers(store_id,name,identification_type,identification_number) values($1,'REJECT','マイナンバーカード','DEMO-NOT-VALID')",
    [id(10)],
    "22023",
  );
  await db.exec(
    "reset role;alter table customers disable trigger customer_identification_guard",
  );
  await db.query(
    "update customers set identification_type='マイナンバーカード',identification_number='LEGACY-SYNTHETIC' where id=$1",
    [id(20)],
  );
  await db.exec(
    "alter table customers enable trigger customer_identification_guard",
  );
  await actor(1);
  await db.query("update customers set occupation='UNRELATED' where id=$1", [
    id(20),
  ]);
  const result = await db.query<{
    payload: { customer: { identification_number: null } };
  }>("select get_customer_detail($1) payload", [id(20)]);
  expect(result.rows[0].payload.customer.identification_number).toBeNull();
  expect(JSON.stringify(result.rows)).not.toContain("LEGACY-SYNTHETIC");
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select identification_number from customers where id=$1",
        [id(20)],
      )
    ).rows[0],
  ).toMatchObject({ identification_number: "LEGACY-SYNTHETIC" });
  await actor(1);
  await denied(
    "update customers set identification_number='CHANGED' where id=$1",
    [id(20)],
    "22023",
  );
});

it("keeps legacy CSV definition byte-identical and v2 invoker/ACL restricted", async () => {
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select pg_get_functiondef('public.insert_customer_csv(uuid,jsonb)'::regprocedure) definition",
      )
    ).rows,
  ).toEqual(legacyCsvDefinition);
  const result = (
    await db.query(
      "select prosecdef,proconfig,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') authenticated from pg_proc where oid='public.insert_customer_csv_v2(uuid,jsonb)'::regprocedure",
    )
  ).rows[0];
  expect(result).toMatchObject({
    prosecdef: false,
    anon: false,
    authenticated: true,
  });
});

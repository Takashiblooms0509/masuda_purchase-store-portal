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
import { initialReview } from "@/lib/ai/schemas";
import { readingFixture } from "./fixtures/purchase-reading";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1),
  staffA = id(2),
  staffB = id(3),
  inactive = id(4),
  storeA = id(10),
  storeB = id(11),
  customerA = id(20),
  customerB = id(21),
  importA = id(30),
  importB = id(31),
  docA = id(40),
  docB = id(41);
let db: PGlite;
async function asUser(uid: string | null, role = "authenticated") {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    uid ?? "",
  ]);
}
async function service() {
  await asUser(null, "service_role");
}
async function upload(kind = "import", other = false) {
  await service();
  const actor = other ? staffB : staffA,
    target =
      kind === "import" ? (other ? importB : importA) : other ? docB : docA;
  const path = (
    await db.query<{ path: string }>(
      "select public.prepare_document_upload($1,$2,$3,$4,$5) path",
      [actor, kind, target, "image/png", 10],
    )
  ).rows[0].path;
  await db.exec("reset role");
  await db.query(
    "insert into storage.objects(bucket_id,name,metadata)values('portal-source-documents',$1,$2)",
    [path, { size: 10, mimetype: "image/png" }],
  );
  await service();
  await db.query("select public.complete_document_upload($1,$2,$3)", [
    actor,
    kind,
    target,
  ]);
  return path;
}
async function claim(actor = staffA, target = importA) {
  await service();
  return (
    await db.query<{ token: string }>(
      "select public.claim_import_processing($1,$2) token",
      [actor, target],
    )
  ).rows[0].token;
}
async function finish(
  token: string,
  code: string | null = null,
  actor = staffA,
) {
  await service();
  return (
    await db.query<{ done: boolean }>(
      "select public.finish_import_processing($1,$2,$3,$4,$5,$6,$7) done",
      [
        actor,
        importA,
        token,
        code ? null : readingFixture,
        code ? null : initialReview(readingFixture),
        "gpt-4.1",
        code,
      ],
    )
  ).rows[0].done;
}
async function version() {
  return (
    await db.query<{ version: string }>(
      "select updated_at::text version from public.document_imports where id=$1",
      [importA],
    )
  ).rows[0].version;
}
async function reviewed() {
  await upload();
  const token = await claim();
  await finish(token);
}
async function denied(query: () => Promise<unknown>, code: string) {
  await db.exec("savepoint reject");
  await expect(query()).rejects.toMatchObject({ code });
  await db.exec("rollback to savepoint reject");
}
describe("Phase4 actual SQL, Storage RLS and processing controls", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;create schema auth;grant usage on schema auth to anon,authenticated;create table auth.users(id uuid primary key,email text);create function auth.uid()returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      create schema storage;grant usage on schema storage to anon,authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to anon,authenticated;create policy fixture_legacy_wide_policy on storage.objects for all using(true) with check(true);`);
    for (const file of [
      "202610010001_phase1_auth_stores.sql",
      "202610010002_phase2_business.sql",
      "202610010003_phase3_reporting.sql",
      "202610010004_phase4_image_reading.sql",
    ])
      await db.exec(
        readFileSync(
          new URL(`../../supabase/migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
    await db.query(
      "insert into public.stores(id,code,name)values($1,'A','検証店舗A'),($2,'B','検証店舗B')",
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
      "insert into public.customers(id,store_id,name)values($1,$2,'検証顧客A'),($3,$4,'検証顧客B')",
      [customerA, storeA, customerB, storeB],
    );
  });
  beforeEach(async () => {
    await db.exec("reset role;begin;");
    await db.query(
      "insert into public.document_imports(id,store_id,document_type,file_name)values($1,$2,'purchase_document','a.png'),($3,$4,'purchase_document','b.png')",
      [importA, storeA, importB, storeB],
    );
    await db.query(
      "insert into public.customer_documents(id,customer_id,document_type,file_name)values($1,$2,'drivers_license','id-a.png'),($3,$4,'passport','id-b.png')",
      [docA, customerA, docB, customerB],
    );
  });
  afterEach(async () => {
    await db.exec("rollback;reset role;");
  });
  afterAll(async () => {
    await db.close();
  });
  it("creates a private bounded image bucket", async () => {
    expect(
      (
        await db.query(
          "select public,file_size_limit,allowed_mime_types from storage.buckets",
        )
      ).rows,
    ).toEqual([
      {
        public: false,
        file_size_limit: 10485760,
        allowed_mime_types: ["image/jpeg", "image/png"],
      },
    ]);
  });
  it("reserves only a scoped UUID path and finalizes matching Storage metadata", async () => {
    const path = await upload();
    expect(path).toBe(`${storeA}/import/${importA}/source.png`);
    await asUser(staffA);
    expect(
      (
        await db.query(
          "select file_url,file_size,processing_status from public.document_imports where id=$1",
          [importA],
        )
      ).rows,
    ).toEqual([
      { file_url: path, file_size: 10, processing_status: "pending" },
    ]);
  });
  it("refuses missing or mismatched uploaded bytes", async () => {
    await service();
    const path = (
      await db.query<{ path: string }>(
        "select public.prepare_document_upload($1,$2,$3,$4,$5) path",
        [staffA, "import", importA, "image/png", 10],
      )
    ).rows[0].path;
    await denied(
      () =>
        db.query("select public.complete_document_upload($1,$2,$3)", [
          staffA,
          "import",
          importA,
        ]),
      "23514",
    );
    await db.exec("reset role");
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata)values('portal-source-documents',$1,$2)",
      [path, { size: 11, mimetype: "image/jpeg" }],
    );
    await service();
    await denied(
      () =>
        db.query("select public.complete_document_upload($1,$2,$3)", [
          staffA,
          "import",
          importA,
        ]),
      "23514",
    );
  });
  it("rejects oversize and false upload kinds", async () => {
    await service();
    await denied(
      () =>
        db.query("select public.prepare_document_upload($1,$2,$3,$4,$5)", [
          staffA,
          "import",
          importA,
          "image/png",
          10485761,
        ]),
      "23514",
    );
    await denied(
      () =>
        db.query("select public.prepare_document_upload($1,$2,$3,$4,$5)", [
          staffA,
          "wrong",
          importA,
          "image/png",
          10,
        ]),
      "23514",
    );
  });
  it("service RPC still rejects another store, inactive and missing actor", async () => {
    await service();
    for (const actor of [staffB, inactive, null])
      await denied(
        () =>
          db.query("select public.prepare_document_upload($1,$2,$3,$4,$5)", [
            actor,
            "import",
            importA,
            "image/png",
            10,
          ]),
        "42501",
      );
  });
  it("authenticated users including admin cannot call trusted upload/AI RPCs", async () => {
    for (const actor of [staffA, admin]) {
      await asUser(actor);
      await denied(
        () =>
          db.query("select public.prepare_document_upload($1,$2,$3,$4,$5)", [
            actor,
            "import",
            importA,
            "image/png",
            10,
          ]),
        "42501",
      );
      await denied(
        () =>
          db.query("select public.claim_import_processing($1,$2)", [
            actor,
            importA,
          ]),
        "42501",
      );
    }
  });
  it("normal clients cannot forge image or processing columns", async () => {
    await asUser(staffA);
    for (const assignment of [
      "file_url='external-url'",
      "upload_path='external-path'",
      "processing_status='completed'",
      "ai_result='{}'::jsonb",
      "reviewed_result='{}'::jsonb",
    ])
      await denied(
        () =>
          db.exec(
            `update public.document_imports set ${assignment} where id='${importA}'`,
          ),
        "42501",
      );
  });
  it("reads only own finalized images despite a broad legacy Storage policy", async () => {
    const a = await upload(),
      b = await upload("import", true),
      c = await upload("customer_document");
    await asUser(staffA);
    expect(
      (
        await db.query<{ name: string }>(
          "select name from storage.objects order by name",
        )
      ).rows
        .map((row) => row.name)
        .sort(),
    ).toEqual([a, c].sort());
    await asUser(admin);
    expect(
      (await db.query("select name from storage.objects")).rows,
    ).toHaveLength(3);
    await asUser(null, "anon");
    expect((await db.query("select name from storage.objects")).rows).toEqual(
      [],
    );
    expect(b).not.toBe(a);
  });
  it("hides unfinalized objects even from an active admin", async () => {
    await service();
    const path = (
      await db.query<{ path: string }>(
        "select public.prepare_document_upload($1,$2,$3,$4,$5) path",
        [staffA, "import", importA, "image/png", 10],
      )
    ).rows[0].path;
    await db.exec("reset role");
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata)values('portal-source-documents',$1,$2)",
      [path, { size: 10, mimetype: "image/png" }],
    );
    await asUser(admin);
    expect((await db.query("select name from storage.objects")).rows).toEqual(
      [],
    );
  });
  it("blocks client insert/update/delete and original overwrite", async () => {
    const path = await upload();
    await asUser(staffA);
    await denied(
      () =>
        db.query(
          "insert into storage.objects(bucket_id,name)values('portal-source-documents','forged')",
        ),
      "42501",
    );
    await denied(
      () =>
        db.query("update storage.objects set metadata=$1 where name=$2", [
          {},
          path,
        ]),
      "42501",
    );
    expect(
      (
        await db.query(
          "delete from storage.objects where name=$1 returning name",
          [path],
        )
      ).rows,
    ).toEqual([]);
    await service();
    await denied(
      () =>
        db.query("select public.prepare_document_upload($1,$2,$3,$4,$5)", [
          staffA,
          "import",
          importA,
          "image/png",
          10,
        ]),
      "23514",
    );
  });
  it("blocks image reads after store or user deactivation", async () => {
    await upload();
    await db.exec("reset role");
    await db.query("update public.stores set is_active=false where id=$1", [
      storeA,
    ]);
    await asUser(staffA);
    expect((await db.query("select name from storage.objects")).rows).toEqual(
      [],
    );
    await asUser(admin);
    expect(
      (await db.query("select name from storage.objects")).rows,
    ).toHaveLength(1);
    await asUser(inactive);
    expect((await db.query("select name from storage.objects")).rows).toEqual(
      [],
    );
  });
  it("requires verified purchase images and refuses customer ID reading", async () => {
    await service();
    await denied(
      () =>
        db.query("select public.claim_import_processing($1,$2)", [
          staffA,
          importA,
        ]),
      "23514",
    );
    await upload();
    await db.exec("reset role");
    await db.query(
      "update public.document_imports set document_type=$1 where id=$2",
      ["membership_card", importB],
    );
    await upload("import", true);
    await service();
    await denied(
      () =>
        db.query("select public.claim_import_processing($1,$2)", [
          staffB,
          importB,
        ]),
      "23514",
    );
  });
  it("claims once and allows retry only after a failed attempt", async () => {
    await upload();
    const token = await claim();
    await denied(
      () =>
        db.query("select public.claim_import_processing($1,$2)", [
          staffA,
          importA,
        ]),
      "55P03",
    );
    expect(await finish(token, "rate_limit")).toBe(true);
    const second = await claim();
    expect(second).not.toBe(token);
    await asUser(staffA);
    expect(
      (
        await db.query(
          "select retry_count,processing_status from public.document_imports where id=$1",
          [importA],
        )
      ).rows,
    ).toEqual([{ retry_count: 1, processing_status: "processing" }]);
  });
  it("expired claim can be replaced and a stale result cannot overwrite the new job", async () => {
    await upload();
    const old = await claim();
    await db.exec("reset role");
    await db.query(
      "update public.document_imports set processing_started_at=now()-interval '3 minutes' where id=$1",
      [importA],
    );
    const fresh = await claim();
    expect(await finish(old)).toBe(false);
    expect(await finish(fresh)).toBe(true);
  });
  it("maps unknown external failures to a fixed message", async () => {
    await upload();
    const token = await claim();
    await finish(token, "external sensitive body");
    await asUser(staffA);
    expect(
      (
        await db.query<{ error_message: string }>(
          "select error_message from public.document_imports where id=$1",
          [importA],
        )
      ).rows[0].error_message,
    ).toBe(
      "読取サービスに接続できませんでした。時間をおいて再処理してください。",
    );
  });
  it("keeps AI and human drafts separate and never creates business records", async () => {
    await reviewed();
    await asUser(staffA);
    const draft = initialReview(readingFixture);
    draft.customer.name = "人が修正";
    draft.items[0].item_name = "確定商品";
    await db.query("select public.save_import_review($1,$2,$3)", [
      importA,
      draft,
      await version(),
    ]);
    const saved = (
      await db.query<{
        ai_result: typeof readingFixture;
        reviewed_result: typeof draft;
      }>(
        "select ai_result,reviewed_result from public.document_imports where id=$1",
        [importA],
      )
    ).rows[0];
    expect(saved.ai_result.customer.name).toBe("検証顧客");
    expect(saved.reviewed_result.customer.name).toBe("人が修正");
    expect(
      (await db.query("select * from public.purchase_transactions")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.purchase_items")).rows,
    ).toHaveLength(0);
  });
  it("rejects another store review and an old edit version", async () => {
    await reviewed();
    await asUser(staffB);
    await denied(
      () =>
        db.query("select public.save_import_review($1,$2,$3)", [
          importA,
          initialReview(readingFixture),
          "2020-01-01",
        ]),
      "42501",
    );
    await asUser(staffA);
    await denied(
      () =>
        db.query("select public.save_import_review($1,$2,$3)", [
          importA,
          initialReview(readingFixture),
          "2020-01-01",
        ]),
      "40001",
    );
  });
  it("protects raw names/source indexes against edited JSON", async () => {
    await reviewed();
    await asUser(staffA);
    for (const draft of [
      {
        ...initialReview(readingFixture),
        items: [
          {
            ...initialReview(readingFixture).items[0],
            raw_item_name: "改ざん",
          },
        ],
      },
      {
        ...initialReview(readingFixture),
        items: [
          ...initialReview(readingFixture).items,
          ...initialReview(readingFixture).items,
        ],
      },
      {
        ...initialReview(readingFixture),
        items: [
          { ...initialReview(readingFixture).items[0], source_line_index: 99 },
        ],
      },
    ])
      await denied(
        async () =>
          db.query("select public.save_import_review($1,$2,$3)", [
            importA,
            draft,
            await version(),
          ]),
        "23514",
      );
  });
  it("permits explicit row removal/manual addition without changing the raw result", async () => {
    await reviewed();
    await asUser(staffA);
    const draft = initialReview(readingFixture);
    draft.items = [
      {
        source_line_index: null,
        raw_item_name: null,
        item_name: "手動追加",
        denomination_or_weight: null,
        quantity: 1,
        purchase_amount: 10,
        notes: null,
      },
    ];
    await db.query("select public.save_import_review($1,$2,$3)", [
      importA,
      draft,
      await version(),
    ]);
    expect(
      (
        await db.query<{ ai_result: typeof readingFixture }>(
          "select ai_result from public.document_imports where id=$1",
          [importA],
        )
      ).rows[0].ai_result,
    ).toEqual(readingFixture);
  });
  it("cannot finish after the actor is deactivated", async () => {
    await upload();
    const token = await claim();
    await db.exec("reset role");
    await db.query("update public.profiles set is_active=false where id=$1", [
      staffA,
    ]);
    await service();
    await denied(() => finish(token), "42501");
  });
  it("does not read an original already linked to a transaction", async () => {
    await upload();
    await db.exec("reset role");
    await db.query(
      "insert into public.purchase_transactions(store_id,customer_id,visit_datetime,transaction_status,source_document_id)values($1,$2,now(),'completed',$3)",
      [storeA, customerA, importA],
    );
    await service();
    await denied(
      () =>
        db.query("select public.claim_import_processing($1,$2)", [
          staffA,
          importA,
        ]),
      "23514",
    );
  });
});

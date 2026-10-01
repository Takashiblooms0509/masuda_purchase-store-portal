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
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1),
  staffA = id(2),
  staffB = id(3),
  inactive = id(4),
  storeA = id(10),
  storeB = id(11);
const customerA = id(20),
  customerB = id(21),
  documentA = id(30),
  documentB = id(31),
  importA = id(40),
  importB = id(41),
  transactionA = id(50),
  transactionB = id(51),
  itemA = id(60),
  itemB = id(61),
  category = id(70);
let db: PGlite;
async function asUser(user: string | null, role = "authenticated") {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user ?? "",
  ]);
}
function transaction(overrides: Record<string, unknown> = {}) {
  return {
    store_id: storeA,
    customer_id: customerA,
    document_number: "TEST",
    visit_datetime: "2026-10-01T10:00:00+09:00",
    purchase_staff_name: null,
    payment_staff_name: null,
    transaction_status: "completed",
    visit_source: null,
    visit_source_detail: null,
    purchase_item_count: 1,
    purchase_total: 100,
    source_document_id: null,
    notes: null,
    ...overrides,
  };
}
function item(overrides: Record<string, unknown> = {}) {
  return {
    id: null,
    product_category_id: category,
    item_name: "検証商品",
    denomination_or_weight: null,
    quantity: 1,
    purchase_amount: 100,
    category_reviewed: true,
    notes: null,
    ...overrides,
  };
}
async function save(
  transactionId: string | null,
  header: Record<string, unknown>,
  items: unknown,
) {
  return db.query<{ id: string }>(
    "select public.save_purchase_transaction($1,$2,$3) id",
    [transactionId, header, items],
  );
}

describe("Phase2 business tables / actual PostgreSQL RLS", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;grant usage on schema auth to anon,authenticated;
      create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;`);
    for (const migration of [
      "202610010001_phase1_auth_stores.sql",
      "202610010002_phase2_business.sql",
    ])
      await db.exec(
        readFileSync(
          new URL(`../../supabase/migrations/${migration}`, import.meta.url),
          "utf8",
        ),
      );
    await db.query(
      "insert into public.stores(id,code,name)values($1,'A','店舗A'),($2,'B','店舗B')",
      [storeA, storeB],
    );
    for (const uid of [admin, staffA, staffB, inactive])
      await db.query("insert into auth.users values($1,'test@example.test')", [
        uid,
      ]);
  });
  beforeEach(async () => {
    await db.exec("reset role");
    await db.exec(
      "truncate public.purchase_items,public.purchase_transactions,public.customer_documents,public.customers,public.document_imports,public.product_categories cascade",
    );
    await db.exec("update public.stores set is_active=true");
    await db.query(
      "update public.profiles set role='admin',is_active=true where id=$1",
      [admin],
    );
    await db.query(
      "update public.profiles set role='staff',store_id=$1,is_active=true where id=$2",
      [storeA, staffA],
    );
    await db.query(
      "update public.profiles set role='staff',store_id=$1,is_active=true where id=$2",
      [storeB, staffB],
    );
    await db.query(
      "update public.profiles set is_active=false,store_id=$1 where id=$2",
      [storeA, inactive],
    );
    await db.query(
      "insert into public.customers(id,store_id,name,phone,membership_card_number,birth_date)values($1,$2,'山田 太郎','０９０-１２３４-５６７８','M001','1990-01-01'),($3,$4,'別店舗顧客','09012345678','M001','1990-01-01')",
      [customerA, storeA, customerB, storeB],
    );
    await db.query(
      "insert into public.customer_documents(id,customer_id,document_type,file_name)values($1,$2,'drivers_license','a.jpg'),($3,$4,'passport','b.png')",
      [documentA, customerA, documentB, customerB],
    );
    await db.query(
      "insert into public.product_categories(id,category_name)values($1,'検証カテゴリ')",
      [category],
    );
    await db.query(
      "insert into public.document_imports(id,store_id,document_type,file_name)values($1,$2,'purchase_document','a.jpg'),($3,$4,'purchase_document','b.jpg')",
      [importA, storeA, importB, storeB],
    );
    await db.query(
      "insert into public.purchase_transactions(id,store_id,customer_id,visit_datetime,transaction_status,purchase_total)values($1,$2,$3,'2026-09-30T23:00:00+09:00','completed',100),($4,$5,$6,'2026-10-01T10:00:00+09:00','not_completed',null)",
      [transactionA, storeA, customerA, transactionB, storeB, customerB],
    );
    await db.query(
      "insert into public.purchase_items(id,purchase_transaction_id,item_name,raw_item_name,category_confidence)values($1,$2,'商品A','AI原読取A',0.6),($3,$4,'商品B',null,null)",
      [itemA, transactionA, itemB, transactionB],
    );
  });
  afterEach(async () => {
    await db.exec("reset role");
  });
  afterAll(async () => {
    await db?.close();
  });
  const scoped = [
    ["customers", customerA, customerB],
    ["customer_documents", documentA, documentB],
    ["document_imports", importA, importB],
    ["purchase_transactions", transactionA, transactionB],
    ["purchase_items", itemA, itemB],
  ];
  for (const [table, own, other] of scoped) {
    it(`${table}: staffは自店データのみ取得・他店UUID直指定も0件`, async () => {
      await asUser(staffA);
      expect((await db.query(`select id from public.${table}`)).rows).toEqual([
        { id: own },
      ]);
      expect(
        (await db.query(`select id from public.${table} where id=$1`, [other]))
          .rows,
      ).toEqual([]);
    });
    it(`${table}: adminは全店舗を参照`, async () => {
      await asUser(admin);
      expect(
        (await db.query(`select id from public.${table}`)).rows,
      ).toHaveLength(2);
    });
    it(`${table}: 匿名アクセスを拒否`, async () => {
      await asUser(null, "anon");
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow(
        /permission denied/,
      );
    });
  }
  it("無効ユーザー・無効店舗・JWTなしは全業務表0件", async () => {
    for (const user of [inactive, null]) {
      await asUser(user);
      for (const [table] of scoped)
        expect((await db.query(`select id from public.${table}`)).rows).toEqual(
          [],
        );
      expect(
        (await db.query("select id from public.product_categories")).rows,
      ).toEqual([]);
      await db.exec("reset role");
    }
    await db.query("update public.stores set is_active=false where id=$1", [
      storeA,
    ]);
    await asUser(staffA);
    for (const [table] of scoped)
      expect((await db.query(`select id from public.${table}`)).rows).toEqual(
        [],
      );
  });
  it("staffの他店舗新規登録を根テーブル・子テーブルで拒否", async () => {
    await asUser(staffA);
    await expect(
      db.query("insert into public.customers(store_id,name)values($1,'検証')", [
        storeB,
      ]),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into public.document_imports(store_id,document_type,file_name)values($1,'other','x.jpg')",
        [storeB],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into public.customer_documents(customer_id,document_type,file_name)values($1,'other','x.jpg')",
        [customerB],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into public.purchase_items(purchase_transaction_id,item_name)values($1,'検証')",
        [transactionB],
      ),
    ).rejects.toThrow();
    await expect(
      save(null, transaction({ store_id: storeB, customer_id: customerB }), []),
    ).rejects.toThrow();
  });
  it("staffは自店の顧客・書類・原本情報を登録/編集できる", async () => {
    await asUser(staffA);
    expect(
      (
        await db.query(
          "insert into public.customers(store_id,name)values($1,'検証顧客')returning id",
          [storeA],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "update public.customers set occupation='検証' where id=$1 returning id",
          [customerA],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "insert into public.customer_documents(customer_id,document_type,file_name)values($1,'other','x.jpg') returning id",
          [customerA],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "update public.customer_documents set file_name='修正.jpg' where id=$1 returning id",
          [documentA],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "insert into public.document_imports(store_id,document_type,file_name)values($1,'other','x.jpg') returning id",
          [storeA],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "update public.document_imports set file_name='修正.jpg' where id=$1 returning id",
          [importA],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("staffが他店舗の業務行を更新・削除しようとしても0件", async () => {
    await asUser(staffA);
    for (const [table, , other] of scoped) {
      const field =
        table === "customers"
          ? "name"
          : table === "purchase_items"
            ? "item_name"
            : table === "purchase_transactions"
              ? "notes"
              : "file_name";
      expect(
        (
          await db.query(
            `update public.${table} set ${field}='変更' where id=$1 returning id`,
            [other],
          )
        ).rows,
      ).toEqual([]);
    }
    expect(
      (
        await db.query(
          "delete from public.purchase_items where id=$1 returning id",
          [itemB],
        )
      ).rows,
    ).toEqual([]);
  });
  it("adminでも他店舗顧客・原本の取引紐付けは拒否", async () => {
    await asUser(admin);
    await expect(
      save(null, transaction({ customer_id: customerB }), []),
    ).rejects.toThrow(/foreign key/);
    await expect(
      save(null, transaction({ source_document_id: importB }), []),
    ).rejects.toThrow(/Source must/);
    await expect(
      save(
        transactionA,
        transaction({ store_id: storeB, customer_id: customerB }),
        [],
      ),
    ).rejects.toThrow(/Store cannot/);
  });
  it("参照先差替え・AI原読取・画像パス・処理状態・来店日を直接書き換えできない", async () => {
    await asUser(staffA);
    for (const sql of [
      `update public.customers set store_id='${storeB}'`,
      "update public.customers set first_visit_date=current_date",
      `update public.customer_documents set customer_id='${customerB}'`,
      "update public.customer_documents set file_url='https://example.test/public.jpg'",
      "update public.document_imports set processing_status='completed'",
      "update public.purchase_items set raw_item_name='改ざん'",
      `update public.purchase_items set purchase_transaction_id='${transactionB}'`,
    ])
      await expect(db.query(sql)).rejects.toThrow(/permission denied/);
  });
  it("カテゴリはstaff参照のみ・admin作成/編集、階層はDB計算", async () => {
    await asUser(staffA);
    expect(
      (await db.query("select id from public.product_categories")).rows,
    ).toHaveLength(1);
    await expect(
      db.query(
        "insert into public.product_categories(category_name)values('不正')",
      ),
    ).rejects.toThrow(/row-level security/);
    expect(
      (
        await db.query(
          "update public.product_categories set category_name='不正' returning id",
        )
      ).rows,
    ).toEqual([]);
    await asUser(admin);
    const result = await db.query<{ id: string; category_level: number }>(
      "insert into public.product_categories(parent_category_id,category_name)values($1,'子')returning id,category_level",
      [category],
    );
    expect(result.rows[0].category_level).toBe(2);
    await db.query(
      "update public.product_categories set category_level=100 where id=$1",
      [result.rows[0].id],
    );
    expect(
      (
        await db.query(
          "select category_level from public.product_categories where id=$1",
          [result.rows[0].id],
        )
      ).rows,
    ).toEqual([{ category_level: 2 }]);
  });
  it("カテゴリ循環禁止と親変更時の子孫level更新", async () => {
    const child = id(71),
      grandchild = id(72),
      root = id(73);
    await db.query(
      "insert into public.product_categories(id,parent_category_id,category_name)values($1,$2,'子')",
      [child, category],
    );
    await db.query(
      "insert into public.product_categories(id,parent_category_id,category_name)values($1,$2,'孫')",
      [grandchild, child],
    );
    await db.query(
      "insert into public.product_categories(id,category_name)values($1,'別親')",
      [root],
    );
    await asUser(admin);
    await expect(
      db.query(
        "update public.product_categories set parent_category_id=$1 where id=$2",
        [grandchild, category],
      ),
    ).rejects.toThrow(/cycle/);
    await expect(
      db.query(
        "update public.product_categories set parent_category_id=id where id=$1",
        [child],
      ),
    ).rejects.toThrow(/cycle/);
    await db.query(
      "update public.product_categories set parent_category_id=$1 where id=$2",
      [root, category],
    );
    expect(
      (
        await db.query(
          "select category_level from public.product_categories where id=$1",
          [grandchild],
        )
      ).rows,
    ).toEqual([{ category_level: 4 }]);
  });
  it("候補検索は番号・正規化電話・氏名・生年月日それぞれで一致し他店舗を返さない", async () => {
    await asUser(staffA);
    for (const criterion of [
      { membership_card_number: "M001" },
      { phone: "09012345678" },
      { name: "山田太郎" },
      { birth_date: "1990-01-01" },
    ]) {
      expect(
        (
          await db.query(
            "select id from public.find_customer_candidates($1,$2)",
            [storeA, criterion],
          )
        ).rows,
      ).toEqual([{ id: customerA }]);
      expect(
        (
          await db.query(
            "select id from public.find_customer_candidates($1,$2)",
            [storeB, criterion],
          )
        ).rows,
      ).toEqual([]);
    }
    expect(
      (
        await db.query(
          "select id from public.find_customer_candidates($1,$2)",
          [storeA, {}],
        )
      ).rows,
    ).toEqual([]);
  });
  it("取引・複数明細を一括登録し来店日を日本時間で更新", async () => {
    await asUser(staffA);
    const result = await save(
      null,
      transaction({ visit_datetime: "2026-10-02T00:30:00+09:00" }),
      [item(), item({ item_name: "2行目", purchase_amount: 200 })],
    );
    const tid = result.rows[0].id;
    expect(
      (
        await db.query(
          "select display_order,item_name from public.purchase_items where purchase_transaction_id=$1 order by display_order",
          [tid],
        )
      ).rows,
    ).toEqual([
      { display_order: 0, item_name: "検証商品" },
      { display_order: 1, item_name: "2行目" },
    ]);
    expect(
      (
        await db.query(
          "select first_visit_date::text,last_visit_date::text from public.customers where id=$1",
          [customerA],
        )
      ).rows,
    ).toEqual([
      { first_visit_date: "2026-09-30", last_visit_date: "2026-10-02" },
    ]);
  });
  it("編集で明細UUID・AI原値を維持し、確認値と行順を更新", async () => {
    await asUser(staffA);
    await save(transactionA, transaction(), [
      item({
        id: itemA,
        item_name: "確定名",
        raw_item_name: "改ざん値",
        category_confidence: 1,
      }),
      item({ item_name: "追加" }),
    ]);
    expect(
      (
        await db.query(
          "select id,raw_item_name,item_name,category_confidence::text from public.purchase_items where id=$1",
          [itemA],
        )
      ).rows,
    ).toEqual([
      {
        id: itemA,
        raw_item_name: "AI原読取A",
        item_name: "確定名",
        category_confidence: "0.6000",
      },
    ]);
    const lines = await db.query<{ id: string }>(
      "select id from public.purchase_items where purchase_transaction_id=$1 order by display_order",
      [transactionA],
    );
    await save(transactionA, transaction(), [item({ id: lines.rows[1].id })]);
    expect(
      (
        await db.query(
          "select id from public.purchase_items where purchase_transaction_id=$1",
          [transactionA],
        )
      ).rows,
    ).toEqual([{ id: lines.rows[1].id }]);
  });
  it("明細不正時は取引と来店日の変更をすべてロールバック", async () => {
    await asUser(staffA);
    await expect(
      save(null, transaction({ visit_datetime: "2026-12-31T10:00:00+09:00" }), [
        item({ purchase_amount: -1 }),
      ]),
    ).rejects.toThrow(/check constraint/);
    expect(
      (await db.query("select id from public.purchase_transactions")).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select last_visit_date::text from public.customers where id=$1",
          [customerA],
        )
      ).rows,
    ).toEqual([{ last_visit_date: "2026-09-30" }]);
    await expect(
      save(
        transactionA,
        transaction({
          document_number: "失敗",
          visit_datetime: "2026-12-31T10:00:00+09:00",
        }),
        [item({ id: itemB })],
      ),
    ).rejects.toThrow(/Item does not belong/);
    expect(
      (
        await db.query(
          "select document_number from public.purchase_transactions where id=$1",
          [transactionA],
        )
      ).rows,
    ).toEqual([{ document_number: null }]);
    expect(
      (
        await db.query(
          "select id from public.purchase_items where purchase_transaction_id=$1",
          [transactionA],
        )
      ).rows,
    ).toEqual([{ id: itemA }]);
  });
  it("RPC経由の他店舗取引編集、NULL明細、不正配列、重複明細UUIDを拒否", async () => {
    await asUser(staffA);
    await expect(save(transactionB, transaction(), [])).rejects.toThrow(
      /not accessible/,
    );
    await expect(save(transactionA, transaction(), null)).rejects.toThrow(
      /Invalid items/,
    );
    await expect(save(transactionA, transaction(), {})).rejects.toThrow(
      /Invalid items/,
    );
    await expect(
      save(transactionA, transaction(), [
        item({ id: itemA }),
        item({ id: itemA }),
      ]),
    ).rejects.toThrow(/Duplicate item/);
  });
  it("同じ原本からの重複取引と計算書以外の紐付けを禁止", async () => {
    await asUser(staffA);
    await save(transactionA, transaction({ source_document_id: importA }), []);
    await expect(
      save(null, transaction({ source_document_id: importA }), []),
    ).rejects.toThrow(/unique constraint/);
    await expect(
      db.query(
        "update public.document_imports set document_type='other' where id=$1",
        [importA],
      ),
    ).rejects.toThrow(/Linked document/);
    await db.exec("reset role");
    await db.query(
      "update public.document_imports set document_type='membership_card' where id=$1",
      [importB],
    );
    await asUser(staffB);
    await expect(
      save(
        transactionB,
        transaction({
          store_id: storeB,
          customer_id: customerB,
          source_document_id: importB,
        }),
        [],
      ),
    ).rejects.toThrow(/Source must/);
  });
  it("顧客差替え時は旧顧客と新顧客の来店日を再集計", async () => {
    const otherCustomer = id(22);
    await db.query(
      "insert into public.customers(id,store_id,name)values($1,$2,'別顧客')",
      [otherCustomer, storeA],
    );
    await asUser(staffA);
    await save(transactionA, transaction({ customer_id: otherCustomer }), []);
    expect(
      (
        await db.query(
          "select first_visit_date,last_visit_date from public.customers where id=$1",
          [customerA],
        )
      ).rows,
    ).toEqual([{ first_visit_date: null, last_visit_date: null }]);
    expect(
      (
        await db.query(
          "select first_visit_date::text from public.customers where id=$1",
          [otherCustomer],
        )
      ).rows,
    ).toEqual([{ first_visit_date: "2026-10-01" }]);
  });
  it("数値NaNが金額・数量としてDBに登録されない", async () => {
    await asUser(staffA);
    await expect(
      save(null, transaction({ purchase_total: "NaN" }), []),
    ).rejects.toThrow(/check constraint/);
    await expect(
      save(null, transaction(), [item({ quantity: "NaN" })]),
    ).rejects.toThrow(/check constraint/);
    expect(
      (await db.query("select id from public.purchase_transactions")).rows,
    ).toHaveLength(1);
  });
  it("ルート業務レコードの物理削除と匿名RPC実行を許可しない", async () => {
    await asUser(admin);
    for (const table of [
      "customers",
      "purchase_transactions",
      "document_imports",
      "customer_documents",
      "product_categories",
    ])
      await expect(db.query(`delete from public.${table}`)).rejects.toThrow(
        /permission denied/,
      );
    await asUser(null, "anon");
    await expect(save(null, transaction(), [])).rejects.toThrow(
      /permission denied/,
    );
  });
});

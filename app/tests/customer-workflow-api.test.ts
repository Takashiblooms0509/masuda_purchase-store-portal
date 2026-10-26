import { beforeEach, describe, it, expect, vi } from "vitest";
const { session, rpc, storage, privileged, apiSession } = vi.hoisted(() => ({
  session: vi.fn(),
  rpc: vi.fn(),
  storage: vi.fn(),
  privileged: vi.fn(),
  apiSession: vi.fn(),
}));
vi.mock("@/lib/business/access", () => ({
  businessSession: session,
  storeAllowed: (s: { stores: { id: string }[] }, id: string) =>
    s.stores.some((x) => x.id === id),
}));
vi.mock("@/lib/documents/access", () => ({ apiSession }));
vi.mock("@/lib/documents/config", () => ({ privilegedClient: privileged }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import {
  confirmCustomerImport,
  previewCustomerImport,
} from "@/app/(portal)/customers/csv-actions";
import { GET } from "@/app/api/customers/[id]/documents/[document]/image/route";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = {
  store_id: id(10),
  name: "架空",
  name_kana: "",
  phone: "",
  membership_card_number: "",
  approved_duplicate_ids: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({
    profile: { id: id(1), role: "staff", store_id: id(10) },
    stores: [{ id: id(10), code: "A", name: "架空店", is_active: true }],
    supabase: { rpc },
  });
  rpc.mockResolvedValue({ data: 1, error: null });
});
function form(rows: unknown) {
  const f = new FormData();
  f.set("confirmed", "on");
  f.set("request", id(90));
  f.set("rows", JSON.stringify(rows));
  return f;
}
describe("customer CSV server boundary", () => {
  it("authenticates even when malformed", async () => {
    session.mockRejectedValue(Error("auth"));
    await expect(
      confirmCustomerImport({ message: "" }, new FormData()),
    ).rejects.toThrow("auth");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects cross-store staff and update/upsert fields before RPC", async () => {
    for (const value of [
      [{ ...row, store_id: id(11) }],
      [{ ...row, id: id(20) }],
      [{ ...row, memo: "not a CSV column" }],
    ])
      expect(
        (await confirmCustomerImport({ message: "" }, form(value))).success,
      ).not.toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("passes bounded insert-only payload and stable request key", async () => {
    expect(
      (await confirmCustomerImport({ message: "" }, form([row]))).success,
    ).toBe(true);
    expect(rpc).toHaveBeenCalledWith("insert_customer_csv", {
      p_request: id(90),
      p_rows: [row],
    });
  });
  it("does not treat unknown network outcome as success", async () => {
    rpc.mockRejectedValue(Error("internal-secret"));
    const r = await confirmCustomerImport({ message: "" }, form([row]));
    expect(r.success).not.toBe(true);
    expect(r.message).toContain("同じ確認内容");
    expect(r.message).not.toContain("secret");
  });
  it("uses Japanese template/store codes and does not return candidate private data", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: id(20),
          name: "候補",
          birth_date: "1990-01-01",
          identification_number: "NEVER",
        },
      ],
      error: null,
    });
    const f = new FormData();
    f.set(
      "file",
      new File(
        [
          "登録店舗コード,氏名,フリガナ,電話番号,リピーターズカード番号\nA,架空,,,",
        ],
        "test.csv",
      ),
    );
    const r = await previewCustomerImport({ message: "" }, f);
    expect(r.rows?.[0].store_id).toBe(id(10));
    expect(r.rows?.[0].candidates).toEqual([{ id: id(20), name: "候補" }]);
    expect(JSON.stringify(r)).not.toContain("NEVER");
  });
});
describe("customer-scoped media", () => {
  const req = new Request(
    "https://example.test/api/customers/x?path=arbitrary",
  );
  const params = { params: Promise.resolve({ id: id(20), document: id(40) }) };
  it("does not obtain privileged client without authentication", async () => {
    apiSession.mockResolvedValue(null);
    expect((await GET(req, params)).status).toBe(401);
    expect(privileged).not.toHaveBeenCalled();
  });
  it("passes session actor and exact customer/document IDs, signs only returned path for 60s", async () => {
    apiSession.mockResolvedValue({ user: { id: id(2) } });
    rpc.mockResolvedValue({
      data: { path: "validated/object", content_type: "image/png" },
      error: null,
    });
    const sign = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://example.test/signed" },
      error: null,
    });
    storage.mockReturnValue({ createSignedUrl: sign });
    privileged.mockReturnValue({ rpc, storage: { from: storage } });
    const r = await GET(req, params);
    expect(r.status).toBe(307);
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    expect(rpc).toHaveBeenCalledWith("customer_media_source", {
      p_actor: id(2),
      p_customer: id(20),
      p_document: id(40),
    });
    expect(sign).toHaveBeenCalledWith("validated/object", 60);
  });
  it("does not sign when ownership resolution returns null", async () => {
    apiSession.mockResolvedValue({ user: { id: id(2) } });
    rpc.mockResolvedValue({ data: null, error: null });
    privileged.mockReturnValue({ rpc, storage: { from: storage } });
    expect((await GET(req, params)).status).toBe(404);
    expect(storage).not.toHaveBeenCalled();
  });
});

it("legacy customer forms do not erase newly added memo or gender when fields are absent", async () => {
  const { customerInput } = await import("@/lib/business/schemas");
  const f = new FormData();
  f.set("name", "架空");
  expect(customerInput(f)).toMatchObject({
    gender: undefined,
    memo: undefined,
  });
  f.set("gender", "");
  f.set("memo", "");
  expect(customerInput(f)).toMatchObject({ gender: null, memo: null });
});

it("shows within-file matching candidates before attempting an atomic insert", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  const f = new FormData();
  f.set(
    "file",
    new File(
      [
        "登録店舗コード,氏名,フリガナ,電話番号,リピーターズカード番号\nA,架空,,000-123,\nA,別人,,000123,",
      ],
      "test.csv",
    ),
  );
  const result = await previewCustomerImport({ message: "" }, f);
  expect(result.message).toContain("同一CSV内の重複候補");
  expect(result.rows).toBeUndefined();
  expect(rpc).not.toHaveBeenCalledWith(
    "insert_customer_csv",
    expect.anything(),
  );
});

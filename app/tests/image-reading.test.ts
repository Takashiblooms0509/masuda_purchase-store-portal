import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { validateImage } from "@/lib/documents/image";
import { readPurchaseImage } from "@/lib/ai/read";
import { aiReadSchema, initialReview, reviewSchema } from "@/lib/ai/schemas";
import { readingFixture } from "./fixtures/purchase-reading";
const config = { key: "fixture-api-key", model: "gpt-4.1" };
const response = (result: unknown = readingFixture) =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(result) }],
        },
      ],
    }),
    { status: 200 },
  );
afterEach(() => vi.unstubAllGlobals());
describe("image validation and strict AI reading", () => {
  it("validates actual PNG and JPEG bytes", async () => {
    for (const format of ["png", "jpeg"] as const) {
      const bytes = await sharp({
        create: { width: 20, height: 30, channels: 3, background: "#fff" },
      })
        [format]()
        .toBuffer();
      expect(
        await validateImage(bytes, `image/${format}`, bytes.length),
      ).toEqual({ width: 20, height: 30 });
    }
  });
  it("rejects false MIME, arbitrary bytes, wrong length, and excessive pixels", async () => {
    const bytes = await sharp({
      create: { width: 20, height: 30, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    await expect(
      validateImage(bytes, "image/jpeg", bytes.length),
    ).rejects.toThrow();
    await expect(
      validateImage(bytes, "image/png", bytes.length + 1),
    ).rejects.toThrow();
    await expect(
      validateImage(Buffer.from("not an image"), "image/png", 12),
    ).rejects.toThrow();
    const huge = await sharp({
      create: { width: 7000, height: 7000, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    await expect(
      validateImage(huge, "image/png", huge.length),
    ).rejects.toThrow();
  });
  it("rejects truncated images even when their headers are readable", async () => {
    const complete = await sharp({
      create: { width: 200, height: 200, channels: 3, background: "#ffaabb" },
    })
      .jpeg()
      .toBuffer();
    const truncated = complete.subarray(0, complete.length - 20);
    expect((await sharp(truncated).metadata()).format).toBe("jpeg");
    await expect(
      validateImage(truncated, "image/jpeg", truncated.length),
    ).rejects.toThrow();
  });
  it("uses server authorization, image input, store:false, and strict JSON Schema", async () => {
    const mock = vi.fn(async () => response());
    vi.stubGlobal("fetch", mock);
    expect(
      await readPurchaseImage(new Uint8Array([1, 2]), "image/png", config),
    ).toEqual(readingFixture);
    const [url, options] = mock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(options.body as string);
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options.headers).toMatchObject({
      Authorization: "Bearer fixture-api-key",
    });
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
    });
    expect(body.text.format.schema.additionalProperties).toBe(false);
    expect(body.input[0].content[1]).toMatchObject({
      type: "input_image",
      image_url: "data:image/png;base64,AQI=",
    });
    expect(body.instructions).toContain("membership_card_numberは必ずnull");
    expect(body.instructions).toContain("単独の「不」");
  });
  it("keeps raw names and source indexes separate from human edits", () => {
    const review = initialReview(readingFixture);
    review.items[0].item_name = "確定商品";
    review.customer.membership_card_number = "手入力番号";
    expect(reviewSchema.safeParse(review).success).toBe(true);
    expect(review.items[0]).toMatchObject({
      source_line_index: 0,
      raw_item_name: "原記載の商品",
      item_name: "確定商品",
    });
    expect(readingFixture.items[0].raw_item_name).toBe("原記載の商品");
  });
  it("requires null card recognition and rejects unknown structural fields", () => {
    expect(
      aiReadSchema.safeParse({
        ...readingFixture,
        customer: {
          ...readingFixture.customer,
          membership_card_number: "自動推測番号",
        },
      }).success,
    ).toBe(false);
    expect(
      aiReadSchema.safeParse({ ...readingFixture, extra: "unexpected" })
        .success,
    ).toBe(false);
  });
  it("rejects malformed, refused and incomplete responses without saving partial data", async () => {
    for (const payload of [
      { status: "incomplete", output: [] },
      {
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "fixture" }],
          },
        ],
      },
      {
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "invalid JSON" }],
          },
        ],
      },
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify(payload))),
      );
      await expect(
        readPurchaseImage(new Uint8Array([1]), "image/png", config),
      ).rejects.toMatchObject({ code: "invalid_result" });
    }
  });
  it("maps configuration, limits and external errors without exposing the body", async () => {
    for (const [status, code] of [
      [401, "configuration"],
      [429, "rate_limit"],
      [500, "connection"],
      [400, "invalid_image"],
    ] as const) {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response("external body with sensitive values", { status }),
        ),
      );
      await expect(
        readPurchaseImage(new Uint8Array([1]), "image/png", config),
      ).rejects.toMatchObject({ code, message: code });
    }
  });
  it("maps network aborts to timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("fixture timeout", "TimeoutError");
      }),
    );
    await expect(
      readPurchaseImage(new Uint8Array([1]), "image/png", config),
    ).rejects.toMatchObject({ code: "timeout" });
  });
});

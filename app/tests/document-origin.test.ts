import { describe, expect, it } from "vitest";
import { sameOrigin } from "@/lib/documents/origin";
describe("authenticated reading API origin", () => {
  it("accepts the public HTTP host even with an internal Next.js URL", () => {
    expect(
      sameOrigin(
        new Request("http://localhost:3000/api/read", {
          headers: {
            host: "portal.example",
            origin: "https://portal.example",
            "x-forwarded-proto": "https",
          },
        }),
      ),
    ).toBe(true);
  });
  it("rejects a missing, malformed, foreign or protocol-mismatched origin", () => {
    for (const origin of [
      "",
      "null",
      "not a URL",
      "https://other.example",
      "http://portal.example",
      "https://portal.example:444",
    ]) {
      expect(
        sameOrigin(
          new Request("http://localhost:3000/api/read", {
            headers: {
              host: "portal.example",
              origin,
              "x-forwarded-proto": "https",
            },
          }),
        ),
      ).toBe(false);
    }
  });
});

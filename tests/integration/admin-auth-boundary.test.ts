import { describe, expect, it, vi } from "vitest";

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    admin: async () => {
      throw new Response("Unauthorized", { status: 401 });
    },
  },
  apiVersion: "2026-07",
}));

describe("unauthenticated Admin route boundary", () => {
  it("rejects Overview before shop data is loaded", async () => {
    const { loader } = await import("../../app/routes/app._index");
    await expect(
      loader({ request: new Request("https://segmentiva.test/app") } as never),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejects Settings loader and action before shop mutations", async () => {
    const { loader, action } = await import("../../app/routes/app.settings");
    await expect(
      loader({
        request: new Request("https://segmentiva.test/app/settings"),
      } as never),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      action({
        request: new Request("https://segmentiva.test/app/settings", {
          method: "POST",
        }),
      } as never),
    ).rejects.toMatchObject({ status: 401 });
  });
});

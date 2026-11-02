import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { fetchJina } from "../core/engines/jina";
import { createDefaultWebDistilleryConfig } from "../config";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("Jina fetch result contract", () => {
  beforeEach(() => vi.resetAllMocks());
  it("Markdown 正文正确归一化且保持真实来源类型", async () => {
    vi.mocked(invoke).mockResolvedValue({
      statusCode: 200,
      html: "# Article\n\n[Source](https://example.com)",
    });
    const result = await fetchJina(
      { url: "https://example.com", cleanMode: true },
      createDefaultWebDistilleryConfig()
    );
    expect(result.title).toBe("Article");
    expect(result.content).toBe("# Article\n\nSource");
    expect(result.domSnapshot).toBeUndefined();
    expect(result.quality).toBeNull();
  });
  it("空正文返回可定位的失败", async () => {
    vi.mocked(invoke).mockResolvedValue({ statusCode: 200, html: "  " });
    await expect(
      fetchJina(
        { url: "https://example.com" },
        createDefaultWebDistilleryConfig()
      )
    ).rejects.toMatchObject({ code: "EMPTY_CONTENT" });
  });
  it("保留限流状态供调用方决策", async () => {
    vi.mocked(invoke).mockResolvedValue({
      statusCode: 429,
      html: "rate limited",
    });
    await expect(
      fetchJina(
        { url: "https://example.com" },
        createDefaultWebDistilleryConfig()
      )
    ).rejects.toMatchObject({ status: 429, retryable: true });
  });
});

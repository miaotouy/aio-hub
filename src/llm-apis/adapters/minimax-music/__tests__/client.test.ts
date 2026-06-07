import { beforeEach, describe, expect, it, vi } from "vitest";
import { MinimaxMusicClient } from "../client";
import { fetchWithTimeout } from "@/llm-apis/common";

vi.mock("@/llm-apis/common", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
    ensureResponseOk: vi.fn(),
  };
});

describe("MinimaxMusicClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the cover preprocess endpoint", async () => {
    (fetchWithTimeout as any).mockResolvedValue({
      json: async () => ({
        cover_feature_id: "feature-123",
        formatted_lyrics: "[Verse]\nHello",
        structure_result: '{"segments":[]}',
        base_resp: { status_code: 0 },
      }),
    });

    const client = new MinimaxMusicClient({
      baseUrl: "https://api.minimaxi.com",
      apiKey: "test-key",
    });

    const response = await client.coverPreprocess({
      model: "music-cover",
      audio_url: "https://example.com/song.mp3",
    });

    expect(response.cover_feature_id).toBe("feature-123");
    const [url, options] = (fetchWithTimeout as any).mock.calls[0];
    expect(url).toBe("https://api.minimaxi.com/v1/music_cover_preprocess");
    expect(JSON.parse(options.body)).toEqual({
      model: "music-cover",
      audio_url: "https://example.com/song.mp3",
    });
  });

  it("passes through music-cover-free for cover preprocess", async () => {
    (fetchWithTimeout as any).mockResolvedValue({
      json: async () => ({
        cover_feature_id: "feature-free",
        base_resp: { status_code: 0 },
      }),
    });

    const client = new MinimaxMusicClient({
      baseUrl: "https://api.minimaxi.com",
      apiKey: "test-key",
    });

    await client.coverPreprocess({
      model: "music-cover-free",
      audio_url: "https://example.com/song.mp3",
    });

    const [, options] = (fetchWithTimeout as any).mock.calls[0];
    expect(JSON.parse(options.body).model).toBe("music-cover-free");
  });

  it("throws MiniMax errors from cover preprocess", async () => {
    (fetchWithTimeout as any).mockResolvedValue({
      json: async () => ({
        base_resp: { status_code: 2013, status_msg: "bad audio" },
      }),
    });

    const client = new MinimaxMusicClient({
      baseUrl: "https://api.minimaxi.com",
      apiKey: "test-key",
    });

    await expect(
      client.coverPreprocess({
        model: "music-cover",
        audio_base64: "abc",
      })
    ).rejects.toThrow("bad audio");
  });
});

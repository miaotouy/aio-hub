// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { describe, expect, it } from "vitest";
import { buildMusicRequest, resolveMode } from "../adapter";

describe("minimax music adapter", () => {
  it("sends only cover_feature_id and lyrics in feature cover mode", () => {
    const request = buildMusicRequest({
      model: "music-cover",
      mode: "cover",
      prompt: "warm pop vocal",
      lyrics: "[Verse]\nHello",
      outputFormat: "url",
      params: {
        cover_reference_mode: "feature",
        cover_feature_id: "feature-123",
        audio_url: "https://example.com/source.mp3",
        audio_base64: "base64-source",
        audio_setting: { sample_rate: 44100, bitrate: 256000, format: "mp3" },
      },
    });

    expect(request.cover_feature_id).toBe("feature-123");
    expect(request.lyrics).toBe("[Verse]\nHello");
    expect(request.audio_url).toBeUndefined();
    expect(request.audio_base64).toBeUndefined();
  });

  it("requires lyrics in feature cover mode", () => {
    expect(() =>
      buildMusicRequest({
        model: "music-cover",
        mode: "cover",
        prompt: "warm pop vocal",
        outputFormat: "url",
        params: {
          cover_reference_mode: "feature",
          cover_feature_id: "feature-123",
          audio_setting: { sample_rate: 44100, bitrate: 256000, format: "mp3" },
        },
      })
    ).toThrow("必须提供歌词");
  });

  it("keeps one-step cover reference parameters mutually exclusive", () => {
    expect(() =>
      buildMusicRequest({
        model: "music-cover",
        mode: "cover",
        prompt: "warm pop vocal",
        lyrics: "[Verse]\nHello",
        outputFormat: "url",
        params: {
          cover_reference_mode: "audio",
          audio_url: "https://example.com/source.mp3",
          cover_feature_id: "feature-123",
          audio_setting: { sample_rate: 44100, bitrate: 256000, format: "mp3" },
        },
      })
    ).toThrow("只能提供一个");
  });

  it("uses the selected model family to resolve MiniMax music mode", () => {
    expect(resolveMode("music-cover", { minimax_music_mode: "song" })).toBe(
      "cover"
    );
    expect(resolveMode("music-2.6", { minimax_music_mode: "cover" })).toBe(
      "song"
    );
    expect(
      resolveMode("music-2.6-free", { minimax_music_mode: "instrumental" })
    ).toBe("instrumental");
  });
});

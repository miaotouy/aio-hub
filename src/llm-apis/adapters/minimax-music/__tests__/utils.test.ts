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
import {
  hexToBase64,
  normalizeMinimaxMusicResponse,
  stripBase64DataUrl,
} from "../utils";

describe("minimax music utils", () => {
  it("decodes hex audio to base64", () => {
    expect(hexToBase64("48656c6c6f")).toBe("SGVsbG8=");
  });

  it("strips base64 data url prefixes", () => {
    expect(stripBase64DataUrl("data:audio/mpeg;base64,SGVsbG8=")).toBe(
      "SGVsbG8="
    );
    expect(stripBase64DataUrl("SGVsbG8=")).toBe("SGVsbG8=");
  });

  it("normalizes url responses into audios", () => {
    const response = normalizeMinimaxMusicResponse(
      {
        data: {
          status: 2,
          audio: "https://example.com/song.mp3",
        },
        extra_info: {
          music_duration: 25364,
        },
        base_resp: {
          status_code: 0,
          status_msg: "success",
        },
      },
      "url",
      "mp3"
    );

    expect(response.audios?.[0]).toEqual({
      url: "https://example.com/song.mp3",
      format: "mp3",
      duration: 25.364,
    });
  });

  it("normalizes hex responses into base64 audios", () => {
    const response = normalizeMinimaxMusicResponse(
      {
        data: {
          status: 2,
          audio: "48656c6c6f",
        },
        base_resp: {
          status_code: 0,
        },
      },
      "hex",
      "mp3"
    );

    expect(response.audios?.[0]?.b64_json).toBe("SGVsbG8=");
  });
});

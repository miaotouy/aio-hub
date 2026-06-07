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

import { describe, expect, it } from "vitest";
import { cleanLlmOutput } from "../utils/text";

describe("cleanLlmOutput", () => {
  it.each([
    "以下是针对您提供的 5 张聊天记录截图的详细视觉转写与分析。",
    "**以下是图片的转写结果：**",
    "【以下是音频的转录内容。】",
    "好的，下面为您提供视频的转写结果：",
  ])("removes a transcription introduction: %s", (introduction) => {
    expect(cleanLlmOutput(introduction + "\n\n张三：下午三点开会。")).toBe(
      "张三：下午三点开会。"
    );
  });

  it("checks the third line while preserving preceding headings", () => {
    expect(
      cleanLlmOutput(
        "# 聊天记录\n\n以下是截图的详细转写。\n张三：下午三点开会。"
      )
    ).toBe("# 聊天记录\n\n张三：下午三点开会。");
  });

  it("keeps matching content beyond the original first three lines", () => {
    const body = "张三：下午三点开会。\n李四：收到。\n以下是截图的详细转写。";
    expect(cleanLlmOutput("以下是图片转写。\n" + body)).toBe(body);
  });

  it.each([
    "以下是聊天记录截图的详细分析。\n张三：下午三点开会。",
    "转写结果\n张三：下午三点开会。",
    "张三：以下是截图的转写结果。",
    "> 以下是截图的转写结果。",
    "“以下是截图的转写结果。”",
  ])(
    "preserves content without an unquoted transcription introduction: %s",
    (text) => {
      expect(cleanLlmOutput(text)).toBe(text);
    }
  );

  it("cleans the response introduction after removing reasoning", () => {
    expect(
      cleanLlmOutput(
        "<think>分析图片</think>\n**Response:**\n以下是图片的转写结果。\n张三：下午三点开会。"
      )
    ).toBe("张三：下午三点开会。");
  });

  it("preserves CRLF formatting in the remaining body", () => {
    expect(
      cleanLlmOutput("以下是音频的转录。\r\n\r\n第一句。\r\n第二句。")
    ).toBe("第一句。\r\n第二句。");
  });
});

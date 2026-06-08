import { describe, expect, it } from "vitest";
import { parseDanmaku } from "../danmakuParser";

describe("danmakuParser", () => {
  it("parses Bilibili JSON DanmakuElem arrays sorted by progress", () => {
    const result = parseDanmaku(
      JSON.stringify([
        {
          id: 2,
          idStr: "row-2",
          progress: 2000,
          mode: 5,
          fontsize: 25,
          color: 255,
          midHash: "u2",
          content: "顶部",
          ctime: 100,
          weight: 0,
          action: "",
          pool: 0,
          attr: 0,
        },
        {
          id: 1,
          idStr: "row-1",
          progress: 1000,
          mode: 1,
          fontsize: 18,
          color: 16777215,
          midHash: "u1",
          content: "滚动",
          ctime: 99,
          weight: 0,
          action: "",
          pool: 0,
          attr: 0,
        },
      ]),
      "demo.json"
    );

    expect(result.format).toBe("json");
    expect(result.info).toEqual({ playResX: 1920, playResY: 1080 });
    expect(result.danmakus.map((danmaku) => danmaku.text)).toEqual([
      "滚动",
      "顶部",
    ]);
    expect(result.danmakus[0].type).toBe("scroll");
    expect(result.danmakus[0].fontSize).toBe(36);
    expect(result.danmakus[1].type).toBe("top");
    expect(result.danmakus[1].color).toBe("#0000FF");
  });

  it("parses Bilibili XML danmaku and decodes classic entities", () => {
    const result = parseDanmaku(
      `<?xml version="1.0" encoding="UTF-8"?>
<i>
  <chatserver>chat.bilibili.com</chatserver>
  <chatid>123</chatid>
  <d p="1.5,4,25,65280,1700000000,0,abc,row-a">底部&#38;&lt;弹幕&gt;</d>
  <d p="2,7,25,16777215,1700000001,0,abc,row-b">高级弹幕</d>
</i>`,
      "demo.xml"
    );

    expect(result.format).toBe("xml");
    expect(result.danmakus).toHaveLength(1);
    expect(result.danmakus[0]).toMatchObject({
      id: "row-a",
      startTime: 1.5,
      endTime: 5.5,
      text: "底部&<弹幕>",
      type: "bottom",
      color: "#00FF00",
      fontSize: 52,
    });
  });

  it("keeps ASS parsing behavior through the unified parser", () => {
    const result = parseDanmaku(
      `[Script Info]
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Style: Medium,Arial,52,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,1.2,0,5,0,0,0,0

[Events]
Dialogue: 0,0:00:01.00,0:00:07.00,Medium,,0,0,0,,{\\move(1940,40,-20,40,0,6000)\\c&H0000FF&}红色`,
      "demo.ass"
    );

    expect(result.format).toBe("ass");
    expect(result.danmakus).toHaveLength(1);
    expect(result.danmakus[0].color).toBe("#FF0000");
  });
});

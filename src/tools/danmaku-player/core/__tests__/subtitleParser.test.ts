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
import { smartDecode } from "@/utils/encoding";
import { parseSubtitle } from "../subtitleParser";

function utf16leWithBom(text: string): Uint8Array {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    bytes[2 + index * 2] = code & 0xff;
    bytes[3 + index * 2] = code >> 8;
  }
  return bytes;
}

describe("subtitleParser", () => {
  it("parses SRT cues and cleans HTML tags", () => {
    const result = parseSubtitle(
      `1
00:00:01,000 --> 00:00:03,500
<i>Hello &amp; welcome</i>

2
00:00:04,000 --> 00:00:05,000
Second line`,
      "movie.srt"
    );

    expect(result.track.format).toBe("srt");
    expect(result.track.cues).toHaveLength(2);
    expect(result.track.cues[0].text).toBe("Hello & welcome");
    expect(result.track.cues[0].endTime).toBe(3.5);
  });

  it("parses WebVTT cues with cue identifiers", () => {
    const result = parseSubtitle(
      `WEBVTT

intro
00:00:01.000 --> 00:00:02.000 align:center
Hello

00:00:03.000 --> 00:00:04.000
World`,
      "movie.vtt"
    );

    expect(result.track.format).toBe("vtt");
    expect(result.track.cues.map((cue) => cue.text)).toEqual([
      "Hello",
      "World",
    ]);
  });

  it("parses ASS/SSA dialogue as readable subtitle cues", () => {
    const result = parseSubtitle(
      `[Script Info]
Title: demo

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic
Style: Default,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.20,Default,,0,0,0,,{\\an2}第一行\\N第二行`,
      "movie.ass"
    );

    expect(result.track.format).toBe("ass");
    expect(result.track.cues[0].lines).toEqual(["第一行", "第二行"]);
    expect(result.track.cues[0].style?.isBold).toBe(true);
    expect(result.track.cues[0].style?.fontSize).toBe(28);
  });

  it("parses LRC lyrics using the next timestamp as end time", () => {
    const result = parseSubtitle(
      `[00:01.00]第一句
[00:03.50]第二句`,
      "song.lrc"
    );

    expect(result.track.format).toBe("lrc");
    expect(result.track.cues[0].endTime).toBe(3.5);
    expect(result.track.cues[1].text).toBe("第二句");
  });

  it("parses SBV blocks", () => {
    const result = parseSubtitle(
      `0:00:01.000,0:00:03.000
hello

0:00:04.000,0:00:05.000
world`,
      "video.sbv"
    );

    expect(result.track.format).toBe("sbv");
    expect(result.track.cues).toHaveLength(2);
  });

  it("parses text .sub files in SubViewer format", () => {
    const result = parseSubtitle(
      `00:00:01.00,00:00:03.00
hello|world`,
      "video.sub"
    );

    expect(result.track.format).toBe("subviewer");
    expect(result.track.cues[0].lines).toEqual(["hello", "world"]);
  });

  it("parses text .sub files in MicroDVD format with a warning", () => {
    const result = parseSubtitle("{25}{75}hello|world", "video.sub");

    expect(result.track.format).toBe("microdvd");
    expect(result.track.cues[0].startTime).toBe(1);
    expect(result.track.cues[0].endTime).toBe(3);
    expect(result.warnings[0]).toContain("25fps");
  });

  it("parses SAMI sync tags", () => {
    const result = parseSubtitle(
      `<SAMI><BODY>
<SYNC Start=1000><P Class=EN>Hello&nbsp;world
<SYNC Start=3000><P Class=EN>Next
</BODY></SAMI>`,
      "video.smi"
    );

    expect(result.track.format).toBe("sami");
    expect(result.track.cues[0].text).toBe("Hello world");
    expect(result.track.cues[0].endTime).toBe(3);
  });

  it("parses TTML paragraphs", () => {
    const result = parseSubtitle(
      `<tt><body><div>
<p begin="00:00:01.000" end="00:00:02.500">Hello<br/>world</p>
</div></body></tt>`,
      "video.ttml"
    );

    expect(result.track.format).toBe("ttml");
    expect(result.track.cues[0].lines).toEqual(["Hello", "world"]);
  });

  it("autodetects time based subtitles from .txt files", () => {
    const result = parseSubtitle(
      `00:00:01,000 --> 00:00:02,000
hello`,
      "subtitle.txt"
    );

    expect(result.track.format).toBe("srt");
    expect(result.track.cues[0].text).toBe("hello");
  });

  it("rejects known graphic subtitle containers", () => {
    expect(() => parseSubtitle("anything", "movie.idx")).toThrow(
      "图形字幕暂不支持"
    );
  });

  it("filters ASS karaoke fx lines (Effect=fx)", () => {
    const result = parseSubtitle(
      `[Script Info]
Title: demo

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic
Style: Default,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,普通对话
Dialogue: 2,0:00:01.00,0:00:03.00,Default,,0,0,0,fx,{\\an5\\pos(27,39)\\fad(500,0)}D
Dialogue: 2,0:00:01.00,0:00:03.00,Default,,0,0,0,fx,{\\an5\\pos(55,39)\\fad(500,0)}I`,
      "movie.ass"
    );

    expect(result.track.cues).toHaveLength(1);
    expect(result.track.cues[0].text).toBe("普通对话");
  });

  it("filters ASS drawing mode lines (\\p1)", () => {
    const result = parseSubtitle(
      `[Script Info]
Title: demo

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic
Style: Default,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,正常字幕
Dialogue: 1,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\p1\\c&HCBD2D7&}m 0 0 l 0 30 l 36 30 l 36 0`,
      "movie.ass"
    );

    expect(result.track.cues).toHaveLength(1);
    expect(result.track.cues[0].text).toBe("正常字幕");
  });

  it("filters fully transparent ASS layers (\\1a&HFF&)", () => {
    const result = parseSubtitle(
      `[Script Info]
Title: demo

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic
Style: Default,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an5}可见文字
Dialogue: 1,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an5\\1a&HFF&\\bord3}可见文字`,
      "movie.ass"
    );

    expect(result.track.cues).toHaveLength(1);
    expect(result.track.cues[0].text).toBe("可见文字");
  });

  it("deduplicates ASS multi-layer lines with same text and timing", () => {
    const result = parseSubtitle(
      `[Script Info]
Title: demo

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic
Style: Default,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 1,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an5\\bord0\\blur5}标题文字
Dialogue: 2,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an5\\bord3\\3c&H000000&}标题文字
Dialogue: 3,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an5\\shad2}标题文字`,
      "movie.ass"
    );

    expect(result.track.cues).toHaveLength(1);
    expect(result.track.cues[0].text).toBe("标题文字");
  });
});

describe("subtitle file decoding", () => {
  it("decodes UTF-8 BOM subtitles", () => {
    const content = smartDecode(new Uint8Array([0xef, 0xbb, 0xbf, 72, 105]));

    expect(content).toBe("Hi");
  });

  it("decodes UTF-16LE BOM subtitles", () => {
    const content = smartDecode(utf16leWithBom("字幕"));

    expect(content).toBe("字幕");
  });
});

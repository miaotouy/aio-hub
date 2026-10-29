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
import { fileUriToPath, parsePathsFromDataTransfer } from "../fileDropPaths";

// 文件导入公开契约：URI 编码只解码一次，Windows 与 POSIX 路径形态各自保留。
describe("文件拖放路径", () => {
  it.each([
    [
      "file:///home/mty/my%20video%27s%20%E6%B5%8B%E8%AF%95.mp4",
      "/home/mty/my video's 测试.mp4",
    ],
    ["file://localhost/tmp/a%2520b.txt", "/tmp/a%20b.txt"],
    ["file:///tmp/a%5Cb%7Cc.txt", String.raw`/tmp/a\b|c.txt`],
    ["file:///C:/my%20files/a.txt", String.raw`C:\my files\a.txt`],
    ["file://server/share/a.txt", String.raw`\\server\share\a.txt`],
    ["https://example.com/a.txt", null],
    ["file:///tmp/%invalid", null],
  ])("%s", (uri, expected) => expect(fileUriToPath(uri)).toBe(expected));

  it("URI 列表处理注释、编码路径与去重，优先于文本", () => {
    const dt = {
      getData: (type: string) =>
        type === "text/uri-list"
          ? "# files\r\nfile:///tmp/a%20b.txt\r\nhttps://example.com/a\r\nfile:///tmp/a%20b.txt"
          : "/tmp/other.txt",
    };
    expect(parsePathsFromDataTransfer(dt)).toEqual(["/tmp/a b.txt"]);
  });
  it("纯文本保留本地绝对路径，跳过普通描述和网页", () => {
    expect(
      parsePathsFromDataTransfer({
        getData: (type) =>
          type === "text/plain"
            ? "/home/mty/a.txt\nC:\\test\\b.txt\nfile:///tmp/my%20file.txt\nrelative.txt\nhttps://example.com"
            : "",
      })
    ).toEqual([
      "/home/mty/a.txt",
      String.raw`C:\test\b.txt`,
      "/tmp/my file.txt",
    ]);
  });
});

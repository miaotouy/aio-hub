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
  isPlainMessageText,
  MessageHeightCache,
  type MessageHeightKey,
} from "../messageHeightCache";

const key: MessageHeightKey = {
  id: "session-a/message-a",
  content: "历史回复内容",
  revision: "completed",
  appearance: "14px/card",
  width: 720,
};

describe("消息整行高度缓存", () => {
  it("复用相同会话、内容与布局的真实小数高度", () => {
    const cache = new MessageHeightCache();
    cache.remember(key, 128.625);
    expect(cache.read({ ...key })).toBe(128.625);
    expect(cache.read({ ...key, id: "session-b/message-a" })).toBeUndefined();
  });

  it.each([
    { content: "已经编辑的回复" },
    { revision: "translation-visible" },
    { appearance: "18px/bubble" },
    { width: 360 },
  ])("内容或布局变化后拒绝旧高度：%j", (change) => {
    const cache = new MessageHeightCache();
    cache.remember(key, 128.625);
    expect(cache.read({ ...key, ...change })).toBeUndefined();
  });

  it("按最近使用淘汰历史项，并允许折叠等局部交互主动失效", () => {
    const cache = new MessageHeightCache(2);
    cache.remember(key, 100);
    cache.remember({ ...key, id: "b" }, 200);
    expect(cache.read(key)).toBe(100);
    cache.remember({ ...key, id: "c" }, 300);
    expect(cache.read({ ...key, id: "b" })).toBeUndefined();
    cache.invalidate(key.id);
    expect(cache.read(key)).toBeUndefined();
  });

  it("隐藏窗口的零尺寸与异常尺寸不能覆盖已有实测值", () => {
    const cache = new MessageHeightCache();
    cache.remember(key, 128);
    for (const height of [0, -1, NaN, Infinity]) cache.remember(key, height);
    cache.remember({ ...key, width: 0 }, 80);
    expect(cache.read(key)).toBe(128);
    cache.clear();
    expect(cache.read(key)).toBeUndefined();
  });
});

describe("普通段落估高范围", () => {
  it("接受中文、混排、emoji 和多段文本", () => {
    for (const text of [
      "你好，世界。",
      "API 配置完成 👩‍💻",
      "第一段\n\n第二段",
      "分两行\n继续说明",
    ]) {
      expect(isPlainMessageText(text)).toBe(true);
    }
  });

  it("结构化 Markdown、HTML 与超长内容保留实际渲染测量", () => {
    for (const text of [
      "",
      "# 标题",
      "**重点**",
      "- 列表项",
      "1. 列表项",
      "![图片](asset://a)",
      "<details>内容</details>",
      "```js\ncode\n```",
      "$a+b$",
      "| 列一 | 列二 |",
      "a".repeat(16_001),
    ]) {
      expect(isPlainMessageText(text)).toBe(false);
    }
  });
});

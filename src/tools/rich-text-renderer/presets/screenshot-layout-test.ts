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

import type { RenderPreset } from "../types";

const labels = [
  "胶囊容器末尾文字",
  "API 配置完成",
  "AVATAR 测试状态",
  "👩‍💻 模型已连接",
];
const capsules = Array.from({ length: 12 }, (_, index) => {
  const size = 12 + index * 0.13;
  return `<span style="display:inline-flex;align-items:center;padding:4.3px 9.7px;border:1px solid var(--primary-color);border-radius:999px;font-size:${size}px;line-height:20px;margin:4px;background:var(--card-bg)"><span>${labels[index % labels.length]}</span></span>`;
}).join("");

export const screenshotLayoutTestPreset: RenderPreset = {
  id: "screenshot-layout-test",
  name: "截图排版对照",
  description: "对照小数字号胶囊、按钮、自然换行和紧凑布局的截图效果",
  content: `# 截图排版对照

## 单行胶囊

<div style="font-family:'Segoe UI','Microsoft YaHei',sans-serif;display:flex;flex-wrap:wrap;gap:5px;padding:12px;background:var(--container-bg)">${capsules}</div>

## 按钮

<Button type="input" value="查看状态" /> <Button type="input" value="继续剧情" />

## 自然换行

<div style="display:flex;gap:12px;width:100%;max-width:360px;border:1px solid var(--border-color);padding:12px;box-sizing:border-box"><div style="flex:0 0 48px">说明</div><div style="flex:1;min-width:0">这段文字应当随可用宽度自然换行。截图中仍需完整显示，并保持页面上的行数与段落高度，窄屏时也应继续遵守容器宽度。</div></div>

## 多行圆角容器

<div style="max-width:200px;border-radius:50px;border:1px solid var(--border-color);padding:16px">这是允许多行显示的圆角说明容器。较大的圆角同样可以承载完整段落。</div>

## 表格

| 内容 | 预期 |
| --- | --- |
| API 配置完成 | 单元格保持正常排版 |
| 中文与 English 混合 | 随列宽自然换行 |
`,
};

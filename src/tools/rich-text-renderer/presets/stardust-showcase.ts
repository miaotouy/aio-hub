// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import type { RenderPreset } from "../types";

export const stardustShowcasePreset: RenderPreset = {
  id: "stardust-showcase",
  name: "流式动效画廊",
  description: "切换星屑、几何、花瓣、扫描和水墨，比较相同文字的连续输出。",
  content: `# 让文字带着节奏出现

夜幕落下，观测站的灯一盏盏亮起。我们把今晚收到的信号写进日志，细碎的光点沿着文字轻轻散开。每一个新句子，都像从远处抵达的回声。

## 一束光的旅程

光带掠过新出现的文字，菱形缓缓旋转，星点沿各自的轨迹散去。你可以在侧栏切换星屑、几何碎片、花瓣、全息扫描和水墨，比较同一段文字的不同出场方式。

**星屑**带来细碎的光，**花瓣**沿着弧线轻舞，**几何碎片**有利落的切分感。**全息扫描**更有秩序，**水墨晕染**则像落在纸上的一滴墨。

文字仍然可以自由选择、复制，也可以打开[项目主页](https://github.com/miaotouy/aio-hub)。试着在输出过程中选中这一句，再滚动页面，看看星点能否跟随文字位置。

## 今夜的观测记录

- 第一束信号来自山谷，穿过薄雾时留下了一条银色的弧线。
- 第二束信号沿着海面前进，波浪把它折成了许多闪烁的碎片。
- 第三束信号抵达窗边，安静地停在了这份记录的末尾。

> 适当的停顿让文字更有节奏，留白让短暂的光也有了形状。

## 留一段清晰的代码

\`\`\`typescript
const observation = {
  location: "山顶观测站",
  signals: 3,
  sky: "晴朗",
};
console.log(observation);
\`\`\`

继续写下今晚的故事。随着内容变长，新的光点始终围绕新出现的文字，已经读过的段落保持安静。生成结束后，最后一小簇星屑慢慢熄灭，留下完整的记录。
`,
};

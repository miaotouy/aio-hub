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

import { RenderPreset } from "../types";

export const detailsPreset: RenderPreset = {
  id: "details-collapse",
  name: "折叠面板 (Details)",
  description:
    "测试 <details> 折叠面板组件的各种变体、色调、滚动高度和嵌套场景",
  content: `# 折叠面板组件测试

> 拦截原生 \`<details>\` 并由 DetailsNode 接管渲染。支持 \`data-variant\`、\`data-tone\`、\`data-max-height\`、\`data-summary\`、\`data-dense\`、\`data-no-copy\` 以及原生 \`open\` 属性，\`style\` 属性会被安全清理后透传。

---

## 1. 最简形式（default 变体，默认折叠）

<details>
<summary>点击查看示例</summary>

这是一段简单的正文，支持 **粗体**、*斜体*、\`行内代码\` 和 [链接](https://example.com)。
</details>

---

## 2. 默认展开（HTML 原生 open 属性）

<details open>
<summary>这个面板默认是展开的</summary>

通过给 \`<details>\` 加上 HTML 原生的 \`open\` 属性即可让面板默认展开。
</details>

---

## 3. 三种 Variant

<details data-variant="default">
<summary>variant = default（默认风格，完整边框）</summary>

完整的卡片边框 + 浅背景 + 圆角。
</details>

<details data-variant="card">
<summary>variant = card（强卡片感，标题栏带底色）</summary>

更明显的卡片背景、投影，并且标题栏带有强调色底色。
</details>

<details data-variant="ghost">
<summary>variant = ghost（最轻量，仅左侧边线）</summary>

无背景、无完整边框，仅左侧一条强调色边线，适合行内嵌入。
</details>

---

## 4. 五种 Tone 色调（与 GitHub Alert 体系对齐）

<details data-variant="card" data-tone="neutral">
<summary>tone = neutral（中性灰）</summary>

中性色调，与默认主题色一致。
</details>

<details data-variant="card" data-tone="info">
<summary>tone = info（主色蓝）</summary>

信息提示色调，使用项目主色。
</details>

<details data-variant="card" data-tone="success">
<summary>tone = success（成功绿）</summary>

成功状态色调。
</details>

<details data-variant="card" data-tone="warning">
<summary>tone = warning（警告橙）</summary>

警告状态色调。
</details>

<details data-variant="card" data-tone="danger">
<summary>tone = danger（危险红）</summary>

危险/错误状态色调。
</details>

---

## 5. 滚动高度 (data-max-height)

<details open data-variant="card" data-tone="info" data-max-height="200">
<summary>data-max-height="200"（内容区超过 200px 启用纵向滚动）</summary>

第一行
第二行
第三行
第四行
第五行
第六行
第七行
第八行
第九行
第十行
第十一行
第十二行
第十三行
第十四行
第十五行
第十六行
第十七行
第十八行
第十九行
第二十行
</details>

<details data-variant="card" data-max-height="40vh">
<summary>data-max-height="40vh"（按视口高度的 40% 限制）</summary>

支持任意合法的 CSS 长度单位，纯数字默认按 px 处理。
</details>

---

## 6. 框住带代码块的 README 内容（核心使用场景）

<details data-variant="card" data-tone="info" data-max-height="400">
<summary>📦 项目 README（内嵌代码块不会撞围栏）</summary>

## 安装

\`\`\`bash
npm install my-package
\`\`\`

## 使用

\`\`\`ts
import { foo } from "my-package";

foo({
  hello: "world",
});
\`\`\`

## 配置

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| \`debug\` | \`false\` | 是否开启调试日志 |
| \`timeout\` | \`5000\` | 超时时间（毫秒） |

</details>

---

## 7. Summary 缺失时的兜底（data-summary）

<details data-summary="自动兜底标题">

这个面板的 \`<summary>\` 标签缺失，会使用 \`data-summary\` 属性作为标题。
</details>

<details>

这个面板既没有 \`<summary>\` 也没有 \`data-summary\`，会显示默认的"详情"作为兜底标题。
</details>

---

## 8. Summary 内含 Markdown 内联格式

<details data-variant="card">
<summary>**加粗的标题** + \`行内代码\` + *斜体*</summary>

Summary 内的 markdown 内联格式（粗体、行内代码、斜体）会被正常解析渲染。
</details>

---

## 9. 紧凑模式 (data-dense)

<details data-variant="card" data-dense>
<summary>紧凑模式：内边距更小</summary>

适合在密集的列表场景使用。
</details>

---

## 10. 隐藏复制按钮 (data-no-copy)

<details data-variant="card" data-no-copy>
<summary>这个面板没有复制按钮</summary>

通过 \`data-no-copy\` 隐藏右上角的复制按钮。
</details>

---

## 11. style 属性透传（带安全清理）

<details data-variant="default" style="border: 2px dashed var(--el-color-warning); border-radius: 12px;">
<summary>自定义边框样式（虚线 + 警告色）</summary>

\`style\` 属性会透传到容器，但 \`position: fixed/sticky\` 以及过大的 \`z-index\` 等会被自动拦截。
</details>

---

## 12. 嵌套折叠面板

<details open data-variant="card" data-tone="info">
<summary>外层（默认展开）</summary>

外层正文。

<details data-variant="ghost" data-tone="success">
<summary>内层 1（ghost 变体）</summary>

内层 1 的正文。
</details>

<details data-variant="ghost" data-tone="warning">
<summary>内层 2（ghost 变体）</summary>

内层 2 的正文。
</details>

</details>
`,
};

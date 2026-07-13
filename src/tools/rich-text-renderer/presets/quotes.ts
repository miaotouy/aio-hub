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

export const quotesPreset: RenderPreset = {
  id: "quotes",
  name: "智能引号测试",
  description: "测试中英文引号的解析与渲染",
  content: `# 引号渲染测试

## 1. 英文引号

这是 "英文引号" 测试。
这里有 "多个" "英文引号"。

## 2. 中文引号

这是 “中文引号” 测试。
这里有 “多个” “中文引号”。

## 3. 混合使用

这是 “中文引号” 和 "英文引号" 的混合使用。
这是 "英文引号" 和 “中文引号” 的混合使用。

## 4. 特殊情况

### 4.1 紧凑排列
"紧凑""排列"
“紧凑”“排列”

### 4.2 包含其他元素
"包含 **粗体** 的引号"
“包含 *斜体* 的引号”
"包含 \`代码\` 的引号"

### 4.3 跨行测试
"这是一个
跨行的
英文引号"

“这是一个
跨行的
中文引号”

## 5. 边缘情况（解析器容错测试）

### 5.1 不匹配的引号
这是 "一个未闭合的英文引号
这是 “一个未闭合的中文引号

### 5.2 嵌套（当前解析器可能视为平铺）
"外层 '内层' 外层"
“外层 ‘内层’ 外层”
“外层 "内层" 外层”

### 5.3 奇怪的组合
“左中文，右英文"
"左英文，右中文”
`,
};

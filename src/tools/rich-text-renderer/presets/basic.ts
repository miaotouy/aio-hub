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

export const basicPreset: RenderPreset = {
  id: "basic",
  name: "基础元素",
  description: "测试基本的 Markdown 元素",
  content: `# 标题测试

## 二级标题

### 三级标题

这是一个段落，包含**粗体文本**和*斜体文本*，还有\`行内代码\`。

这是另一个段落，包含[链接](https://example.com)。

---

> 这是一个引用块
> 可以有多行内容

- 无序列表项 1
- 无序列表项 2
  - 嵌套项 2.1
  - 嵌套项 2.2
- 无序列表项 3

1. 有序列表项 1
2. 有序列表项 2
3. 有序列表项 3`,
};

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

export const tablePreset: RenderPreset = {
  id: "table",
  name: "表格测试",
  description: "测试 Markdown 表格",
  content: `# 表格示例

## 简单表格

| 姓名 | 年龄 | 城市 |
|------|------|------|
| 张三 | 25 | 北京 |
| 李四 | 30 | 上海 |
| 王五 | 28 | 广州 |

## 对齐表格

| 左对齐 | 居中对齐 | 右对齐 |
|:-------|:--------:|-------:|
| 内容1  | 内容2    | 内容3  |
| 长一点的内容 | 测试 | 123 |
| A | B | C |

## 复杂表格

| 功能 | 状态 | 优先级 | 备注 |
|------|------|--------|------|
| 用户登录 | ✅ 完成 | 高 | 已上线 |
| 数据导出 | 🚧 进行中 | 中 | 开发中 |
| 报表生成 | 📅 计划中 | 低 | 下个版本 |`,
};

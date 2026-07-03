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

import { useKbManagement } from "./useKbManagement";
import { useKbEntryManagement } from "./useKbEntryManagement";
import { useKbVectorSync } from "./useKbVectorSync";

/**
 * 知识库业务逻辑聚合 Composable
 *
 * 已拆分为:
 * - useKbManagement: 库级别的 CRUD 与管理
 * - useKbEntryManagement: 条目级别的 CRUD 与导入
 * - useKbVectorSync: 向量同步、AI 标签生成等后台任务
 */
export function useKnowledgeBase() {
  const kbManagement = useKbManagement();
  const entryManagement = useKbEntryManagement();
  const vectorSync = useKbVectorSync();

  return {
    ...kbManagement,
    ...entryManagement,
    ...vectorSync,
  };
}

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

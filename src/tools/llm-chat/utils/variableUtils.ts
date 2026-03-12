import type { VariableTreeNode, FlatVariableDefinition } from "../types/sessionVariable";

/**
 * 将树形变量定义扁平化为路径映射
 * @param tree 树形节点数组
 * @param parentPath 父路径（用于递归）
 * @returns 扁平化的变量定义数组
 */
export function flattenDefinitions(
  tree: VariableTreeNode[],
  parentPath = ""
): FlatVariableDefinition[] {
  const result: FlatVariableDefinition[] = [];

  for (const node of tree) {
    const currentPath = parentPath ? `${parentPath}.${node.key}` : node.key;

    if (node.type === "variable") {
      // 叶子节点：添加到结果
      result.push({
        path: currentPath,
        displayName: node.displayName,
        initialValue: node.initialValue,
        min: node.min,
        max: node.max,
        description: node.description,
        hidden: node.hidden
      });
    } else if (node.type === "group" && node.children) {
      // 分组节点：递归处理子节点
      result.push(...flattenDefinitions(node.children, currentPath));
    }
  }

  return result;
}

/**
 * 将扁平化的变量定义转换为 Map 以便快速查询
 * @param definitions 扁平化的变量定义数组
 * @returns 路径到定义的映射
 */
export function createDefinitionMap(
  definitions: FlatVariableDefinition[]
): Map<string, FlatVariableDefinition> {
  return new Map(definitions.map(def => [def.path, def]));
}
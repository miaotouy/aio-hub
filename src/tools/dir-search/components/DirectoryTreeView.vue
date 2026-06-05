<template>
  <div class="directory-tree-view">
    <DirectoryTreeNode
      v-for="node in tree"
      :key="node.path"
      :node="node"
      :expanded-dirs="expandedDirs"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import DirectoryTreeNode from "./DirectoryTreeNode.vue";
import type { DirectoryNode } from "../types";
import { useDirSearchContext } from "../composables/useDirSearchContext";

const search = useDirSearchContext();

// 目录展开状态（独立于文件展开状态）
const expandedDirs = ref<Set<string>>(new Set());

// 当结果变化时，增量展开新出现的目录（不重建整个 Set）
watch(
  () => search.resultsList.value,
  (newResults, oldResults) => {
    // 如果从空变为非空（新搜索），重建整个 Set
    if (!oldResults || oldResults.length === 0) {
      const allDirPaths = new Set<string>();
      for (const result of newResults) {
        const parts = result.relativePath.split("/");
        let current = "";
        for (let i = 0; i < parts.length - 1; i++) {
          current = current ? `${current}/${parts[i]}` : parts[i];
          allDirPaths.add(current);
        }
      }
      expandedDirs.value = allDirPaths;
    } else {
      // 增量：只处理新增的文件，添加其目录路径
      const existing = expandedDirs.value;
      for (let j = oldResults.length; j < newResults.length; j++) {
        const parts = newResults[j].relativePath.split("/");
        let current = "";
        for (let i = 0; i < parts.length - 1; i++) {
          current = current ? `${current}/${parts[i]}` : parts[i];
          existing.add(current);
        }
      }
    }
  },
  { immediate: true }
);

/** 构建目录树 */
const tree = computed<DirectoryNode[]>(() => {
  return buildDirectoryTree(search.resultsList.value);
});

/**
 * 将扁平的 FileSearchResult[] 按 relativePath 构建为嵌套目录树
 * 空目录层级自动折叠合并
 */
function buildDirectoryTree(
  results: { relativePath: string; filePath: string; matches: unknown[] }[]
): DirectoryNode[] {
  // 中间结构：原始树节点
  interface RawNode {
    name: string;
    path: string;
    children: Map<string, RawNode>;
    files: typeof results;
  }

  const root: RawNode = { name: "", path: "", children: new Map(), files: [] };

  // 将所有文件插入原始树
  for (const result of results) {
    const parts = result.relativePath.split("/");
    let current = root;
    let currentPath = "";

    // 遍历目录部分
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: currentPath,
          children: new Map(),
          files: [],
        });
      }
      current = current.children.get(part)!;
    }

    // 文件放在当前目录
    current.files.push(result);
  }

  // 递归转换为 DirectoryNode，同时合并单子目录
  function convertNode(raw: RawNode): DirectoryNode {
    let node = raw;

    // 合并单子目录：如果一个目录只有一个子目录且没有文件，则合并
    while (node.children.size === 1 && node.files.length === 0) {
      const onlyChild = Array.from(node.children.values())[0];
      node = {
        name: node.name ? `${node.name}/${onlyChild.name}` : onlyChild.name,
        path: onlyChild.path,
        children: onlyChild.children,
        files: onlyChild.files,
      };
    }

    const children = Array.from(node.children.values())
      .map(convertNode)
      .sort((a, b) => a.name.localeCompare(b.name));

    const files = [...node.files].sort((a, b) => {
      const aName = a.relativePath.split("/").pop() || "";
      const bName = b.relativePath.split("/").pop() || "";
      return aName.localeCompare(bName);
    }) as DirectoryNode["files"];

    // 计算总匹配数
    const fileTotalMatches = files.reduce(
      (sum, f) => sum + f.matches.length,
      0
    );
    const childTotalMatches = children.reduce(
      (sum, c) => sum + c.totalMatches,
      0
    );

    return {
      name: node.name,
      path: node.path,
      children,
      files,
      totalMatches: fileTotalMatches + childTotalMatches,
    };
  }

  // 从 root 的子节点开始构建（root 本身是虚拟节点）
  // 如果 root 直接有文件（没有目录前缀的文件），需要特殊处理
  const topLevelNodes: DirectoryNode[] = [];

  // 处理 root 下的子目录
  for (const child of root.children.values()) {
    topLevelNodes.push(convertNode(child));
  }

  // 处理 root 下直接的文件（无目录前缀）
  if (root.files.length > 0) {
    // 创建一个虚拟的根节点来容纳这些文件
    topLevelNodes.unshift({
      name: ".",
      path: "",
      children: [],
      files: root.files.sort((a, b) => {
        const aName = a.relativePath.split("/").pop() || "";
        const bName = b.relativePath.split("/").pop() || "";
        return aName.localeCompare(bName);
      }) as DirectoryNode["files"],
      totalMatches: root.files.reduce(
        (sum, f) => sum + (f.matches as unknown[]).length,
        0
      ),
    });
  }

  return topLevelNodes.sort((a, b) => a.name.localeCompare(b.name));
}

/** 切换目录展开/折叠 */
function toggleDir(dirPath: string) {
  if (expandedDirs.value.has(dirPath)) {
    expandedDirs.value.delete(dirPath);
  } else {
    expandedDirs.value.add(dirPath);
  }
}

/** 全部展开目录 */
function expandAllDirs() {
  const allDirPaths = new Set<string>();
  function collectPaths(nodes: DirectoryNode[]) {
    for (const node of nodes) {
      if (node.path) allDirPaths.add(node.path);
      collectPaths(node.children);
    }
  }
  collectPaths(tree.value);
  expandedDirs.value = allDirPaths;
}

/** 全部折叠目录 */
function collapseAllDirs() {
  expandedDirs.value = new Set();
}

/** 展开指定的目录路径列表 */
function expandDirs(paths: string[]) {
  for (const p of paths) {
    expandedDirs.value.add(p);
  }
}

// 通过 provide 暴露 toggleDir 给子组件（DirectoryTreeNode 递归使用）
import { provide } from "vue";
provide("dirTreeActions", { toggleDir });

defineExpose({ expandAllDirs, collapseAllDirs, expandDirs });
</script>

<style scoped>
.directory-tree-view {
  padding: 4px 0;
}
</style>

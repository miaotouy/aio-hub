<template>
  <div class="directory-tree-view">
    <DirectoryTreeNode
      v-for="node in tree"
      :key="node.path"
      :node="node"
      :expanded-dirs="expandedDirs"
      :expanded-files="expandedFiles"
      :selected-file-path="selectedFilePath"
      :show-replace="showReplace"
      @toggle-dir="toggleDir"
      @toggle-file="(p: string) => $emit('toggleFile', p)"
      @select-match="(fp: string, m: SearchMatch) => $emit('selectMatch', fp, m)"
      @dismiss-file="(fp: string) => $emit('dismissFile', fp)"
      @dismiss-match="(fp: string, idx: number) => $emit('dismissMatch', fp, idx)"
      @replace-file="(fp: string) => $emit('replaceFile', fp)"
      @replace-match="(fp: string, idx: number) => $emit('replaceMatch', fp, idx)"
      @context-menu="
        (ev: MouseEvent, items: ContextMenuItem[], ctx: Record<string, unknown>) => $emit('contextMenu', ev, items, ctx)
      "
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import DirectoryTreeNode from "./DirectoryTreeNode.vue";
import type { FileSearchResult, DirectoryNode, SearchMatch } from "../types";
import { type ContextMenuItem } from "../composables/useContextMenu";

const props = defineProps<{
  results: FileSearchResult[];
  expandedFiles: Set<string>;
  selectedFilePath: string | null;
  showReplace?: boolean;
}>();

defineEmits<{
  toggleFile: [filePath: string];
  selectMatch: [filePath: string, match: SearchMatch];
  dismissFile: [filePath: string];
  dismissMatch: [filePath: string, matchIndex: number];
  replaceFile: [filePath: string];
  replaceMatch: [filePath: string, matchIndex: number];
  contextMenu: [event: MouseEvent, items: ContextMenuItem[], context: Record<string, unknown>];
}>();

// 目录展开状态（独立于文件展开状态）
const expandedDirs = ref<Set<string>>(new Set());

// 当结果变化时，增量展开新出现的目录（不重建整个 Set）
watch(
  () => props.results,
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
  { immediate: true },
);

function toggleDir(dirPath: string) {
  if (expandedDirs.value.has(dirPath)) {
    expandedDirs.value.delete(dirPath);
  } else {
    expandedDirs.value.add(dirPath);
  }
}

/** 构建目录树 */
const tree = computed<DirectoryNode[]>(() => {
  return buildDirectoryTree(props.results);
});

/**
 * 将扁平的 FileSearchResult[] 按 relativePath 构建为嵌套目录树
 * 空目录层级自动折叠合并
 */
function buildDirectoryTree(results: FileSearchResult[]): DirectoryNode[] {
  // 中间结构：原始树节点
  interface RawNode {
    name: string;
    path: string;
    children: Map<string, RawNode>;
    files: FileSearchResult[];
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
    });

    // 计算总匹配数
    const fileTotalMatches = files.reduce((sum, f) => sum + f.matches.length, 0);
    const childTotalMatches = children.reduce((sum, c) => sum + c.totalMatches, 0);

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
    // 或者直接作为顶层文件展示 — 这里我们创建一个 "." 节点
    topLevelNodes.unshift({
      name: ".",
      path: "",
      children: [],
      files: root.files.sort((a, b) => {
        const aName = a.relativePath.split("/").pop() || "";
        const bName = b.relativePath.split("/").pop() || "";
        return aName.localeCompare(bName);
      }),
      totalMatches: root.files.reduce((sum, f) => sum + f.matches.length, 0),
    });
  }

  return topLevelNodes.sort((a, b) => a.name.localeCompare(b.name));
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

defineExpose({ expandAllDirs, collapseAllDirs, expandDirs });
</script>

<style scoped>
.directory-tree-view {
  padding: 4px 0;
}
</style>

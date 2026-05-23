<template>
  <div class="tab-scroll-container">
    <div class="file-tree">
      <!-- 根文件 (SKILL.md 始终置顶) -->
      <div class="tree-item file clickable" @click="openFileEditor('SKILL.md')">
        <FileIcon file-name="SKILL.md" file-type="document" :size="14" class="icon" />
        <span class="name">SKILL.md</span>
      </div>

      <!-- 其他根目录文件 -->
      <div
        v-for="f in rootFiles"
        :key="f.relativePath"
        class="tree-item file clickable"
        @click="openFileEditor(f.relativePath)"
      >
        <FileIcon :file-name="f.name" :file-type="determineAssetType(f.mimeType)" :size="14" class="icon" />
        <span class="name">{{ f.name }}</span>
        <span class="size">{{ formatSize(f.size) }}</span>
      </div>

      <!-- 动态目录节点: 子目录文件 -->
      <template v-for="(group, dirName) in fileGroups" :key="dirName">
        <div class="tree-group">
          <div class="tree-item dir">
            <Folder :size="14" class="icon" />
            <span class="name">{{ dirName }}</span>
          </div>
          <div class="tree-children">
            <div
              v-for="f in group"
              :key="f.relativePath"
              class="tree-item file clickable"
              @click="openFileEditor(f.relativePath)"
            >
              <FileIcon :file-name="f.name" :file-type="determineAssetType(f.mimeType)" :size="14" class="icon" />
              <span class="name">{{ f.name }}</span>
              <span class="size">{{ formatSize(f.size) }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { groupBy } from "lodash-es";
import { Folder } from "lucide-vue-next";
import FileIcon from "@/components/common/FileIcon.vue";
import { determineAssetType } from "@/utils/fileTypeDetector";
import type { SkillManifest } from "../types";

const props = defineProps<{
  manifest: SkillManifest;
}>();

const emit = defineEmits<{
  "open-editor": [path: string];
}>();

function openFileEditor(path: string) {
  emit("open-editor", path);
}

function formatSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * 根目录下的文件 (排除已置顶的 SKILL.md)
 */
const rootFiles = computed(() => {
  const files = props.manifest.files || [];
  return files.filter((f) => {
    const isRoot = !f.relativePath.includes("/") && !f.relativePath.includes("\\");
    return isRoot && f.name.toLowerCase() !== "skill.md";
  });
});

/**
 * 将 files 按一级目录分组 (仅处理子目录中的文件)
 */
const fileGroups = computed(() => {
  const files = props.manifest.files || [];
  const subDirFiles = files.filter((f) => f.relativePath.includes("/") || f.relativePath.includes("\\"));
  return groupBy(subDirFiles, (f) => {
    const parts = f.relativePath.split(/[\\/]/);
    return parts[0];
  });
});
</script>

<style scoped>
.tab-scroll-container {
  height: 100%;
  overflow-y: auto;
  padding: 20px 24px;
}

/* File Tree Styles */
.file-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  transition: background 0.2s;
}

.tree-item:hover {
  background: var(--input-bg);
}

.tree-item .icon {
  color: var(--text-color-secondary);
  opacity: 0.7;
}

.tree-item.dir {
  font-weight: 600;
  color: var(--text-color);
}

.tree-item.file .name {
  color: var(--text-color);
}

.tree-item.clickable {
  cursor: pointer;
}

.tree-item.clickable:hover {
  background: rgba(var(--el-color-primary-rgb), 0.08);
  color: var(--el-color-primary);
}

.tree-item.clickable:hover .name {
  color: var(--el-color-primary);
}

.tree-item .size {
  font-size: 11px;
  color: var(--text-color-secondary);
  margin-left: auto;
}

.tree-children {
  margin-left: 20px;
  border-left: 1px solid var(--border-color);
  padding-left: 4px;
}

/* Scrollbar Customization */
.tab-scroll-container::-webkit-scrollbar {
  width: 6px;
}

.tab-scroll-container::-webkit-scrollbar-thumb {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 10px;
}

.tab-scroll-container::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--el-color-info-rgb), 0.3);
}
</style>

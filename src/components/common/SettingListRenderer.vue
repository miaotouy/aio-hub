<template>
  <div class="setting-list-renderer">
    <template v-for="(item, index) in items" :key="item.id">
      <!-- 如果是分组折叠项 -->
      <template v-if="item.groupCollapsible">
        <!-- 只有组内第一个元素负责渲染折叠容器 -->
        <template v-if="isFirstInGroup(index)">
          <el-collapse v-model="localActiveGroups" class="group-collapsible-container">
            <el-collapse-item
              :title="item.groupCollapsible.title"
              :name="item.groupCollapsible.name"
            >
              <template v-for="subItem in getGroupItems(item.groupCollapsible.name)" :key="subItem.id">
                <SettingItemRenderer
                  v-if="!subItem.visible || subItem.visible(settings)"
                  :item="subItem"
                  :settings="settings"
                  @update:settings="handleSettingsUpdate"
                  @action="handleAction"
                  :is-highlighted="highlightedItemId === subItem.id"
                />
              </template>
            </el-collapse-item>
          </el-collapse>
        </template>
      </template>

      <!-- 普通项 (没有分组折叠) -->
      <SettingItemRenderer
        v-else-if="!item.visible || item.visible(settings)"
        :item="item"
        :settings="settings"
        @update:settings="handleSettingsUpdate"
        @action="handleAction"
        :is-highlighted="highlightedItemId === item.id"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ElCollapse, ElCollapseItem } from "element-plus";
import type { SettingItem } from "@/types/settings-renderer";
import SettingItemRenderer from "./SettingItemRenderer.vue";

const props = defineProps<{
  items: SettingItem<any>[];
  settings: any;
  highlightedItemId?: string;
  activeGroups?: string[];
}>();

const emit = defineEmits<{
  (e: "update:settings", value: any): void;
  (e: "update:activeGroups", value: string[]): void;
  (e: "action", actionName: string): void;
}>();

const localActiveGroups = ref<string[]>(props.activeGroups || []);

watch(
  () => props.activeGroups,
  (val) => {
    if (val) localActiveGroups.value = val;
  }
);

watch(localActiveGroups, (val) => {
  emit("update:activeGroups", val);
});

const isFirstInGroup = (index: number) => {
  const item = props.items[index];
  if (!item.groupCollapsible) return false;
  if (index === 0) return true;
  const prevItem = props.items[index - 1];
  return prevItem.groupCollapsible?.name !== item.groupCollapsible.name;
};

const getGroupItems = (groupName: string) => {
  return props.items.filter((i) => i.groupCollapsible?.name === groupName);
};

const handleSettingsUpdate = (newSettings: any) => {
  emit("update:settings", newSettings);
};

const handleAction = (actionName: string) => {
  emit("action", actionName);
};
</script>

<style scoped>
.group-collapsible-container {
  margin-left: 26px;
  margin-bottom: 20px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}

.group-collapsible-container :deep(.el-collapse-item__header) {
  padding-left: 16px;
  font-weight: 500;
  background-color: var(--el-fill-color-light);
  height: 40px;
  line-height: 40px;
}

.group-collapsible-container :deep(.el-collapse-item__content) {
  padding: 16px 16px 0 0;
}

.group-collapsible-container :deep(.el-form-item) {
  margin-bottom: 16px;
}
</style>
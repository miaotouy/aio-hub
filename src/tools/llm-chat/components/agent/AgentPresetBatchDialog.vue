<template>
  <BaseDialog
    v-model="visible"
    title="预设消息批量管理"
    width="900px"
    height="80vh"
    :closeOnBackdropClick="false"
  >
    <div class="batch-manager">
      <!-- 顶部工具栏 -->
      <div class="toolbar">
        <div class="selection-info">
          已选择 <span class="count">{{ selectedRows.length }}</span> 项
        </div>
        <div class="actions" :class="{ disabled: selectedRows.length === 0 }">
          <el-button-group>
            <el-button :disabled="selectedRows.length === 0" @click="handleBatchEnable(true)">
              启用
            </el-button>
            <el-button :disabled="selectedRows.length === 0" @click="handleBatchEnable(false)">
              禁用
            </el-button>
          </el-button-group>

          <el-button-group class="move-actions">
            <el-tooltip content="移动到顶部" placement="top">
              <el-button
                :disabled="selectedRows.length === 0"
                :icon="Top"
                @click="handleMoveTo('top')"
              />
            </el-tooltip>
            <el-tooltip content="移动到底部" placement="top">
              <el-button
                :disabled="selectedRows.length === 0"
                :icon="Bottom"
                @click="handleMoveTo('bottom')"
              />
            </el-tooltip>
            <el-popover
              placement="bottom"
              title="移动到指定位置"
              :width="240"
              trigger="click"
              v-model:visible="showMovePopover"
            >
              <template #reference>
                <el-button :disabled="selectedRows.length === 0">
                  <el-icon class="el-icon--left"><Sort /></el-icon>
                  移动到...
                </el-button>
              </template>
              <div class="move-popover-content">
                <div class="input-row">
                  <span>目标行号 (1-{{ localData.length }}):</span>
                  <el-input-number
                    v-model="targetIndexInput"
                    :min="1"
                    :max="localData.length"
                    size="small"
                    style="width: 90px"
                  />
                </div>
                <div class="input-row">
                  <span>插入位置:</span>
                  <el-radio-group v-model="movePosition" size="small">
                    <el-radio-button label="before">之前</el-radio-button>
                    <el-radio-button label="after">之后</el-radio-button>
                  </el-radio-group>
                </div>
                <div class="quick-anchors" v-if="anchors.length > 0">
                  <div class="anchor-label">快速定位:</div>
                  <div class="anchor-tags">
                    <el-tag
                      v-for="anchor in anchors"
                      :key="anchor.index"
                      size="small"
                      effect="plain"
                      class="anchor-tag"
                      @click="targetIndexInput = anchor.index + 1"
                    >
                      {{ anchor.label }}
                    </el-tag>
                  </div>
                </div>
                <div class="popover-footer">
                  <el-button size="small" @click="showMovePopover = false">取消</el-button>
                  <el-button type="primary" size="small" @click="handleMoveToSpecific">
                    确认移动
                  </el-button>
                </div>
              </div>
            </el-popover>
          </el-button-group>

          <el-popconfirm
            title="确定要删除选中的消息吗？此操作不可恢复。"
            @confirm="handleBatchDelete"
          >
            <template #reference>
              <el-button type="danger" :disabled="selectedRows.length === 0">
                <el-icon class="el-icon--left"><Delete /></el-icon>
                删除
              </el-button>
            </template>
          </el-popconfirm>
        </div>
      </div>

      <!-- 列表区域 -->
      <div class="table-container">
        <el-table
          ref="tableRef"
          :data="localData"
          style="width: 100%; height: 100%"
          height="100%"
          border
          stripe
          row-key="id"
          @selection-change="handleSelectionChange"
        >
          <el-table-column type="selection" width="45" align="center" :selectable="isSelectable" />
          <el-table-column label="#" width="60" align="center">
            <template #default="{ $index }">
              <span class="index-badge">{{ $index + 1 }}</span>
            </template>
          </el-table-column>
          <el-table-column label="角色" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="getRoleTagType(row.role)" size="small" effect="plain">
                {{ row.role }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="内容预览" min-width="300">
            <template #default="{ row }">
              <div class="content-cell">
                <span v-if="isAnchorType(row.type)" class="anchor-badge">
                  [{{ getAnchorName(row.type) }}]
                </span>
                <span class="content-text" :class="{ 'is-placeholder': isAnchorType(row.type) }">
                  {{ truncateText(row.content || row.name || "(无内容)", 60) }}
                </span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="80" align="center">
            <template #default="{ row }">
              <el-switch
                v-model="row.isEnabled"
                size="small"
                :disabled="!isSelectable(row)"
                @change="handleSingleEnableChange"
              />
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">关闭</el-button>
        <el-button type="primary" @click="handleSave">应用更改</el-button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { Top, Bottom, Sort, Delete } from "@element-plus/icons-vue";
import { customMessage } from "@/utils/customMessage";
import type { ChatMessageNode, MessageRole } from "../../types";
import { useAnchorRegistry } from "../../composables/useAnchorRegistry";

interface Props {
  visible: boolean;
  messages: ChatMessageNode[];
}

interface Emits {
  (e: "update:visible", value: boolean): void;
  (e: "save", messages: ChatMessageNode[]): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const anchorRegistry = useAnchorRegistry();

const visible = computed({
  get: () => props.visible,
  set: (val) => emit("update:visible", val),
});

// 本地数据副本
const localData = ref<ChatMessageNode[]>([]);
const selectedRows = ref<ChatMessageNode[]>([]);
const tableRef = ref();

// 移动相关的状态
const showMovePopover = ref(false);
const targetIndexInput = ref(1);
const movePosition = ref<"before" | "after">("before");

// 初始化数据
watch(
  () => props.visible,
  (val) => {
    if (val) {
      // 深拷贝，避免直接修改父组件数据
      localData.value = JSON.parse(JSON.stringify(props.messages));
      selectedRows.value = [];
      if (tableRef.value) {
        tableRef.value.clearSelection();
      }
    }
  }
);

// 锚点识别
const isAnchorType = (type?: string) => !!type && type !== "message";
const getAnchorName = (type?: string) => {
  if (!type) return type;
  return anchorRegistry.getAnchorById(type)?.name || type;
};

// 某些行不可选中（例如纯占位符锚点，如果业务逻辑不允许移动它们的话。
// 这里假设所有行都可以参与排序，但纯占位符可能有一些限制，暂时全部开放）
const isSelectable = (_row: ChatMessageNode) => true;

// 关键锚点列表（用于快速定位）
const anchors = computed(() => {
  const list: { index: number; label: string }[] = [];
  localData.value.forEach((msg, index) => {
    if (isAnchorType(msg.type)) {
      list.push({
        index,
        label: getAnchorName(msg.type) || "锚点",
      });
    }
  });
  return list;
});

function handleSelectionChange(selection: ChatMessageNode[]) {
  selectedRows.value = selection;
}

function getRoleTagType(role: MessageRole) {
  const map: Record<string, string> = {
    system: "info",
    user: "primary",
    assistant: "success",
  };
  return map[role] || "info";
}

function truncateText(text: string, len: number) {
  if (!text) return "";
  return text.length > len ? text.substring(0, len) + "..." : text;
}

// 批量启用/禁用
function handleBatchEnable(enabled: boolean) {
  selectedRows.value.forEach((row) => {
    row.isEnabled = enabled;
  });
  customMessage.success(`已${enabled ? "启用" : "禁用"} ${selectedRows.value.length} 项`);
}

// 单个开关变更（主要为了触发响应式更新，虽然 v-model 应该够了）
function handleSingleEnableChange() {
  // no-op
}

// 批量删除
function handleBatchDelete() {
  const idsToDelete = new Set(selectedRows.value.map((r) => r.id));

  // 过滤掉不可删除的锚点
  const anchorsCount = selectedRows.value.filter((r) => isAnchorType(r.type)).length;
  if (anchorsCount > 0) {
    customMessage.warning(`${anchorsCount} 个锚点消息不可删除，已跳过`);
  }

  localData.value = localData.value.filter((item) => {
    if (idsToDelete.has(item.id)) {
      // 如果是锚点，保留
      if (isAnchorType(item.type)) return true;
      return false;
    }
    return true;
  });

  selectedRows.value = []; // 清空选择
  customMessage.success("删除成功");
}

// 核心：移动逻辑
function handleMoveTo(position: "top" | "bottom") {
  if (selectedRows.value.length === 0) return;

  // 1. 提取选中项
  const selectedIds = new Set(selectedRows.value.map((r) => r.id));
  const itemsToMove = localData.value.filter((r) => selectedIds.has(r.id));
  const remainingItems = localData.value.filter((r) => !selectedIds.has(r.id));

  // 2. 重新组合
  if (position === "top") {
    localData.value = [...itemsToMove, ...remainingItems];
  } else {
    localData.value = [...remainingItems, ...itemsToMove];
  }

  customMessage.success(`已移动 ${itemsToMove.length} 项到${position === "top" ? "顶部" : "底部"}`);
}

function handleMoveToSpecific() {
  // 目标行号对应的原始数据
  const targetRow = localData.value[targetIndexInput.value - 1];
  if (!targetRow) return;

  const selectedIds = new Set(selectedRows.value.map((r) => r.id));
  const itemsToMove = localData.value.filter((r) => selectedIds.has(r.id));
  const remainingItems = localData.value.filter((r) => !selectedIds.has(r.id));

  // 在剩余项中找到目标行的位置
  let insertIndex = remainingItems.findIndex((r) => r.id === targetRow.id);

  if (insertIndex === -1) {
    // 如果目标行本身就在选中项中，则尝试寻找最近的非选中行
    // 但为了逻辑简单，如果目标行被选中，我们默认移动到它在剩余列表中的相对位置
    insertIndex = Math.min(targetIndexInput.value - 1, remainingItems.length);
  } else if (movePosition.value === "after") {
    insertIndex += 1;
  }

  const newOrder = [...remainingItems];
  newOrder.splice(insertIndex, 0, ...itemsToMove);

  localData.value = newOrder;
  showMovePopover.value = false;
  customMessage.success(
    `已移动到第 ${targetIndexInput.value} 行${movePosition.value === "before" ? "之前" : "之后"}`
  );
}

function handleSave() {
  emit("save", localData.value);
  visible.value = false;
}
</script>

<style scoped>
.batch-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: var(--el-fill-color-light);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.selection-info {
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.selection-info .count {
  font-weight: bold;
  color: var(--el-color-primary);
  margin: 0 4px;
}

.actions {
  display: flex;
  gap: 12px;
  transition: opacity 0.3s;
}

.actions.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.table-container {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.index-badge {
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.content-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.anchor-badge {
  color: var(--el-color-warning);
  font-weight: bold;
  font-size: 12px;
  flex-shrink: 0;
}

.content-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.content-text.is-placeholder {
  color: var(--el-text-color-secondary);
  font-style: italic;
}

.move-popover-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}

.quick-anchors {
  border-top: 1px solid var(--border-color);
  padding-top: 8px;
}

.anchor-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.anchor-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.anchor-tag {
  cursor: pointer;
}

.popover-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
</style>

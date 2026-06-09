<template>
  <div class="preset-group-panel">
    <!-- 面板头部 -->
    <div class="panel-header" @click="isCollapsed = !isCollapsed">
      <div class="panel-title">
        <el-icon :class="{ 'is-collapsed': isCollapsed }"
          ><ArrowDown
        /></el-icon>
        <span>预设消息组 ({{ presetGroups.length }})</span>
      </div>
      <el-button type="primary" size="small" @click.stop="handleNewGroup">
        <el-icon><Plus /></el-icon>新建组
      </el-button>
    </div>

    <el-collapse-transition>
      <div v-show="!isCollapsed" class="groups-container">
        <div v-if="presetGroups.length === 0" class="empty-groups">
          暂无分组，点击"新建组"创建
        </div>

        <div
          v-for="group in presetGroups"
          :key="group.id"
          class="group-card"
          :class="{ disabled: !group.enabled }"
        >
          <!-- 组头 -->
          <div class="group-header">
            <div class="group-header-left" @click="toggleExpand(group.id)">
              <el-icon :class="{ 'is-expanded': expandedGroups.has(group.id) }">
                <ArrowRight />
              </el-icon>
              <span class="group-name">{{ group.name }}</span
              ><el-tag
                size="small"
                :type="group.selectionMode === 'radio' ? 'warning' : 'info'"
                effect="plain"
              >
                {{ group.selectionMode === "radio" ? "单选" : "多选" }}
              </el-tag>
              <el-tag size="small" type="info" effect="plain">
                {{ getGroupMsgCount(group.id) }} 条
              </el-tag>
            </div>
            <div class="group-header-actions" @click.stop>
              <el-switch
                v-model="group.enabled"
                size="small"
                @change="handleToggleEnabled(group)"
              />
              <el-button link size="small" @click="handleEditGroup(group)">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button
                link
                size="small"
                type="danger"
                @click="handleDeleteGroup(group)"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>

          <!-- 展开内容 -->
          <el-collapse-transition>
            <div v-show="expandedGroups.has(group.id)" class="group-content">
              <!-- 组内消息列表 -->
              <div
                v-for="msg in getGroupMessages(group.id)"
                :key="msg.id"
                class="group-msg-item"
                :class="{ 'is-disabled': !group.enabled }"
                @click="handleToggleMessage(group, msg)"
              >
                <span class="role-dot" :class="'role-' + msg.role" />
                <span class="msg-label">
                  {{ msg.name || truncate(msg.content) }}
                </span>

                <!-- 自定义选择器 -->
                <div
                  class="custom-selector"
                  :class="{
                    'is-active': msg.isEnabled,
                    'is-radio': group.selectionMode === 'radio',
                    'is-disabled': !group.enabled,
                  }"
                >
                  <div v-if="msg.isEnabled" class="selector-indicator">
                    <el-icon
                      v-if="group.selectionMode !== 'radio'"
                      class="check-icon"
                    >
                      <Check />
                    </el-icon>
                    <span v-else class="radio-dot" />
                  </div>
                </div>

                <el-tooltip
                  content="编辑消息"
                  placement="top"
                  :show-after="400"
                >
                  <el-button
                    link
                    size="small"
                    @click.stop="emit('edit-message', msg)"
                  >
                    <el-icon><Edit /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="移出组" placement="top" :show-after="400">
                  <el-button
                    link
                    size="small"
                    @click.stop="handleRemoveFromGroup(msg)"
                  >
                    <el-icon><Close /></el-icon>
                  </el-button>
                </el-tooltip>
              </div>
              <div
                v-if="getGroupMessages(group.id).length === 0"
                class="group-empty"
              >
                此组暂无消息
              </div>

              <!-- 加入消息选择器 -->
              <div v-if="ungroupedMessages.length > 0" class="group-add-msg">
                <el-select
                  v-model="addMsgTargets[group.id]"
                  placeholder="+ 将消息加入此组"
                  size="small"
                  filterable
                  clearable
                  class="add-msg-select"
                  @change="(val: string) => handleAddMessage(group, val)"
                >
                  <el-option
                    v-for="msg in ungroupedMessages"
                    :key="msg.id"
                    :label="msg.name || truncate(msg.content)"
                    :value="msg.id"
                  />
                </el-select>
              </div>
            </div>
          </el-collapse-transition>
        </div>
      </div>
    </el-collapse-transition>

    <!-- 组编辑弹窗 -->
    <PresetGroupEditDialog
      v-model:visible="editDialogVisible"
      :group="editingGroup"
      @save="handleSaveGroup"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, h } from "vue";
import { ElMessageBox } from "element-plus";
import {
  ArrowDown,
  ArrowRight,
  Plus,
  Edit,
  Delete,
  Close,
  Check,
} from "@element-plus/icons-vue";
import type { ChatMessageNode } from "../../../types";
import type { PresetMessageGroup } from "../../../types/agent";
import { customMessage } from "@/utils/customMessage";
import PresetGroupEditDialog from "./PresetGroupEditDialog.vue";
import { applyPresetGroupEnabledState } from "./presetGroupState";

interface Props {
  presetGroups: PresetMessageGroup[];
  localMessages: ChatMessageNode[];
}

interface Emits {
  (e: "update:presetGroups", groups: PresetMessageGroup[]): void;
  (e: "update:localMessages", messages: ChatMessageNode[]): void;
  (e: "sync"): void;
  (e: "edit-message", msg: ChatMessageNode): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const isCollapsed = ref(false);
const expandedGroups = reactive(new Set<string>());
const editDialogVisible = ref(false);
const editingGroup = ref<PresetMessageGroup | null>(null);
const addMsgTargets = reactive<Record<string, string>>({});

function toggleExpand(groupId: string) {
  if (expandedGroups.has(groupId)) expandedGroups.delete(groupId);
  else expandedGroups.add(groupId);
}

const ungroupedMessages = computed(() =>
  props.localMessages.filter(
    (msg) => !msg.groupId && (!msg.type || msg.type === "message")
  )
);

function getGroupMessages(groupId: string) {
  return props.localMessages.filter((msg) => msg.groupId === groupId);
}

function getGroupMsgCount(groupId: string) {
  return getGroupMessages(groupId).length;
}

function truncate(text: string, max = 45): string {
  if (!text) return "(空内容)";
  const s = text.replace(/\s+/g, " ").trim();
  return s.length <= max ? s : s.slice(0, max) + "...";
}

// ── 组管理 ──

function handleNewGroup() {
  editingGroup.value = null;
  editDialogVisible.value = true;
}

function handleEditGroup(group: PresetMessageGroup) {
  editingGroup.value = group;
  editDialogVisible.value = true;
}

function handleSaveGroup(
  data: Omit<PresetMessageGroup, "id"> & { id?: string }
) {
  if (data.id) {
    emit(
      "update:presetGroups",
      props.presetGroups.map((g) => (g.id === data.id ? { ...g, ...data } : g))
    );
  } else {
    const newGroup: PresetMessageGroup = {
      id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: data.name,
      description: data.description,
      selectionMode: data.selectionMode,
      enabled: data.enabled,
    };
    emit("update:presetGroups", [...props.presetGroups, newGroup]);
    customMessage.success(`已创建组"${newGroup.name}"`);
  }
}

function handleToggleEnabled(group: PresetMessageGroup) {
  applyPresetGroupEnabledState(group, props.localMessages);
  emit("sync");
}

async function handleDeleteGroup(group: PresetMessageGroup) {
  try {
    await ElMessageBox.confirm(
      h("div", null, [
        h("p", null, `确定要删除预设组 "${group.name}" 吗？`),
        h(
          "p",
          {
            style:
              "color:var(--el-color-danger);margin-top:8px;font-size:12px;",
          },
          "注意：此操作不可撤销。"
        ),
      ]),
      "删除预设组",
      {
        confirmButtonText: "仅解散组",
        cancelButtonText: "彻底删除组及消息",
        distinguishCancelAndClose: true,
        type: "warning",
        lockScroll: false,
      }
    )
      .then(() => {
        // 仅解散：清除 groupId 保留消息
        props.localMessages.forEach((msg) => {
          if (msg.groupId === group.id) {
            msg.groupId = undefined;
            if (msg.metadata) delete msg.metadata.lastEnabledState;
          }
        });
        emit(
          "update:presetGroups",
          props.presetGroups.filter((g) => g.id !== group.id)
        );
        emit("sync");
        customMessage.success("已解散预设组");
        expandedGroups.delete(group.id);
      })
      .catch((action) => {
        if (action === "cancel") {
          // 彻底删除：连消息一起删
          emit(
            "update:localMessages",
            props.localMessages.filter((msg) => msg.groupId !== group.id)
          );
          emit(
            "update:presetGroups",
            props.presetGroups.filter((g) => g.id !== group.id)
          );
          emit("sync");
          customMessage.success("已彻底删除组及组内消息");
          expandedGroups.delete(group.id);
        }
      });
  } catch {
    /* close */
  }
}

// ── 组内消息操作 ──

function handleToggleMessage(group: PresetMessageGroup, msg: ChatMessageNode) {
  if (!group.enabled) return;
  if (group.selectionMode === "radio") {
    if (!msg.isEnabled) {
      handleRadioInGroup(group, msg);
    }
  } else {
    msg.isEnabled = !msg.isEnabled;
    emit("sync");
  }
}

function handleRadioInGroup(
  group: PresetMessageGroup,
  targetMsg: ChatMessageNode
) {
  props.localMessages.forEach((msg) => {
    if (msg.groupId === group.id) {
      msg.isEnabled = msg.id === targetMsg.id;
      if (msg.metadata) delete msg.metadata.lastEnabledState;
    }
  });
  emit("sync");
}

function handleRemoveFromGroup(msg: ChatMessageNode) {
  msg.groupId = undefined;
  if (msg.metadata) delete msg.metadata.lastEnabledState;
  emit("sync");
}

function handleAddMessage(group: PresetMessageGroup, msgId: string) {
  if (!msgId) return;
  const msg = props.localMessages.find((m) => m.id === msgId);
  if (!msg) return;
  msg.groupId = group.id;
  if (!group.enabled && msg.isEnabled !== false) {
    msg.isEnabled = false;
    if (!msg.metadata) msg.metadata = {} as any;
    msg.metadata!.lastEnabledState = true;
  }
  if (group.selectionMode === "radio") {
    handleRadioInGroup(group, msg);
  } else {
    emit("sync");
  }
  addMsgTargets[group.id] = "";
  customMessage.success(`已将消息加入组"${group.name}"`);
}
</script>

<style scoped>
.preset-group-panel {
  border-bottom: var(--border-width) solid var(--border-color);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  user-select: none;
}

.panel-header:hover {
  background-color: var(--el-fill-color-light);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}

.panel-title .el-icon {
  transition: transform 0.3s ease;
}

.panel-title .el-icon.is-collapsed {
  transform: rotate(-90deg);
}

.groups-container {
  padding: 0 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.empty-groups {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  padding: 8px 4px;
}

.group-card {
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
  overflow: hidden;
}

.group-card.disabled {
  opacity: 0.6;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 10px;
}

.group-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  flex: 1;
  min-width: 0;
}

.group-header-left .el-icon {
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.group-header-left .el-icon.is-expanded {
  transform: rotate(90deg);
}

.group-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.group-content {
  border-top: var(--border-width) solid var(--border-color);
  padding: 6px 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--input-bg);
}

.group-msg-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.group-msg-item.is-disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.group-msg-item:not(.is-disabled):hover {
  background: var(--el-fill-color-light);
}

/* 自定义选择器样式 */
.custom-selector {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--el-border-color-darker);
  background-color: var(--input-bg);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

/* 单选框为圆形 */
.custom-selector.is-radio {
  border-radius: 50%;
}

/* 多选框为圆角矩形 */
.custom-selector:not(.is-radio) {
  border-radius: 3px;
}

/* 悬停效果 */
.group-msg-item:not(.is-disabled):hover .custom-selector {
  border-color: var(--el-color-primary);
}

/* 激活状态 */
.custom-selector.is-active {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary);
}

/* 激活状态下的指示器 */
.selector-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

/* 单选框中心的白点 */
.radio-dot {
  width: 6px;
  height: 6px;
  background-color: #fff;
  border-radius: 50%;
}

/* 多选框中心的对勾 */
.check-icon {
  color: #fff;
  font-size: 10px;
  font-weight: bold;
}

/* 禁用状态 */
.custom-selector.is-disabled {
  border-color: var(--el-border-color);
  background-color: var(--el-fill-color-light);
}

.custom-selector.is-disabled.is-active {
  background-color: var(--el-text-color-placeholder);
  border-color: var(--el-text-color-placeholder);
}

.role-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.role-dot.role-system {
  background-color: var(--el-color-info);
}

.role-dot.role-user {
  background-color: var(--el-color-primary);
}

.role-dot.role-assistant {
  background-color: var(--el-color-success);
}

.role-dot.role-tool {
  background-color: var(--el-color-warning);
}

.msg-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-regular);
}

.group-empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 4px 6px;
}

.group-add-msg {
  margin-top: 4px;
  padding-top: 6px;
  border-top: var(--border-width) solid var(--border-color);
  border-top-style: dashed;
}

.add-msg-select {
  width: 100%;
}

.el-button {
  margin: 0;
}
</style>

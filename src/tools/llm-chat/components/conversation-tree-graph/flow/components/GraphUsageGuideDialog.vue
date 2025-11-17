<template>
  <BaseDialog v-model="isDialogVisible" title="会话关系图使用说明" width="70vw">
    <div class="usage-guide-content">
      <h3>基本操作</h3>
      <ul>
        <li>
          <strong>缩放/平移:</strong> 使用鼠标滚轮缩放视图，按住鼠标中键或空白处拖拽平移画布。
        </li>
        <li>
          <strong>重置视图:</strong>
          点击右下角的控制器或顶部的“重置布局”按钮可将视图恢复到初始状态。
        </li>
        <li>
          <strong>查看节点详情:</strong>
          双击节点或点击节点上的“详情”按钮，可以查看该消息的详细信息。
        </li>
      </ul>

      <h3>布局模式</h3>
      <p>关系图支持两种布局模式，可通过顶部按钮切换：</p>
      <ul>
        <li>
          <strong
            >树状布局 ( <el-icon><Grid /></el-icon> 默认):</strong
          >
          严格按照对话的父子关系进行分层排列，结构清晰。此模式下节点位置基本固定，可以拖拽移动。
        </li>
        <li>
          <strong
            >力导向图 ( <el-icon><Share /></el-icon> ):</strong
          >
          节点之间像有物理连线一样，可以拖拽和观察其动态效果。此模式下，拖拽节点会暂时固定其位置，释放后会恢复物理模拟。
        </li>
      </ul>

      <h3>节点交互</h3>
      <ul>
        <li>
          <strong>拖拽节点:</strong> 在任意布局模式下，都可以拖拽节点。拖拽时按住
          <code>{{ dragSubtreeKey }}</code> 键可以拖动整个子树。
        </li>
        <li>
          <strong>嫁接单个节点 (默认):</strong>
          从一个节点的底部连接点拖拽出一条线，连接到另一个节点的顶部连接点，即可将该节点移动到新父节点下。其原有的子节点将被其旧的父节点“收养”。
        </li>
        <li>
          <strong>嫁接整个子树:</strong> 按住
          <code>{{ graftSubtreeKey }}</code>
          键的同时进行连线操作，会将当前节点及其所有子孙节点一起移动到新的父节点下。
        </li>
        <li><strong>右键菜单:</strong> 右键点击节点可进行复制、禁用/启用、删除等操作。</li>
      </ul>
      <h3>历史记录</h3>
      <ul>
        <li>
          <strong>撤销/重做:</strong> 点击顶部的 <el-icon><ArrowLeft /></el-icon> 和
          <el-icon><ArrowRight /></el-icon> 按钮可以撤销或重做操作。快捷键默认为
          <code>{{ undoKey }}</code> 和 <code>{{ redoKey }}</code
          >。
        </li>
        <li>
          <strong>操作历史面板:</strong> 点击
          <el-icon><Timer /></el-icon> 按钮可以查看详细的操作历史记录，并跳转到任意历史状态。
        </li>
      </ul>

      <h3>调试模式</h3>
      <p>如需使用调试功能，请先在“聊天设置” -> “开发者选项”中开启“启用调试模式”。</p>
      <p>
        开启后，关系图顶部会显示调试工具按钮。点击
        <el-icon><View /></el-icon> 按钮可开启调试叠加层，显示 D3.js
        物理引擎的实时模拟状态，包括节点速度、受力等信息，主要用于开发和排错。
      </p>

      <h3>快捷键配置</h3>
      <p>所有交互快捷键（如拖拽、嫁接、撤销、重做等）均可在“聊天设置” -> “快捷键”中进行自定义。</p>
    </div>
    <template #footer>
      <span class="dialog-footer">
        <el-button type="primary" @click="$emit('update:visible', false)">我明白了</el-button>
      </span>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Grid, Share, View, ArrowLeft, ArrowRight, Timer } from "@element-plus/icons-vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { useChatSettings } from "../../../../composables/useChatSettings";

const { settings } = useChatSettings();

const formatModifierKey = (key: "shift" | "alt" | "ctrl" | "none") => {
  if (key === "shift") return "Shift";
  if (key === "alt") return "Alt";
  if (key === "ctrl") return "Ctrl/Cmd";
  if (key === "none") return "无";
  return key;
};

const dragSubtreeKey = computed(() =>
  formatModifierKey(settings.value.graphViewShortcuts.dragSubtree)
);
const graftSubtreeKey = computed(() =>
  formatModifierKey(settings.value.graphViewShortcuts.graftSubtree)
);

const formatShortcutDisplay = (shortcut: string): string => {
  if (shortcut === "none") return "无";

  const parts = shortcut.split("+");
  return parts
    .map((part) => {
      const normalized = part.toLowerCase();
      if (normalized === "ctrl" || normalized === "cmd") return "Ctrl/Cmd";
      if (normalized === "shift") return "Shift";
      if (normalized === "alt") return "Alt";
      if (normalized === "backspace") return "Backspace";
      return part.toUpperCase();
    })
    .join(" + ");
};

const undoKey = computed(() => formatShortcutDisplay(settings.value.shortcuts.undo));
const redoKey = computed(() => formatShortcutDisplay(settings.value.shortcuts.redo));

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
}>();

const isDialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit("update:visible", val),
});
</script>

<style scoped>
.usage-guide-content {
  padding: 0 10px;
  max-height: 60vh;
  overflow-y: auto;
}

.usage-guide-content h3 {
  font-size: 16px;
  margin-top: 16px;
  margin-bottom: 8px;
  border-left: 3px solid var(--el-color-primary);
  padding-left: 8px;
}

.usage-guide-content ul {
  padding-left: 20px;
  line-height: 1.8;
}

.usage-guide-content li {
  margin-bottom: 8px;
}

.usage-guide-content .el-icon {
  vertical-align: middle;
  margin: 0 2px;
}

.usage-guide-content code {
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 2px 6px;
  font-family: "Cascadia Code", monospace;
}
</style>

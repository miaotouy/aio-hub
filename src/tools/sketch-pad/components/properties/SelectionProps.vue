<template>
  <div class="selection-props">
    <!-- 多选模式 -->
    <SelectionMultiProps
      v-if="selectionInfo.count > 1"
      :count="selectionInfo.count"
      :common-props="selectionInfo.commonProps"
      @align="(dir) => emit('align', dir)"
      @distribute="(dir) => emit('distribute', dir)"
      @update-common="(key, val) => emit('update-prop', key, val)"
      @delete="emit('delete-selected')"
    />

    <!-- 单选模式：根据对象类型渲染对应编辑器 -->
    <template v-else-if="selectionInfo.singleObject">
      <SelectionRectProps
        v-if="selectionInfo.singleObject.type === 'rect'"
        :obj="selectionInfo.singleObject as RectObject"
        @update-prop="(key, val) => emit('update-prop', key, val)"
      />
      <SelectionEllipseProps
        v-else-if="selectionInfo.singleObject.type === 'ellipse'"
        :obj="selectionInfo.singleObject as EllipseObject"
        @update-prop="(key, val) => emit('update-prop', key, val)"
      />
      <SelectionLineProps
        v-else-if="selectionInfo.singleObject.type === 'line'"
        :obj="selectionInfo.singleObject as LineObject"
        @update-prop="(key, val) => emit('update-prop', key, val)"
      />
      <SelectionArrowProps
        v-else-if="selectionInfo.singleObject.type === 'arrow'"
        :obj="selectionInfo.singleObject as ArrowObject"
        @update-prop="(key, val) => emit('update-prop', key, val)"
      />
      <SelectionTextProps
        v-else-if="selectionInfo.singleObject.type === 'text'"
        :obj="selectionInfo.singleObject as TextObject"
        @update-prop="(key, val) => emit('update-prop', key, val)"
      />
      <SelectionImageProps
        v-else-if="selectionInfo.singleObject.type === 'image'"
        :obj="selectionInfo.singleObject as ImageObject"
        @update-prop="(key, val) => emit('update-prop', key, val)"
        @update-props="(data) => emit('update-props', data)"
      />
    </template>

    <!-- 删除按钮（单选时也显示） -->
    <div v-if="selectionInfo.count === 1" class="property-item delete-section">
      <button class="delete-btn" @click="emit('delete-selected')">
        <Trash2 :size="14" />
        删除选中
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Trash2 } from "lucide-vue-next";
import type {
  SelectionInfo,
  RectObject,
  EllipseObject,
  LineObject,
  ArrowObject,
  TextObject,
  ImageObject,
} from "../../types";
import SelectionMultiProps from "./SelectionMultiProps.vue";
import SelectionRectProps from "./SelectionRectProps.vue";
import SelectionEllipseProps from "./SelectionEllipseProps.vue";
import SelectionLineProps from "./SelectionLineProps.vue";
import SelectionArrowProps from "./SelectionArrowProps.vue";
import SelectionTextProps from "./SelectionTextProps.vue";
import SelectionImageProps from "./SelectionImageProps.vue";

defineProps<{
  selectionInfo: SelectionInfo;
}>();

const emit = defineEmits<{
  (e: "update-prop", key: string, value: any): void;
  (e: "update-props", data: Record<string, any>): void;
  (e: "align", direction: "left" | "right" | "top" | "bottom" | "center-h" | "center-v"): void;
  (e: "distribute", direction: "horizontal" | "vertical"): void;
  (e: "delete-selected"): void;
}>();
</script>

<style scoped>
.selection-props {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.delete-section {
  margin-top: 4px;
}

.property-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  padding: 7px;
  border: none;
  border-radius: 7px;
  background: rgba(var(--el-color-danger-rgb, 245, 108, 108), 0.15);
  color: var(--el-color-danger);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.delete-btn:hover {
  background: rgba(var(--el-color-danger-rgb, 245, 108, 108), 0.25);
}
</style>

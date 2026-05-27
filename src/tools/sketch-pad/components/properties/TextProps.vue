<template>
  <div class="property-group">
    <div class="property-item">
      <span class="label">字体</span>
      <el-select
        :model-value="fontFamily"
        size="small"
        filterable
        placeholder="选择字体"
        @update:model-value="(v: any) => emitUpdate({ fontFamily: v })"
      >
        <el-option-group label="预设字体">
          <el-option
            v-for="font in FONT_PRESETS"
            :key="font.value"
            :label="font.label"
            :value="font.value"
            :style="{ fontFamily: font.value }"
          />
        </el-option-group>
        <el-option-group v-if="systemFonts.length > 0" label="系统字体">
          <el-option
            v-for="font in systemFonts"
            :key="font"
            :label="font"
            :value="font"
            :style="{ fontFamily: font }"
          />
        </el-option-group>
      </el-select>
    </div>

    <PropertySlider
      label="字号"
      :model-value="fontSize"
      :min="12"
      :max="120"
      @update:model-value="(v) => emitUpdate({ fontSize: v })"
    />

    <PropertyColorPicker
      label="颜色"
      :model-value="textColor"
      @update:model-value="(v) => emitUpdate({ color: v })"
    />

    <div class="property-item">
      <span class="label">样式</span>
      <div class="style-buttons">
        <button
          class="style-btn"
          :class="{ active: localBold }"
          @click="toggleBold"
        >
          B
        </button>
        <button
          class="style-btn italic"
          :class="{ active: localItalic }"
          @click="toggleItalic"
        >
          I
        </button>
      </div>
    </div>

    <div class="property-item">
      <span class="label">对齐</span>
      <div class="align-buttons">
        <button
          class="style-btn"
          :class="{ active: localAlign === 'left' }"
          @click="setAlign('left')"
        >
          <AlignLeft :size="14" />
        </button>
        <button
          class="style-btn"
          :class="{ active: localAlign === 'center' }"
          @click="setAlign('center')"
        >
          <AlignCenter :size="14" />
        </button>
        <button
          class="style-btn"
          :class="{ active: localAlign === 'right' }"
          @click="setAlign('right')"
        >
          <AlignRight :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { AlignLeft, AlignCenter, AlignRight } from "lucide-vue-next";
import PropertySlider from "./PropertySlider.vue";
import PropertyColorPicker from "./PropertyColorPicker.vue";
import { useSystemFonts } from "../../composables/useSystemFonts";
import { FONT_PRESETS } from "../../constants";

const props = defineProps<{
  fontSize: number;
  fontFamily: string;
  textColor: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
}>();

const emit = defineEmits<{
  (
    e: "update",
    data: {
      fontSize?: number;
      fontFamily?: string;
      color?: string;
      fontWeight?: "normal" | "bold";
      fontStyle?: "normal" | "italic";
      textAlign?: "left" | "center" | "right";
    }
  ): void;
}>();

const { systemFonts, loadSystemFonts } = useSystemFonts();

onMounted(() => {
  loadSystemFonts();
});

const localBold = ref(props.fontWeight === "bold");
const localItalic = ref(props.fontStyle === "italic");
const localAlign = ref<"left" | "center" | "right">(props.textAlign || "left");

watch(
  () => props.fontWeight,
  (v) => {
    localBold.value = v === "bold";
  }
);
watch(
  () => props.fontStyle,
  (v) => {
    localItalic.value = v === "italic";
  }
);
watch(
  () => props.textAlign,
  (v) => {
    if (v) localAlign.value = v;
  }
);

function emitUpdate(data: Record<string, any>) {
  emit("update", data as any);
}

function toggleBold() {
  localBold.value = !localBold.value;
  emitUpdate({ fontWeight: localBold.value ? "bold" : "normal" });
}

function toggleItalic() {
  localItalic.value = !localItalic.value;
  emitUpdate({ fontStyle: localItalic.value ? "italic" : "normal" });
}

function setAlign(align: "left" | "center" | "right") {
  localAlign.value = align;
  emitUpdate({ textAlign: align });
}
</script>

<style scoped>
.property-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.property-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.style-buttons,
.align-buttons {
  display: flex;
  gap: 4px;
}

.style-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: rgba(var(--primary-color-rgb), 0.06);
  color: var(--el-text-color-regular);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.12s;
}

.style-btn.italic {
  font-style: italic;
}

.style-btn:hover {
  background: rgba(var(--primary-color-rgb), 0.12);
}

.style-btn.active {
  background: var(--primary-color);
  color: #fff;
}
</style>

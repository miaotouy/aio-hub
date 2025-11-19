<template>
  <div class="style-item-editor">
    <!-- 预览区域 -->
    <div v-if="previewText" class="preview-section">
      <div class="preview-header">
        <span class="preview-label">效果预览</span>
      </div>
      <div class="preview-viewport">
        <component
          :is="previewTag || 'div'"
          class="preview-content"
          :class="{ 'is-block': isBlock }"
          :style="previewStyle"
        >
          {{ previewText }}
        </component>
      </div>
    </div>

    <el-form label-position="top" size="small">
      <el-row :gutter="16">
        <!-- 1. 文本颜色 -->
        <el-col :xs="24" :sm="12" :md="8" :lg="6" :xl="4">
          <el-form-item label="文本颜色">
            <div class="color-picker-row">
              <el-color-picker v-model="localValue.color" show-alpha size="small" />
              <el-input v-model="localValue.color" placeholder="继承默认" size="small" clearable />
            </div>
          </el-form-item>
        </el-col>

        <!-- 2. 背景颜色 -->
        <el-col :xs="24" :sm="12" :md="8" :lg="6" :xl="4">
          <el-form-item label="背景颜色">
            <div class="color-picker-row">
              <el-color-picker v-model="localValue.backgroundColor" show-alpha size="small" />
              <el-input
                v-model="localValue.backgroundColor"
                placeholder="无背景"
                size="small"
                clearable
              />
            </div>
          </el-form-item>
        </el-col>

        <!-- 3. 字体粗细 -->
        <el-col :xs="24" :sm="12" :md="8" :lg="6" :xl="4">
          <el-form-item label="字体粗细">
            <el-select v-model="localValue.fontWeight" placeholder="默认" clearable size="small">
              <el-option label="默认" value="" />
              <el-option label="正常 (400)" value="400" />
              <el-option label="粗体 (600)" value="600" />
              <el-option label="特粗 (800)" value="800" />
            </el-select>
          </el-form-item>
        </el-col>

        <!-- 4. 字体样式 -->
        <el-col :xs="24" :sm="12" :md="8" :lg="6" :xl="4">
          <el-form-item label="字体样式">
            <el-select v-model="localValue.fontStyle" placeholder="默认" clearable size="small">
              <el-option label="默认" value="" />
              <el-option label="正常" value="normal" />
              <el-option label="斜体" value="italic" />
            </el-select>
          </el-form-item>
        </el-col>

        <!-- 5. 文本装饰 -->
        <el-col :xs="24" :sm="12" :md="8" :lg="6" :xl="4">
          <el-form-item label="文本装饰">
            <el-select
              v-model="localValue.textDecoration"
              placeholder="默认"
              clearable
              size="small"
            >
              <el-option label="默认" value="" />
              <el-option label="无" value="none" />
              <el-option label="下划线" value="underline" />
              <el-option label="删除线" value="line-through" />
            </el-select>
          </el-form-item>
        </el-col>

        <!-- 6. 边框颜色 (Moved up to group with simple items) -->
        <el-col :xs="24" :sm="12" :md="8" :lg="6" :xl="4">
          <el-form-item label="边框颜色">
            <div class="color-picker-row">
              <el-color-picker v-model="localValue.borderColor" show-alpha size="small" />
              <el-input
                v-model="localValue.borderColor"
                placeholder="无边框"
                size="small"
                clearable
              />
            </div>
          </el-form-item>
        </el-col>

        <!-- 7. 文本发光 (Complex) -->
        <el-col :xs="24" :sm="24" :md="12" :lg="12" :xl="8">
          <el-form-item label="文本发光 (Text Shadow)">
            <div class="shadow-editor">
              <div class="shadow-inputs">
                <el-input v-model="textShadowValues.offsetX" size="small" placeholder="X" />
                <el-input v-model="textShadowValues.offsetY" size="small" placeholder="Y" />
                <el-input v-model="textShadowValues.blur" size="small" placeholder="模糊" />
              </div>
              <div class="color-picker-row">
                <el-color-picker
                  v-model="textShadowValues.color"
                  show-alpha
                  size="small"
                  @change="(v: string | null) => (textShadowValues.color = v || '')"
                />
                <el-input
                  v-model="textShadowValues.color"
                  placeholder="颜色"
                  size="small"
                  clearable
                />
              </div>
            </div>
          </el-form-item>
        </el-col>

        <!-- 8. 圆角 (Complex) -->
        <el-col :xs="24" :sm="24" :md="12" :lg="12" :xl="8">
          <el-form-item label="圆角 (Border Radius)">
            <div class="border-radius-editor">
              <el-radio-group v-model="borderRadiusMode" size="small" class="radius-mode-group">
                <el-tooltip content="统一设置" placement="top">
                  <el-radio-button value="uniform">统一</el-radio-button>
                </el-tooltip>
                <el-tooltip content="左右不同" placement="top">
                  <el-radio-button value="horizontal">左右</el-radio-button>
                </el-tooltip>
                <el-tooltip content="上下不同" placement="top">
                  <el-radio-button value="vertical">上下</el-radio-button>
                </el-tooltip>
                <el-tooltip content="对角交错" placement="top">
                  <el-radio-button value="cross">交错</el-radio-button>
                </el-tooltip>
                <el-tooltip content="分别设置" placement="top">
                  <el-radio-button value="custom">自定义</el-radio-button>
                </el-tooltip>
              </el-radio-group>
              <div class="radius-inputs-grid">
                <el-input v-model="borderRadiusValues.tl" size="small" placeholder="左上" />
                <el-input
                  v-model="borderRadiusValues.tr"
                  size="small"
                  placeholder="右上"
                  :disabled="isTrDisabled"
                />
                <el-input
                  v-model="borderRadiusValues.bl"
                  size="small"
                  placeholder="左下"
                  :disabled="isBlDisabled"
                />
                <el-input
                  v-model="borderRadiusValues.br"
                  size="small"
                  placeholder="右下"
                  :disabled="isBrDisabled"
                />
              </div>
            </div>
          </el-form-item>
        </el-col>

        <!-- 9. 盒阴影 (Complex) -->
        <el-col :xs="24" :sm="24" :md="24" :lg="12" :xl="8">
          <el-form-item label="盒阴影 (Box Shadow)">
            <div class="shadow-editor">
              <div class="shadow-inputs shadow-inputs-box">
                <el-input v-model="boxShadowValues.offsetX" size="small" placeholder="X" />
                <el-input v-model="boxShadowValues.offsetY" size="small" placeholder="Y" />
                <el-input v-model="boxShadowValues.blur" size="small" placeholder="模糊" />
                <el-input v-model="boxShadowValues.spread" size="small" placeholder="扩散" />
              </div>
              <div class="shadow-controls">
                <div class="color-picker-row">
                  <el-color-picker
                    v-model="boxShadowValues.color"
                    show-alpha
                    size="small"
                    @change="(v: string | null) => (boxShadowValues.color = v || '')"
                  />
                  <el-input
                    v-model="boxShadowValues.color"
                    placeholder="颜色"
                    size="small"
                    clearable
                  />
                </div>
                <el-checkbox v-model="boxShadowValues.inset">内阴影</el-checkbox>
              </div>
            </div>
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { watch, reactive, ref, computed, nextTick } from "vue";
import type { MarkdownStyleOption } from "../../types";

const props = defineProps<{
  modelValue?: MarkdownStyleOption;
  previewText?: string;
  isBlock?: boolean;
  previewTag?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: MarkdownStyleOption): void;
}>();

const localValue = reactive<MarkdownStyleOption>({});

const addUnit = (val: string) => {
  if (!val) return "0";
  const v = val.trim();
  if (v === "0") return "0";
  // 如果是纯数字（允许负号和小数点），添加 px
  if (/^-?(\d+(\.\d*)?|\.\d+)$/.test(v)) {
    return `${v}px`;
  }
  return v;
};

const removePx = (val: string) => {
  if (!val) return "";
  // 仅当以 px 结尾且前面是数字时才移除
  return val.replace(/^(-?[\d.]+)px$/i, "$1");
};

// 计算预览样式
const previewStyle = computed(() => {
  const style: Record<string, string | number> = {};
  const v = localValue;

  if (v.color) style.color = v.color;
  if (v.backgroundColor) style.backgroundColor = v.backgroundColor;

  if (v.fontWeight) style.fontWeight = v.fontWeight;
  if (v.fontStyle) style.fontStyle = v.fontStyle;
  if (v.textDecoration) style.textDecoration = v.textDecoration;

  if (v.borderColor) {
    style.borderColor = v.borderColor;
    style.borderStyle = "solid";
    style.borderWidth = "1px";
  }
  if (v.borderRadius) {
    style.borderRadius = v.borderRadius;
    // 如果有圆角但没有边框和背景，添加一个虚线边框以便预览
    if (!v.borderColor && !v.backgroundColor) {
      style.border = "1px dashed var(--el-border-color)";
    }
  }

  if (v.textShadow) style.textShadow = v.textShadow;
  if (v.boxShadow) style.boxShadow = v.boxShadow;

  return style;
});

// --- 新增：高级圆角编辑器逻辑 ---
const borderRadiusMode = ref("uniform"); // uniform, horizontal, vertical, cross, custom
const borderRadiusValues = reactive({
  tl: "", // top-left
  tr: "", // top-right
  bl: "", // bottom-left
  br: "", // bottom-right
});
let isParsingBorderRadius = false; // 用于防止解析时触发回写的标志

// 根据模式计算输入框的禁用状态
const isTrDisabled = computed(
  () => borderRadiusMode.value === "uniform" || borderRadiusMode.value === "vertical"
);
const isBlDisabled = computed(
  () =>
    borderRadiusMode.value === "uniform" ||
    borderRadiusMode.value === "horizontal" ||
    borderRadiusMode.value === "cross"
);
const isBrDisabled = computed(() => borderRadiusMode.value !== "custom");

// 监听值的变化，根据模式同步更新其他输入框
watch(
  borderRadiusValues,
  (values) => {
    if (isParsingBorderRadius) return;
    const { tl, tr, bl } = values;
    switch (borderRadiusMode.value) {
      case "uniform":
        borderRadiusValues.tr = tl;
        borderRadiusValues.bl = tl;
        borderRadiusValues.br = tl;
        break;
      case "horizontal": // 左右
        borderRadiusValues.bl = tl;
        borderRadiusValues.br = tr;
        break;
      case "vertical": // 上下
        borderRadiusValues.tr = tl;
        borderRadiusValues.br = bl;
        break;
      case "cross": // 交错
        borderRadiusValues.bl = tr;
        borderRadiusValues.br = tl;
        break;
    }
  },
  { deep: true }
);

// 监听模式变化，强制同步一次值
watch(borderRadiusMode, () => {
  const { tl, tr, bl } = borderRadiusValues;
  switch (borderRadiusMode.value) {
    case "uniform":
      borderRadiusValues.tr = borderRadiusValues.bl = borderRadiusValues.br = tl;
      break;
    case "horizontal":
      borderRadiusValues.bl = tl;
      borderRadiusValues.br = tr;
      break;
    case "vertical":
      borderRadiusValues.tr = tl;
      borderRadiusValues.br = bl;
      break;
    case "cross":
      borderRadiusValues.bl = tr;
      borderRadiusValues.br = tl;
      break;
  }
});

// 将四个值组合成最终的 CSS 字符串
watch(
  borderRadiusValues,
  (v) => {
    if (isParsingBorderRadius) return;
    const { tl, tr, bl, br } = v;
    if (!tl && !tr && !bl && !br) {
      localValue.borderRadius = "";
      return;
    }
    const v_tl = addUnit(tl);
    const v_tr = addUnit(tr);
    const v_bl = addUnit(bl);
    const v_br = addUnit(br);

    // 优化：如果所有值都是 0 或空，则清空
    if (
      (v_tl === "0" || !tl) &&
      (v_tr === "0" || !tr) &&
      (v_bl === "0" || !bl) &&
      (v_br === "0" || !br)
    ) {
      localValue.borderRadius = "";
      return;
    }

    if (v_tl === v_tr && v_tl === v_bl && v_tl === v_br) {
      localValue.borderRadius = v_tl;
    } else if (v_tl === v_br && v_tr === v_bl) {
      localValue.borderRadius = `${v_tl} ${v_tr}`;
    } else if (v_tr === v_bl) {
      localValue.borderRadius = `${v_tl} ${v_tr} ${v_br}`;
    } else {
      localValue.borderRadius = `${v_tl} ${v_tr} ${v_br} ${v_bl}`;
    }
  },
  { deep: true }
);

// 解析外部传入的 borderRadius 字符串
watch(
  () => props.modelValue?.borderRadius,
  (newCss) => {
    // 如果内部生成的值和外部一致，则不进行解析，避免循环
    if (newCss === localValue.borderRadius) return;

    isParsingBorderRadius = true;
    if (!newCss) {
      Object.assign(borderRadiusValues, { tl: "", tr: "", bl: "", br: "" });
      borderRadiusMode.value = "uniform";
      nextTick(() => (isParsingBorderRadius = false));
      return;
    }

    const parts = newCss.trim().split(/\s+/);
    let tl = "",
      tr = "",
      br = "",
      bl = "";

    if (parts.length === 1) {
      tl = tr = br = bl = parts[0];
    } else if (parts.length === 2) {
      tl = br = parts[0];
      tr = bl = parts[1];
    } else if (parts.length === 3) {
      tl = parts[0];
      tr = bl = parts[1];
      br = parts[2];
    } else {
      tl = parts[0] || "";
      tr = parts[1] || "";
      br = parts[2] || "";
      bl = parts[3] || "";
    }

    Object.assign(borderRadiusValues, {
      tl: removePx(tl),
      tr: removePx(tr),
      bl: removePx(bl),
      br: removePx(br),
    });

    if (tl === tr && tl === bl && tl === br) {
      borderRadiusMode.value = "uniform";
    } else if (tl === bl && tr === br) {
      borderRadiusMode.value = "horizontal";
    } else if (tl === tr && bl === br) {
      borderRadiusMode.value = "vertical";
    } else if (tl === br && tr === bl) {
      borderRadiusMode.value = "cross";
    } else {
      borderRadiusMode.value = "custom";
    }

    nextTick(() => (isParsingBorderRadius = false));
  },
  { immediate: true }
);
// --- 高级圆角编辑器逻辑结束 ---

// --- 新增：高级阴影编辑器 ---
const textShadowValues = reactive({ offsetX: "", offsetY: "", blur: "", color: "" });
const boxShadowValues = reactive({
  offsetX: "",
  offsetY: "",
  blur: "",
  spread: "",
  color: "",
  inset: false,
});
let isParsingTextShadow = false;
let isParsingBoxShadow = false;

// 支持 3位hex, 6位hex, 4位hex(alpha), 8位hex(alpha), rgb/a, hsl/a, 颜色名
const COLOR_REGEX = /^(#([0-9a-fA-F]{3,4}){1,2}|(rgba?|hsla?)\(.*\)|[a-z]+)$/i;

const parseSingleShadow = (value: string | null | undefined) => {
  const defaultState = { offsetX: "", offsetY: "", blur: "", spread: "", color: "", inset: false };
  if (!value || value === "none") return defaultState;

  // 只处理第一组阴影
  const firstShadow = value.split(/,(?![^(]*\))/)[0].trim();
  // 按空格分割，但忽略括号内的空格
  const parts = firstShadow.split(/\s+(?![^(]*\))/);
  const result = { ...defaultState };

  // 检查 inset
  if (parts[0] && parts[0].toLowerCase() === "inset") {
    result.inset = true;
    parts.shift();
  }

  // 查找颜色
  // 注意：有些颜色可能在最后，有些在最前
  const colorIndex = parts.findIndex((p) => COLOR_REGEX.test(p));
  if (colorIndex > -1) {
    result.color = parts.splice(colorIndex, 1)[0];
  }

  // 剩下的部分应该是长度值
  const [offsetX, offsetY, blur, spread] = parts;
  result.offsetX = removePx(offsetX || "");
  result.offsetY = removePx(offsetY || "");
  result.blur = removePx(blur || "");
  result.spread = removePx(spread || ""); // Only used for box-shadow

  return result;
};

const composeShadow = (
  values: typeof textShadowValues | typeof boxShadowValues,
  type: "text" | "box"
) => {
  const { offsetX, offsetY, blur, color } = values;
  const { spread, inset } = values as typeof boxShadowValues;

  if (!offsetX && !offsetY && !blur && !color && !spread && !inset) {
    return "";
  }

  const parts = [];
  if (type === "box" && inset) parts.push("inset");
  parts.push(addUnit(offsetX));
  parts.push(addUnit(offsetY));
  if (blur) parts.push(addUnit(blur));
  if (type === "box" && spread) {
    parts.push(addUnit(spread));
  }
  if (color) parts.push(color);

  return parts.join(" ");
};

// Text Shadow Logic
watch(
  textShadowValues,
  (newValues) => {
    if (isParsingTextShadow) return;
    localValue.textShadow = composeShadow(newValues, "text");
  },
  { deep: true }
);

watch(
  () => props.modelValue?.textShadow,
  (newValue) => {
    if (newValue === localValue.textShadow) return;
    isParsingTextShadow = true;
    const parsed = parseSingleShadow(newValue);
    textShadowValues.offsetX = parsed.offsetX;
    textShadowValues.offsetY = parsed.offsetY;
    textShadowValues.blur = parsed.blur;
    textShadowValues.color = parsed.color;
    nextTick(() => (isParsingTextShadow = false));
  },
  { immediate: true }
);

// Box Shadow Logic
watch(
  boxShadowValues,
  (newValues) => {
    if (isParsingBoxShadow) return;
    localValue.boxShadow = composeShadow(newValues, "box");
  },
  { deep: true }
);

watch(
  () => props.modelValue?.boxShadow,
  (newValue) => {
    if (newValue === localValue.boxShadow) return;
    isParsingBoxShadow = true;
    const parsed = parseSingleShadow(newValue);
    boxShadowValues.offsetX = parsed.offsetX;
    boxShadowValues.offsetY = parsed.offsetY;
    boxShadowValues.blur = parsed.blur;
    boxShadowValues.spread = parsed.spread;
    boxShadowValues.color = parsed.color;
    boxShadowValues.inset = parsed.inset;
    nextTick(() => (isParsingBoxShadow = false));
  },
  { immediate: true }
);
// --- 高级阴影编辑器逻辑结束 ---

watch(
  () => props.modelValue,
  (newVal) => {
    const safeNewVal = newVal || {};

    // 1. 找出需要删除的 key
    const keysToRemove = Object.keys(localValue).filter((key) => !(key in safeNewVal));

    // 2. 找出需要更新的 key
    const keysToUpdate = Object.keys(safeNewVal).filter(
      (key) => (localValue as any)[key] !== (safeNewVal as any)[key]
    );

    // 如果没有变化，直接返回，打断循环
    if (keysToRemove.length === 0 && keysToUpdate.length === 0) {
      return;
    }

    // 执行更新
    keysToRemove.forEach((key) => delete (localValue as any)[key]);
    keysToUpdate.forEach((key) => ((localValue as any)[key] = (safeNewVal as any)[key]));
  },
  { immediate: true, deep: true }
);

watch(
  localValue,
  (newVal) => {
    // 过滤空值
    const cleanVal: MarkdownStyleOption = {};
    if (newVal.color) cleanVal.color = newVal.color;
    if (newVal.backgroundColor) cleanVal.backgroundColor = newVal.backgroundColor;
    if (newVal.textShadow) cleanVal.textShadow = newVal.textShadow;
    if (newVal.fontWeight) cleanVal.fontWeight = newVal.fontWeight;
    if (newVal.fontStyle) cleanVal.fontStyle = newVal.fontStyle;
    if (newVal.textDecoration) cleanVal.textDecoration = newVal.textDecoration;
    if (newVal.borderColor) cleanVal.borderColor = newVal.borderColor;
    if (newVal.borderRadius) cleanVal.borderRadius = newVal.borderRadius;
    if (newVal.boxShadow) cleanVal.boxShadow = newVal.boxShadow;

    emit("update:modelValue", cleanVal);
  },
  { deep: true }
);
</script>

<style scoped>
.preview-section {
  margin-bottom: 24px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.preview-header {
  padding: 8px 12px;
  background-color: var(--el-fill-color-light);
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-color-secondary);
}

.preview-viewport {
  padding: 4px;
  background-color: var(--bg-color);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60px;
  font-size: 16px;
}

.preview-content {
  display: inline-block;
  transition: all 0.3s ease;
  padding: 4px 8px;
  margin: 0;
}

.preview-content.is-block {
  display: block;
  width: 100%;
  padding: 16px;
  text-align: left;
}

.color-picker-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.color-picker-row .el-input {
  flex: 1;
}

.border-radius-editor {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  width: 100%;
  align-items: center;
}

.radius-mode-group {
  flex-shrink: 0;
}

.radius-inputs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
  gap: 8px;
  flex: 1;
  min-width: 250px;
}

.shadow-editor {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}
.shadow-inputs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(50px, 1fr));
  gap: 8px;
  flex: 2;
  min-width: 200px;
}
.shadow-editor > .color-picker-row {
  flex: 1;
  min-width: 160px;
}
.shadow-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 220px;
}
.shadow-controls .color-picker-row {
  flex: 1;
}
</style>

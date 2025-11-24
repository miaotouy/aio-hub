<template>
  <div class="theme-appearance-settings">
    <div class="settings-grid">
      <!-- 左列：壁纸管理 -->
      <InfoCard :class="{ 'glass-card': isGlassEffectActive }">
        <template #header>
          <div class="card-header">
            <span>壁纸管理</span>
            <el-switch v-model="enableWallpaper" />
          </div>
        </template>
        <el-form label-position="top">
          <div style="width: 100%" ref="wallpaperCardRef">
            <div class="wallpaper-preview-wrapper">
              <label class="custom-form-label">壁纸预览</label>
              <!-- 静态模式 -->
              <el-tooltip content="点击查看大图" placement="bottom" :disabled="!currentWallpaper">
                <div
                  v-show="wallpaperMode === 'static'"
                  class="wallpaper-preview"
                  :class="{ 'is-clickable': currentWallpaper }"
                  :style="wallpaperPreviewStyle"
                  @click="showWallpaperPreview"
                >
                  <div v-if="!currentWallpaper" class="empty-state">
                    <el-icon><Picture /></el-icon>
                    <span>无壁纸</span>
                  </div>
                </div>
              </el-tooltip>

              <!-- 轮播模式 -->
              <div v-show="wallpaperMode === 'slideshow'">
                <!-- 预览和缩略图容器 -->
                <div class="wallpaper-preview-container" :class="{ 'wide-layout': isWideLayout }">
                  <el-tooltip content="点击查看大图" placement="bottom" :disabled="!currentWallpaper">
                    <div
                      class="wallpaper-preview"
                      :class="{ 'is-clickable': currentWallpaper }"
                      :style="wallpaperPreviewStyle"
                      @click="showWallpaperPreview"
                    >
                      <div v-if="!currentWallpaper" class="empty-state">
                        <el-icon><Picture /></el-icon>
                        <span>无壁纸</span>
                      </div>
                    </div>
                  </el-tooltip>

                  <!-- 缩略图 -->
                  <div v-if="currentWallpaperList.length > 0" class="thumbnail-wrapper">
                    <div class="thumbnail-container" ref="thumbnailContainerRef">
                      <div
                        v-for="image in visibleThumbnails"
                        :key="image.path"
                        :class="['thumbnail-item', { active: image.isActive }]"
                        @click="switchToWallpaper(image.originalIndex)"
                        :ref="(el) => (thumbnailRefs[image.originalIndex] = el as HTMLElement)"
                      >
                        <img :src="image.url" class="thumbnail-image" loading="lazy" />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 轮播控制（现在是分离的） -->
                <div v-if="currentWallpaperList.length > 0" class="slideshow-controls-container">
                  <div class="slideshow-controls">
                    <el-button
                      :icon="RefreshLeft"
                      circle
                      @click="refreshWallpaperList"
                      title="刷新列表"
                    />
                    <el-button
                      :icon="ArrowLeft"
                      circle
                      @click="playPreviousWallpaper"
                      title="上一张"
                    />
                    <el-button
                      :icon="isSlideshowPaused ? VideoPlay : VideoPause"
                      circle
                      @click="toggleSlideshowPlayback"
                      :title="isSlideshowPaused ? '继续播放' : '暂停播放'"
                    />
                    <el-button
                      :icon="ArrowRight"
                      circle
                      @click="playNextWallpaper"
                      title="下一张"
                    />
                    <el-tooltip
                      :content="isShuffleEnabled ? '顺序播放' : '随机播放'"
                      placement="top"
                    >
                      <el-button
                        :icon="Sort"
                        circle
                        @click="toggleShuffle"
                        :type="isShuffleEnabled ? 'primary' : ''"
                      />
                    </el-tooltip>
                    <el-tooltip content="重新洗牌" placement="top">
                      <el-button
                        :icon="MagicStick"
                        circle
                        @click="reshuffle"
                        :disabled="!isShuffleEnabled"
                      />
                    </el-tooltip>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 壁纸设置组 -->
          <div class="wallpaper-controls">
            <el-row :gutter="20">
              <el-col :md="12" :span="24">
                <el-form-item label="壁纸模式">
                  <el-radio-group v-model="wallpaperMode">
                    <el-radio-button value="static">静态壁纸</el-radio-button>
                    <el-radio-button value="slideshow">目录轮播</el-radio-button>
                  </el-radio-group>
                </el-form-item>
              </el-col>
              <el-col :md="12" :span="24">
                <el-form-item v-if="wallpaperMode === 'slideshow'" label="轮播间隔（分钟）">
                  <el-input-number
                    v-model="wallpaperSlideshowInterval"
                    :min="1"
                    :max="1440"
                    class="full-width"
                  />
                </el-form-item>
              </el-col>
            </el-row>

            <el-form-item v-if="wallpaperMode === 'static'" label="图片路径">
              <el-input v-model="wallpaperPath" placeholder="输入图片路径或选择文件">
                <template #append>
                  <el-button @click="selectWallpaper">选择图片</el-button>
                </template>
              </el-input>
            </el-form-item>

            <el-form-item v-if="wallpaperMode === 'slideshow'" label="目录路径">
              <el-input v-model="wallpaperSlideshowPath" placeholder="输入目录路径或选择目录">
                <template #append>
                  <el-button @click="selectWallpaperDirectory">选择目录</el-button>
                </template>
              </el-input>
            </el-form-item>

            <el-form-item label="填充模式">
              <el-radio-group v-model="wallpaperFit">
                <el-radio-button value="cover">覆盖</el-radio-button>
                <el-radio-button value="contain">包含</el-radio-button>
                <el-radio-button value="fill">拉伸</el-radio-button>
                <el-radio-button value="tile">平铺</el-radio-button>
              </el-radio-group>
            </el-form-item>

            <!-- 拼贴模式专属选项 -->
            <div v-if="wallpaperFit === 'tile'" class="tile-options">
              <el-form-item label="拼贴缩放">
                <el-slider v-model="wallpaperTileScale" :min="0.1" :max="3" :step="0.05" />
              </el-form-item>
              <el-form-item label="拼贴旋转">
                <el-slider v-model="wallpaperTileRotation" :min="0" :max="360" :step="1" />
              </el-form-item>
              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="水平翻转">
                    <el-switch v-model="wallpaperTileFlipHorizontal" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="垂直翻转">
                    <el-switch v-model="wallpaperTileFlipVertical" />
                  </el-form-item>
                </el-col>
              </el-row>
            </div>

            <div class="button-group">
              <el-button @click="confirmClearWallpaper" type="danger" plain>清除壁纸</el-button>
            </div>
          </div>
        </el-form>
      </InfoCard>

      <!-- 右列：UI 和窗口特效 -->
      <div class="right-column-content">
        <InfoCard :class="{ 'glass-card': isGlassEffectActive }">
          <template #header>
            <div class="card-header">
              <span>界面质感</span>
              <el-switch v-model="enableUiEffects" />
            </div>
          </template>
          <el-form label-position="top" :disabled="!enableUiEffects">
            <el-form-item label="UI 基础不透明度">
              <el-slider v-model="uiBaseOpacity" :min="0" :max="1" :step="0.05" />
            </el-form-item>

            <el-form-item label="分离窗口不透明度">
              <el-slider v-model="detachedUiBaseOpacity" :min="0" :max="1" :step="0.05" />
              <p class="form-item-description">
                控制分离出去的独立组件窗口内部元素的透明度，独立于主窗口设置。
              </p>
            </el-form-item>

            <!-- 背景色叠加 -->
            <div class="setting-group-divider">
              <el-divider>
                <div class="divider-content" style="background-color: transparent">
                  <el-switch v-model="backgroundColorOverlayEnabled" size="small" />
                  <span>背景色叠加</span>
                </div>
              </el-divider>
            </div>

            <div
              class="color-overlay-group"
              :class="{ 'is-disabled': !backgroundColorOverlayEnabled }"
            >
              <el-form-item>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <el-switch v-model="autoExtractColorFromWallpaper" />
                  <span style="font-size: 14px;">自动从壁纸提取颜色</span>
                  <el-tooltip
                    content="启用后，每次切换壁纸时会自动提取主色调并应用到背景色叠加"
                    placement="top"
                  >
                    <el-icon style="cursor: help; color: var(--el-text-color-secondary);">
                      <QuestionFilled />
                    </el-icon>
                  </el-tooltip>
                </div>
              </el-form-item>

              <el-row :gutter="20">
                <el-col :span="14">
                  <el-form-item label="叠加颜色">
                    <div class="color-picker-with-input">
                      <el-color-picker
                        :model-value="effectiveOverlayColor"
                        @update:model-value="onOverlayColorChange"
                        :disabled="autoExtractColorFromWallpaper"
                      />
                      <el-input
                        :model-value="effectiveOverlayColor"
                        @update:model-value="onOverlayColorChange"
                        placeholder="颜色值"
                        :disabled="autoExtractColorFromWallpaper"
                      />
                      <el-tooltip content="从屏幕取色 (ESC 取消)" placement="top">
                        <el-button :icon="Pipette" circle @click="openEyeDropper" />
                      </el-tooltip>
                      <el-tooltip content="从当前壁纸取色" placement="top">
                        <el-button
                          :icon="RefreshCw"
                          circle
                          @click="extractColorFromCurrentWallpaper"
                          :disabled="!currentWallpaper"
                        />
                      </el-tooltip>
                    </div>
                  </el-form-item>
                </el-col>
                <el-col :span="10">
                  <el-form-item label="混合模式">
                    <el-select v-model="backgroundColorOverlayBlendMode" class="full-width">
                      <el-option
                        v-for="mode in blendModes"
                        :key="mode"
                        :label="mode"
                        :value="mode"
                      />
                    </el-select>
                  </el-form-item>
                </el-col>
              </el-row>
              <el-form-item label="叠加不透明度">
                <el-slider v-model="backgroundColorOverlayOpacity" :min="0" :max="1" :step="0.05" />
              </el-form-item>
            </div>

            <el-divider />

            <el-form-item label="壁纸不透明度">
              <el-slider v-model="wallpaperOpacity" :min="0" :max="1" :step="0.05" />
            </el-form-item>

            <!-- UI 模糊效果 -->
            <div class="setting-group-divider">
              <el-divider>
                <div class="divider-content">
                  <el-switch v-model="enableUiBlur" size="small" />
                  <span>UI 模糊 (毛玻璃)</span>
                </div>
              </el-divider>
            </div>

            <div class="blur-group" :class="{ 'is-disabled': !enableUiBlur }">
              <el-form-item label="UI 模糊强度 (px)">
                <el-slider v-model="uiBlurIntensity" :min="0" :max="50" :step="1" />
              </el-form-item>
            </div>

            <el-divider />

            <el-form-item label="边线不透明度">
              <el-slider v-model="borderOpacity" :min="0" :max="1" :step="0.05" />
            </el-form-item>

            <el-form-item label="代码块背景不透明度">
              <el-slider v-model="codeBlockOpacity" :min="0" :max="1" :step="0.05" />
            </el-form-item>
          </el-form>
        </InfoCard>

        <InfoCard :class="{ 'glass-card': isGlassEffectActive }">
          <template #header>
            <div class="card-header">
              <span>窗口特效 (实验性)</span>
              <el-switch v-model="enableWindowEffects" :disabled="isLinux" />
            </div>
          </template>

          <el-alert
            v-if="isLinux"
            title="Linux 系统暂不支持窗口特效"
            type="warning"
            description="由于兼容性原因（如 WebKitGTK 和显卡驱动冲突导致的白屏），窗口特效在 Linux 上已被暂时禁用。"
            show-icon
            :closable="false"
            style="margin-bottom: 16px"
          />

          <el-form label-position="top" :disabled="!enableWindowEffects || isLinux">
            <el-form-item label="窗口背景特效">
              <el-select v-model="windowEffect" class="full-width">
                <el-option label="无" value="none" />
                <el-option label="模糊 (Blur)" value="blur" />
                <el-option label="亚克力 (Acrylic)" value="acrylic" />
                <el-option label="云母 (Mica)" value="mica" />
              </el-select>
              <p class="form-item-description">
                效果即时生效。此功能依赖操作系统支持 (Windows 10+, macOS)。
              </p>
            </el-form-item>

            <el-form-item label="窗口背景不透明度">
              <el-slider v-model="windowBackgroundOpacity" :min="0" :max="1" :step="0.05" />
              <p class="form-item-description">
                降低此值以透出桌面或窗口后的内容。
              </p>
            </el-form-item>
          </el-form>
        </InfoCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from "vue";
import InfoCard from "@/components/common/InfoCard.vue";
import { useElementSize } from "@vueuse/core";
import { Pipette, RefreshCw } from "lucide-vue-next";
import { useImageViewer } from "@/composables/useImageViewer";
import {
  Picture,
  ArrowLeft,
  ArrowRight,
  VideoPause,
  VideoPlay,
  Sort,
  MagicStick,
  RefreshLeft,
  QuestionFilled,
} from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { useThemeAppearance } from "@/composables/useThemeAppearance";
import type { WallpaperFit, BlendMode } from "@/utils/appSettings";
import { convertFileSrc } from "@tauri-apps/api/core";
import { type } from "@tauri-apps/plugin-os";

const {
  appearanceSettings,
  currentWallpaper,
  currentWallpaperList,
  isSlideshowPaused,
  isShuffleEnabled,
  updateAppearanceSetting,
  selectWallpaper,
  selectWallpaperDirectory,
  clearWallpaper,
  playNextWallpaper,
  playPreviousWallpaper,
  switchToWallpaper,
  toggleSlideshowPlayback,
  toggleShuffle,
  reshuffle,
  refreshWallpaperList,
  extractColorFromCurrentWallpaper,
} = useThemeAppearance();

const isGlassEffectActive = computed(() =>
  appearanceSettings.value.enableUiEffects && appearanceSettings.value.enableUiBlur
);

const imageViewer = useImageViewer();

const showWallpaperPreview = () => {
  if (!currentWallpaper.value) return;

  if (wallpaperMode.value === "static") {
    // 使用原始路径，而不是转换后的 URL
    if (appearanceSettings.value.wallpaperPath) {
      imageViewer.show(appearanceSettings.value.wallpaperPath);
    }
  } else {
    // currentWallpaperList 已经是原始路径列表
    // 仅显示当前图片以避免性能问题
    const currentImage = currentWallpaperList.value[currentIndex.value];
    if (currentImage) {
      imageViewer.show(currentImage);
    }
  }
};

const blendModes: BlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
];

const isLinux = ref(false);

// --- 生命周期钩子 ---
onMounted(() => {
  // 检测操作系统
  isLinux.value = type() === "linux";

  // 如果以轮播模式启动，刷新列表以填充缩略图
  if (wallpaperMode.value === "slideshow") {
    refreshWallpaperList();
  }
});

// --- 响应式布局 ---
// 监听整个壁纸设置卡片的宽度，而不是内部某个 div 的宽度。
// 这样可以避免因内部布局变化（isWideLayout 切换）导致宽度变化，从而产生的无限循环/闪烁问题。
const wallpaperCardRef = ref(null);
const { width: cardWidth } = useElementSize(wallpaperCardRef);
// 当卡片宽度足够时，切换到宽屏布局（缩略图在右侧）。
// 用户反馈在 400px 时可以触发，这里设置为 450px 作为一个稳定的阈值。
const isWideLayout = computed(() => cardWidth.value >= 500);

// --- 缩略图逻辑 ---
const thumbnailContainerRef = ref<HTMLElement | null>(null);
const thumbnailRefs = ref<Record<number, HTMLElement>>({});
const MAX_VISIBLE_THUMBNAILS = 5; // 奇数以保证当前项居中

const currentIndex = computed(() => appearanceSettings.value.wallpaperSlideshowCurrentIndex ?? 0);

const visibleThumbnails = computed(() => {
  const list = currentWallpaperList.value;
  if (list.length === 0) return [];

  const total = list.length;
  const half = Math.floor(MAX_VISIBLE_THUMBNAILS / 2);
  let start = Math.max(0, currentIndex.value - half);
  let end = Math.min(total, start + MAX_VISIBLE_THUMBNAILS);

  if (end - start < MAX_VISIBLE_THUMBNAILS) {
    start = Math.max(0, end - MAX_VISIBLE_THUMBNAILS);
  }

  const thumbnails = [];
  for (let i = start; i < end; i++) {
    const originalIndex = i;
    const path = list[originalIndex];
    thumbnails.push({
      path,
      url: convertFileSrc(path), // 使用 Tauri API 同步转换路径
      originalIndex,
      isActive: originalIndex === currentIndex.value,
    });
  }
  return thumbnails;
});

watch(
  currentIndex,
  async (newIndex) => {
    await nextTick();
    const activeThumbnail = thumbnailRefs.value[newIndex];
    if (activeThumbnail && thumbnailContainerRef.value) {
      activeThumbnail.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  },
  { flush: "post" }
);

// 确认清除壁纸
const confirmClearWallpaper = async () => {
  try {
    await ElMessageBox.confirm("确定要清除当前壁纸吗？此操作不可恢复。", "确认清除", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });
    // 用户确认后执行清除操作
    await clearWallpaper();
  } catch {
    // 用户取消操作，不做任何处理
  }
};

// 吸管功能
interface EyeDropper {
  open(): Promise<{ sRGBHex: string }>;
}

interface WindowWithEyeDropper extends Window {
  EyeDropper?: {
    new (): EyeDropper;
  };
}

const openEyeDropper = async () => {
  // EyeDropper API 不是标准窗口类型定义的一部分。
  // 我们将其转换为扩展后的 Window 类型来访问它。
  const global = window as unknown as WindowWithEyeDropper;
  if (!global.EyeDropper) {
    console.warn("当前环境不支持 EyeDropper API。");
    // 你可以在这里使用 `ElMessage` 来通知用户。
    // 例如：ElMessage.warning('吸管功能不受支持。');
    return;
  }

  try {
    const eyeDropper = new global.EyeDropper();
    const result = await eyeDropper.open();
    // v-model 是一个计算属性，所以我们使用它的 .value 来触发 setter。
    backgroundColorOverlayColor.value = result.sRGBHex;
  } catch (error) {
    // 如果用户取消操作（例如按 Esc），则会执行此代码块。
    console.info("吸管选择已取消。");
  }
};

// 使用 computed 进行双向绑定
const enableWallpaper = computed({
  get: () => appearanceSettings.value.enableWallpaper,
  set: (val) => updateAppearanceSetting({ enableWallpaper: val }),
});

const wallpaperMode = computed({
  get: () => appearanceSettings.value.wallpaperMode,
  set: (val) => updateAppearanceSetting({ wallpaperMode: val }),
});

// 在壁纸模式切换到 'slideshow' 时，主动刷新壁纸列表
watch(wallpaperMode, async (newMode) => {
  if (newMode === "slideshow") {
    await nextTick(); // 等待 DOM 更新
    refreshWallpaperList();
  }
});

const wallpaperSlideshowInterval = computed({
  get: () => appearanceSettings.value.wallpaperSlideshowInterval,
  set: (val) => updateAppearanceSetting({ wallpaperSlideshowInterval: val }),
});

const wallpaperPath = computed({
  get: () => appearanceSettings.value.wallpaperPath,
  set: (val) => updateAppearanceSetting({ wallpaperPath: val }),
});

const wallpaperSlideshowPath = computed({
  get: () => appearanceSettings.value.wallpaperSlideshowPath,
  set: (val) => updateAppearanceSetting({ wallpaperSlideshowPath: val }),
});

const wallpaperFit = computed({
  get: () => appearanceSettings.value.wallpaperFit,
  set: (val: WallpaperFit) => updateAppearanceSetting({ wallpaperFit: val }),
});

const wallpaperTileScale = computed({
  get: () => appearanceSettings.value.wallpaperTileOptions?.scale ?? 1.0,
  set: (val) =>
    updateAppearanceSetting(
      {
        wallpaperTileOptions: { ...appearanceSettings.value.wallpaperTileOptions, scale: val },
      },
      { debounceUi: true }
    ),
});

const wallpaperTileRotation = computed({
  get: () => appearanceSettings.value.wallpaperTileOptions?.rotation ?? 0,
  set: (val) =>
    updateAppearanceSetting(
      {
        wallpaperTileOptions: { ...appearanceSettings.value.wallpaperTileOptions, rotation: val },
      },
      { debounceUi: true }
    ),
});

const wallpaperTileFlipHorizontal = computed({
  get: () => appearanceSettings.value.wallpaperTileOptions?.flipHorizontal ?? false,
  set: (val) =>
    updateAppearanceSetting({
      wallpaperTileOptions: {
        ...appearanceSettings.value.wallpaperTileOptions,
        flipHorizontal: val,
      },
    }),
});

const wallpaperTileFlipVertical = computed({
  get: () => appearanceSettings.value.wallpaperTileOptions?.flipVertical ?? false,
  set: (val) =>
    updateAppearanceSetting({
      wallpaperTileOptions: { ...appearanceSettings.value.wallpaperTileOptions, flipVertical: val },
    }),
});

const wallpaperOpacity = computed({
  get: () => appearanceSettings.value.wallpaperOpacity,
  set: (val) => updateAppearanceSetting({ wallpaperOpacity: val }, { debounceUi: true }),
});

const enableUiEffects = computed({
  get: () => appearanceSettings.value.enableUiEffects,
  set: (val) => updateAppearanceSetting({ enableUiEffects: val }),
});

const enableUiBlur = computed({
  get: () => appearanceSettings.value.enableUiBlur,
  set: (val) => updateAppearanceSetting({ enableUiBlur: val }),
});

const uiBaseOpacity = computed({
  get: () => appearanceSettings.value.uiBaseOpacity,
  set: (val) => updateAppearanceSetting({ uiBaseOpacity: val }, { debounceUi: true }),
});

const detachedUiBaseOpacity = computed({
  get: () => appearanceSettings.value.detachedUiBaseOpacity ?? 0.7,
  set: (val) => updateAppearanceSetting({ detachedUiBaseOpacity: val }, { debounceUi: true }),
});

const uiBlurIntensity = computed({
  get: () => appearanceSettings.value.uiBlurIntensity,
  set: (val) => updateAppearanceSetting({ uiBlurIntensity: val }, { debounceUi: true }),
});

const borderOpacity = computed({
  get: () => appearanceSettings.value.borderOpacity,
  set: (val) => updateAppearanceSetting({ borderOpacity: val }, { debounceUi: true }),
});

const windowEffect = computed({
  get: () => appearanceSettings.value.windowEffect,
  set: (val) => updateAppearanceSetting({ windowEffect: val }),
});

const windowBackgroundOpacity = computed({
  get: () => appearanceSettings.value.windowBackgroundOpacity,
  set: (val) => updateAppearanceSetting({ windowBackgroundOpacity: val }, { debounceUi: true }),
});

const codeBlockOpacity = computed({
  get: () => appearanceSettings.value.codeBlockOpacity,
  set: (val) => updateAppearanceSetting({ codeBlockOpacity: val }, { debounceUi: true }),
});

const enableWindowEffects = computed({
  get: () => appearanceSettings.value.enableWindowEffects ?? true,
  set: (val) => updateAppearanceSetting({ enableWindowEffects: val }),
});

// --- 背景色叠加 ---
const backgroundColorOverlayEnabled = computed({
  get: () => appearanceSettings.value.backgroundColorOverlayEnabled ?? false,
  set: (val) => updateAppearanceSetting({ backgroundColorOverlayEnabled: val }),
});

const backgroundColorOverlayColor = computed({
  get: () => appearanceSettings.value.backgroundColorOverlayColor ?? "#409eff",
  set: (val) => updateAppearanceSetting({ backgroundColorOverlayColor: val }),
});

// 计算实际生效的叠加颜色
const effectiveOverlayColor = computed(() => {
  return autoExtractColorFromWallpaper.value && appearanceSettings.value.wallpaperExtractedColor
    ? appearanceSettings.value.wallpaperExtractedColor
    : appearanceSettings.value.backgroundColorOverlayColor ?? "#409eff";
});

// 处理手动颜色输入
const onOverlayColorChange = (val: string) => {
  updateAppearanceSetting({ backgroundColorOverlayColor: val });
};

const backgroundColorOverlayOpacity = computed({
  get: () => appearanceSettings.value.backgroundColorOverlayOpacity ?? 0.3,
  set: (val) =>
    updateAppearanceSetting({ backgroundColorOverlayOpacity: val }, { debounceUi: true }),
});

const backgroundColorOverlayBlendMode = computed({
  get: () => appearanceSettings.value.backgroundColorOverlayBlendMode ?? "overlay",
  set: (val: BlendMode) => updateAppearanceSetting({ backgroundColorOverlayBlendMode: val }),
});

const autoExtractColorFromWallpaper = computed({
  get: () => appearanceSettings.value.autoExtractColorFromWallpaper ?? false,
  set: (val) => updateAppearanceSetting({ autoExtractColorFromWallpaper: val }),
});

const wallpaperPreviewStyle = computed(() => {
  // currentWallpaper 已经是一个转换后的 asset URL 或空字符串
  const imageUrl = currentWallpaper.value;

  const baseStyle: Record<string, string> = {
    // 在 url() 中使用引号以处理路径中的特殊字符 (如括号)
    // 如果 URL 为空，则将背景设置为 none
    backgroundImage: imageUrl ? `url("${imageUrl}")` : "none",
    backgroundPosition: "center",
  };

  const fit = wallpaperFit.value;
  if (fit === "tile") {
    const scale = wallpaperTileScale.value;
    baseStyle.backgroundSize = `${scale * 100}%`;
    baseStyle.backgroundRepeat = "repeat";
    // 预览中不展示 transform，因为它会应用到整个 div，效果不对
  } else {
    const sizeMap: Record<string, string> = {
      cover: "cover",
      contain: "contain",
      fill: "100% 100%",
    };
    baseStyle.backgroundSize = sizeMap[fit] ?? "cover";
    baseStyle.backgroundRepeat = "no-repeat";
  }

  return baseStyle;
});
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.setting-group-divider {
  margin: 12px 0;
}

.setting-group-divider .el-divider__text {
  padding: 0 12px;
  border: none;
}

:deep(.el-divider__text) {
  background-color: transparent;
}

.divider-content {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.color-overlay-group {
  transition: all 0.3s ease;
}

.color-overlay-group.is-disabled,
.blur-group.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}

.blur-group {
  transition: all 0.3s ease;
}

.theme-appearance-settings {
  padding: 20px;
}

.settings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 20px;
}

@media (max-width: 1199px) {
  .settings-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.right-column-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.wallpaper-preview-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%; /* 确保占据全宽 */
}

.wallpaper-preview.is-clickable {
  cursor: pointer;
}

.wallpaper-preview {
  width: 100%;
  /* 在窄模式下，aspect-ratio 比固定高度更好 */
  aspect-ratio: 16 / 9;
  height: auto;
  min-height: 200px;
  max-height: 400px;
  border-radius: 8px;
  border: 1px dashed var(--border-color);
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--text-color-light);
  background-color: var(--card-bg);
  transition: all 0.3s ease;
  flex-shrink: 0; /* 防止在列布局中收缩 */
}

.slideshow-controls-container {
  margin-top: 12px;
  background-color: var(--card-bg);
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.slideshow-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap; /* 允许控件在较小的屏幕上换行 */
}

.thumbnail-wrapper {
  overflow: hidden; /* 用于容器的圆角 */
  background-color: var(--card-bg);
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.thumbnail-container {
  display: flex;
  gap: 8px;
  overflow-x: hidden; /* 防止水平滚动条 */
  padding: 4px;
}

.thumbnail-item {
  width: 80px;
  height: auto;
  aspect-ratio: 4 / 3;
  border-radius: 4px;
  cursor: pointer;
  border: 2px solid transparent;
  flex-shrink: 1; /* 允许收缩 */
  transition:
    border-color 0.3s ease,
    transform 0.2s ease;
  overflow: hidden;
}

.thumbnail-item.active {
  border-color: var(--el-color-primary);
}

.thumbnail-item:hover {
  transform: scale(1.05);
}

.thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 2px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.empty-state .el-icon {
  font-size: 32px;
}

.tile-options {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 20px 20px 0 20px;
  margin-bottom: 18px;
}

.button-group {
  display: flex;
  gap: 12px;
  margin-bottom: 18px; /* 与 el-form-item 的默认 bottom-margin 对齐 */
}

.form-item-description {
  font-size: 12px;
  color: var(--text-color-light);
  margin-top: 4px;
  line-height: 1.4;
}

.wallpaper-preview-wrapper {
  margin-bottom: 22px;
}

.custom-form-label {
  color: var(--el-text-color-regular);
  font-size: var(--el-form-label-font-size);
  line-height: 22px;
  margin-bottom: 8px;
  display: block;
}

/* --- 宽屏布局样式 --- */
.wallpaper-preview-container.wide-layout {
  flex-direction: row;
  align-items: stretch; /* 使项目具有相同高度 */
  gap: 12px;
}

.wallpaper-preview-container.wide-layout .wallpaper-preview {
  flex: 1 1 0; /* 可增长和收缩，基础值为 0 */
  min-width: 0; /* 收缩的关键 */
  height: auto; /* 让 flexbox 控制高度 */
  max-height: none;
  aspect-ratio: auto; /* 防止宽高比限制宽度 */
}

.wallpaper-preview-container.wide-layout .thumbnail-wrapper {
  flex: 0 0 120px; /* 不增长，不收缩，基础值为 120px */
  width: 120px;
  height: auto; /* 匹配预览的高度 */
  display: flex;
  flex-direction: column;
}

.wallpaper-preview-container.wide-layout .thumbnail-container {
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  height: 100%;
  padding-right: 4px;
  flex: 1;
  min-height: 0;
}

.wallpaper-preview-container.wide-layout .thumbnail-item {
  width: 100%;
  height: 60px;
}

.full-width {
  width: 100%;
}

:deep(.el-card__header) {
  padding: 12px 20px;
  font-size: 16px;
  font-weight: 500;
}

.color-picker-with-input {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.color-picker-with-input .el-input {
  /* 让输入字段占据剩余空间 */
  flex: 1;
}
</style>

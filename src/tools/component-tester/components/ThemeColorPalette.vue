<template>
  <div class="theme-color-palette">
    <div class="section">
      <h2 class="section-title">主题色系</h2>
      <div class="color-category">
        <h3 class="category-title">主色 Primary</h3>
        <div class="color-row">
          <div class="color-card main-color">
            <div class="color-preview" :style="{ backgroundColor: colors.primary }"></div>
            <div class="color-info">
              <div class="color-name">Primary</div>
              <div class="color-value">{{ colors.primary }}</div>
            </div>
          </div>
          <div v-for="i in 9" :key="i" class="color-card">
            <div class="color-preview" :style="{ backgroundColor: colors[`primaryLight${i}`] }"></div>
            <div class="color-info">
              <div class="color-name">Light {{ i }}</div>
              <div class="color-value">{{ colors[`primaryLight${i}`] }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="color-category">
        <h3 class="category-title">成功色 Success</h3>
        <div class="color-row">
          <div class="color-card main-color">
            <div class="color-preview" :style="{ backgroundColor: colors.success }"></div>
            <div class="color-info">
              <div class="color-name">Success</div>
              <div class="color-value">{{ colors.success }}</div>
            </div>
          </div>
          <div v-for="i in 9" :key="i" class="color-card">
            <div class="color-preview" :style="{ backgroundColor: colors[`successLight${i}`] }"></div>
            <div class="color-info">
              <div class="color-name">Light {{ i }}</div>
              <div class="color-value">{{ colors[`successLight${i}`] }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="color-category">
        <h3 class="category-title">警告色 Warning</h3>
        <div class="color-row">
          <div class="color-card main-color">
            <div class="color-preview" :style="{ backgroundColor: colors.warning }"></div>
            <div class="color-info">
              <div class="color-name">Warning</div>
              <div class="color-value">{{ colors.warning }}</div>
            </div>
          </div>
          <div v-for="i in 9" :key="i" class="color-card">
            <div class="color-preview" :style="{ backgroundColor: colors[`warningLight${i}`] }"></div>
            <div class="color-info">
              <div class="color-name">Light {{ i }}</div>
              <div class="color-value">{{ colors[`warningLight${i}`] }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="color-category">
        <h3 class="category-title">危险色 Danger</h3>
        <div class="color-row">
          <div class="color-card main-color">
            <div class="color-preview" :style="{ backgroundColor: colors.danger }"></div>
            <div class="color-info">
              <div class="color-name">Danger</div>
              <div class="color-value">{{ colors.danger }}</div>
            </div>
          </div>
          <div v-for="i in 9" :key="i" class="color-card">
            <div class="color-preview" :style="{ backgroundColor: colors[`dangerLight${i}`] }"></div>
            <div class="color-info">
              <div class="color-name">Light {{ i }}</div>
              <div class="color-value">{{ colors[`dangerLight${i}`] }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="color-category">
        <h3 class="category-title">信息色 Info</h3>
        <div class="color-row">
          <div class="color-card main-color">
            <div class="color-preview" :style="{ backgroundColor: colors.info }"></div>
            <div class="color-info">
              <div class="color-name">Info</div>
              <div class="color-value">{{ colors.info }}</div>
            </div>
          </div>
          <div v-for="i in 9" :key="i" class="color-card">
            <div class="color-preview" :style="{ backgroundColor: colors[`infoLight${i}`] }"></div>
            <div class="color-info">
              <div class="color-name">Light {{ i }}</div>
              <div class="color-value">{{ colors[`infoLight${i}`] }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">文本颜色</h2>
      <div class="color-grid">
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.textPrimary }"></div>
          <div class="color-info">
            <div class="color-name">Primary</div>
            <div class="color-value">{{ colors.textPrimary }}</div>
          </div>
        </div>
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.textRegular }"></div>
          <div class="color-info">
            <div class="color-name">Regular</div>
            <div class="color-value">{{ colors.textRegular }}</div>
          </div>
        </div>
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.textSecondary }"></div>
          <div class="color-info">
            <div class="color-name">Secondary</div>
            <div class="color-value">{{ colors.textSecondary }}</div>
          </div>
        </div>
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.textPlaceholder }"></div>
          <div class="color-info">
            <div class="color-name">Placeholder</div>
            <div class="color-value">{{ colors.textPlaceholder }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">边框颜色</h2>
      <div class="color-grid">
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.borderDarker }"></div>
          <div class="color-info">
            <div class="color-name">Darker</div>
            <div class="color-value">{{ colors.borderDarker }}</div>
          </div>
        </div>
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.borderDark }"></div>
          <div class="color-info">
            <div class="color-name">Dark</div>
            <div class="color-value">{{ colors.borderDark }}</div>
          </div>
        </div>
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.border }"></div>
          <div class="color-info">
            <div class="color-name">Base</div>
            <div class="color-value">{{ colors.border }}</div>
          </div>
        </div>
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.borderLight }"></div>
          <div class="color-info">
            <div class="color-name">Light</div>
            <div class="color-value">{{ colors.borderLight }}</div>
          </div>
        </div>
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.borderLighter }"></div>
          <div class="color-info">
            <div class="color-name">Lighter</div>
            <div class="color-value">{{ colors.borderLighter }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">填充颜色</h2>
      <div class="color-grid">
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.fillDarker }"></div>
          <div class="color-info">
            <div class="color-name">Darker</div>
            <div class="color-value">{{ colors.fillDarker }}</div>
          </div>
        </div>
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.fillDark }"></div>
          <div class="color-info">
            <div class="color-name">Dark</div>
            <div class="color-value">{{ colors.fillDark }}</div>
          </div>
        </div>
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.fill }"></div>
          <div class="color-info">
            <div class="color-name">Base</div>
            <div class="color-value">{{ colors.fill }}</div>
          </div>
        </div>
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.fillLight }"></div>
          <div class="color-info">
            <div class="color-name">Light</div>
            <div class="color-value">{{ colors.fillLight }}</div>
          </div>
        </div>
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.fillLighter }"></div>
          <div class="color-info">
            <div class="color-name">Lighter</div>
            <div class="color-value">{{ colors.fillLighter }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">背景颜色</h2>
      <div class="color-grid">
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.bg }"></div>
          <div class="color-info">
            <div class="color-name">Base</div>
            <div class="color-value">{{ colors.bg }}</div>
          </div>
        </div>
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.bgPage }"></div>
          <div class="color-info">
            <div class="color-name">Page</div>
            <div class="color-value">{{ colors.bgPage }}</div>
          </div>
        </div>
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.bgOverlay }"></div>
          <div class="color-info">
            <div class="color-name">Overlay</div>
            <div class="color-value">{{ colors.bgOverlay }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">遮罩颜色</h2>
      <div class="color-grid">
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.mask }"></div>
          <div class="color-info">
            <div class="color-name">Mask</div>
            <div class="color-value">{{ colors.mask }}</div>
          </div>
        </div>
        <div class="color-card">
          <div class="color-preview" :style="{ backgroundColor: colors.maskExtra }"></div>
          <div class="color-info">
            <div class="color-name">Extra</div>
            <div class="color-value">{{ colors.maskExtra }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';
import { lightenColor, darkenColor } from '@/utils/themeColors';
import { useDark } from '@vueuse/core';

const isDark = useDark();

interface ColorMap {
  [key: string]: string;
}

const colors = ref<ColorMap>({
  // 主题色
  primary: '',
  primaryLight1: '',
  primaryLight2: '',
  primaryLight3: '',
  primaryLight4: '',
  primaryLight5: '',
  primaryLight6: '',
  primaryLight7: '',
  primaryLight8: '',
  primaryLight9: '',
  // 成功色
  success: '',
  successLight1: '',
  successLight2: '',
  successLight3: '',
  successLight4: '',
  successLight5: '',
  successLight6: '',
  successLight7: '',
  successLight8: '',
  successLight9: '',
  // 警告色
  warning: '',
  warningLight1: '',
  warningLight2: '',
  warningLight3: '',
  warningLight4: '',
  warningLight5: '',
  warningLight6: '',
  warningLight7: '',
  warningLight8: '',
  warningLight9: '',
  // 危险色
  danger: '',
  dangerLight1: '',
  dangerLight2: '',
  dangerLight3: '',
  dangerLight4: '',
  dangerLight5: '',
  dangerLight6: '',
  dangerLight7: '',
  dangerLight8: '',
  dangerLight9: '',
  // 信息色
  info: '',
  infoLight1: '',
  infoLight2: '',
  infoLight3: '',
  infoLight4: '',
  infoLight5: '',
  infoLight6: '',
  infoLight7: '',
  infoLight8: '',
  infoLight9: '',
  // 文本颜色
  textPrimary: '',
  textRegular: '',
  textSecondary: '',
  textPlaceholder: '',
  // 边框颜色
  borderDarker: '',
  borderDark: '',
  border: '',
  borderLight: '',
  borderLighter: '',
  // 填充颜色
  fillDarker: '',
  fillDark: '',
  fill: '',
  fillLight: '',
  fillLighter: '',
  // 背景颜色
  bg: '',
  bgPage: '',
  bgOverlay: '',
  // 遮罩
  mask: '',
  maskExtra: '',
});
const getCSSVariable = (name: string): string => {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
};

const loadColors = () => {
  const loadColorFamily = (name: 'primary' | 'success' | 'warning' | 'danger' | 'info') => {
    const mainColor = getCSSVariable(`--el-color-${name}`);
    if (!mainColor) return;

    colors.value[name] = mainColor;

    for (let i = 1; i <= 9; i++) {
      const lightColorKey = `${name}Light${i}`;
      let lightColor = getCSSVariable(`--el-color-${name}-light-${i}`);

      // 如果 CSS 变量不存在，则动态生成
      if (!lightColor) {
        // 在暗色模式下，light 变体实际上是变暗的（向黑色混合）
        // 在明亮模式下，light 变体是变亮的（向白色混合）
        const adjustFn = isDark.value ? darkenColor : lightenColor;
        lightColor = adjustFn(mainColor, i * 10);
      }
      colors.value[lightColorKey] = lightColor;
    }
  };

  // 加载所有颜色族
  loadColorFamily('primary');
  loadColorFamily('success');
  loadColorFamily('warning');
  loadColorFamily('danger');
  loadColorFamily('info');

  // 文本颜色
  colors.value.textPrimary = getCSSVariable('--el-text-color-primary');
  colors.value.textRegular = getCSSVariable('--el-text-color-regular');
  colors.value.textSecondary = getCSSVariable('--el-text-color-secondary');
  colors.value.textPlaceholder = getCSSVariable('--el-text-color-placeholder');

  // 边框颜色
  colors.value.borderDarker = getCSSVariable('--el-border-color-darker');
  colors.value.borderDark = getCSSVariable('--el-border-color-dark');
  colors.value.border = getCSSVariable('--el-border-color');
  colors.value.borderLight = getCSSVariable('--el-border-color-light');
  colors.value.borderLighter = getCSSVariable('--el-border-color-lighter');

  // 填充颜色
  colors.value.fillDarker = getCSSVariable('--el-fill-color-darker');
  colors.value.fillDark = getCSSVariable('--el-fill-color-dark');
  colors.value.fill = getCSSVariable('--el-fill-color');
  colors.value.fillLight = getCSSVariable('--el-fill-color-light');
  colors.value.fillLighter = getCSSVariable('--el-fill-color-lighter');

  // 背景颜色
  colors.value.bg = getCSSVariable('--el-bg-color');
  colors.value.bgPage = getCSSVariable('--el-bg-color-page');
  colors.value.bgOverlay = getCSSVariable('--el-bg-color-overlay');

  // 遮罩
  colors.value.mask = getCSSVariable('--el-mask-color');
  colors.value.maskExtra = getCSSVariable('--el-mask-color-extra-light');
};

onMounted(() => {
  loadColors();
});

// 监听主题变化，重新加载颜色
watch(isDark, async () => {
  // 等待 DOM 更新
  await nextTick();
  // 使用 requestAnimationFrame 确保 CSS 变量已经更新
  requestAnimationFrame(() => {
    loadColors();
  });
});
</script>

<style scoped>
.theme-color-palette {
  max-width: 1600px;
  margin: 0 auto;
}

.section {
  margin-bottom: 32px;
  padding: 20px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background-color: var(--el-bg-color);
}

.section-title {
  margin-top: 0;
  margin-bottom: 16px;
  color: var(--el-text-color-primary);
  font-size: 18px;
  font-weight: 600;
  border-bottom: 2px solid var(--el-color-primary);
  padding-bottom: 8px;
}

.color-category {
  margin-bottom: 24px;
}

.color-category:last-child {
  margin-bottom: 0;
}

.category-title {
  margin: 0 0 12px 0;
  color: var(--el-text-color-regular);
  font-size: 16px;
  font-weight: 500;
}

.color-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.color-card {
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
  backdrop-filter: blur(var(--ui-blur));
}

.color-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.color-card.main-color {
  border: 2px solid var(--el-color-primary);
}

.color-preview {
  height: 80px;
  width: 100%;
  border-bottom: 1px solid var(--el-border-color);
}

.color-info {
  padding: 8px 12px;
  background-color: var(--el-bg-color);
}

.color-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.color-value {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: 'Courier New', monospace;
}
</style>
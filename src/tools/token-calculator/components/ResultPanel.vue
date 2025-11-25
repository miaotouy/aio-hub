<template>
  <div ref="rootEl" class="result-panel">
    <div class="panel-header">
      <span class="panel-title">Token 分析</span>
      <div v-if="isCalculating" class="calculating-indicator">
        <el-icon class="is-loading">
          <Loading />
        </el-icon>
        计算中...
      </div>
    </div>
    <div class="panel-content">
      <!-- 新版统计区域 -->
      <div class="stats-container">
        <!-- 核心指标卡片 -->
        <div class="summary-card">
          <!-- 左侧：总数 -->
          <div class="total-section">
            <div class="stat-label">Total Tokens</div>
            <div class="total-value">
              <span class="number">{{ calculationResult.count }}</span>
            </div>
            <div v-if="calculationResult.isEstimated" class="estimate-badge">
              <el-icon><WarningFilled /></el-icon>
              <span>估算值</span>
            </div>
          </div>

          <!-- 右侧：分布详情 -->
          <div class="breakdown-section">
            <!-- 文本 -->
            <div class="breakdown-item">
              <div class="item-icon text-icon">
                <el-icon><Document /></el-icon>
              </div>
              <div class="item-content">
                <div class="item-header">
                  <span class="item-label">文本</span>
                  <span class="item-value">{{ calculationResult.textTokenCount || (calculationResult.count - (calculationResult.mediaTokenCount || 0)) }}</span>
                </div>
                <div class="progress-bg">
                  <div 
                    class="progress-bar text-bar" 
                    :style="{ width: getPercentage(calculationResult.textTokenCount || (calculationResult.count - (calculationResult.mediaTokenCount || 0))) }"
                  ></div>
                </div>
              </div>
            </div>

            <!-- 图片 -->
            <div class="breakdown-item" :class="{ 'is-empty': !calculationResult.imageTokenCount }">
              <div class="item-icon image-icon">
                <el-icon><Picture /></el-icon>
              </div>
              <div class="item-content">
                <div class="item-header">
                  <span class="item-label">图片</span>
                  <span class="item-value">{{ calculationResult.imageTokenCount || 0 }}</span>
                </div>
                <div class="progress-bg">
                  <div 
                    class="progress-bar image-bar" 
                    :style="{ width: getPercentage(calculationResult.imageTokenCount) }"
                  ></div>
                </div>
              </div>
            </div>

            <!-- 视频 -->
            <div class="breakdown-item" :class="{ 'is-empty': !calculationResult.videoTokenCount }">
              <div class="item-icon video-icon">
                <el-icon><VideoPlay /></el-icon>
              </div>
              <div class="item-content">
                <div class="item-header">
                  <span class="item-label">视频</span>
                  <span class="item-value">{{ calculationResult.videoTokenCount || 0 }}</span>
                </div>
                <div class="progress-bg">
                  <div 
                    class="progress-bar video-bar" 
                    :style="{ width: getPercentage(calculationResult.videoTokenCount) }"
                  ></div>
                </div>
              </div>
            </div>

            <!-- 音频 -->
            <div class="breakdown-item" :class="{ 'is-empty': !calculationResult.audioTokenCount }">
              <div class="item-icon audio-icon">
                <el-icon><Microphone /></el-icon>
              </div>
              <div class="item-content">
                <div class="item-header">
                  <span class="item-label">音频</span>
                  <span class="item-value">{{ calculationResult.audioTokenCount || 0 }}</span>
                </div>
                <div class="progress-bg">
                  <div 
                    class="progress-bar audio-bar" 
                    :style="{ width: getPercentage(calculationResult.audioTokenCount) }"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 辅助信息网格 -->
        <div class="details-grid">
          <div class="detail-card">
            <div class="detail-label">分词器</div>
            <div class="detail-value tokenizer-name" :title="calculationResult.tokenizerName">
              {{ calculationResult.tokenizerName }}
            </div>
          </div>
          <div class="detail-card">
            <div class="detail-label">字符数</div>
            <div class="detail-value">{{ characterCount }}</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">Token/字符</div>
            <div class="detail-value">
              {{
                characterCount > 0
                  ? (
                      (calculationResult.textTokenCount || (calculationResult.count - (calculationResult.mediaTokenCount || 0))) /
                      characterCount
                    ).toFixed(3)
                  : "0"
              }}
            </div>
          </div>
        </div>
      </div>

      <!-- Token 可视化区域 -->
      <div class="visualization-section">
        <div class="section-header">
          <div class="section-title">Token 分块可视化</div>
          <div
            v-if="
              tokenizedText.length > 0 &&
              (calculationResult.textTokenCount || (calculationResult.count - (calculationResult.mediaTokenCount || 0))) >
                tokenizedText.length
            "
            class="truncation-notice"
          >
            <el-icon>
              <WarningFilled />
            </el-icon>
            显示 {{ tokenizedText.length }} /
            {{ calculationResult.textTokenCount || (calculationResult.count - (calculationResult.mediaTokenCount || 0)) }} 个文本 Token
          </div>
        </div>
        <div v-if="tokenizedText.length > 0" ref="tokenBlocksContainer" class="token-blocks">
          <!-- 虚拟滚动容器 -->
          <div
            :style="{
              height: `${totalSize}px`,
              width: '100%',
              position: 'relative',
            }"
          >
            <!-- 仅渲染当前可见的若干个 token 分组 -->
            <div
              v-for="virtualItem in virtualItems"
              :key="virtualItem.index"
              :data-index="virtualItem.index"
              :ref="
                (el) => {
                  if (el) virtualizer.measureElement(el as HTMLElement);
                }
              "
              :style="{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }"
              class="token-block-group"
            >
              <span
                v-for="(token, localIndex) in getBlockTokens(virtualItem.index)"
                :key="getGlobalTokenIndex(virtualItem.index, localIndex)"
                class="token-block"
                :style="{
                  backgroundColor: getTokenColor(
                    getGlobalTokenIndex(virtualItem.index, localIndex)
                  ),
                }"
                :title="`Token ${getGlobalTokenIndex(virtualItem.index, localIndex) + 1}: ${token.text}`"
              >
                {{ token.text }}
              </span>
            </div>
          </div>
        </div>
        <div v-else class="empty-placeholder">暂无文本数据</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { useElementSize } from "@vueuse/core";
import { 
  Loading, 
  WarningFilled, 
  Document, 
  Picture, 
  VideoPlay, 
  Microphone 
} from "@element-plus/icons-vue";
import type {
  TokenCalculationResult,
  TokenBlock,
} from "@/tools/token-calculator/composables/useTokenCalculatorState";

interface Props {
  isCalculating: boolean;
  calculationResult: TokenCalculationResult;
  tokenizedText: TokenBlock[];
  characterCount: number;
  getTokenColor: (index: number) => string;
}

const props = defineProps<Props>();

// 计算百分比
const getPercentage = (value: number | undefined) => {
  if (!value || props.calculationResult.count === 0) return '0%';
  return `${(value / props.calculationResult.count * 100).toFixed(1)}%`;
};

// 滚动容器（可视区域）
const tokenBlocksContainer = ref<HTMLElement | null>(null);

// 监听容器宽度变化
const { width: containerWidth } = useElementSize(tokenBlocksContainer);

// Token 样式常量（与 CSS 严格对应）
// CSS: .token-block { padding: 3px 6px; border: 1px; font-size: 14px; line-height: 1.8; }
// CSS: .token-block-group { gap: 3px; padding-bottom: 4px; }
const STYLE_CONSTANTS = {
  CHAR_WIDTH: 4.8, // Consolas 14px 混合字符平均宽度（英文~8.4px，中文~14px）
  TOKEN_PADDING: 3 * 2 + 6 * 2, // padding: 3px 6px = 18px
  TOKEN_BORDER: 1 * 2, // border: 1px = 2px
  TOKEN_GAP: 3, // gap: 3px
  TOKEN_HEIGHT: 14 * 1.8 + 3 * 2 + 1 * 2, // font-size * line-height + padding + border = 33.2px
  GROUP_MARGIN: 4, // 组与组之间的额外垂直留白（padding-bottom）
} as const;

const ROW_HEIGHT = STYLE_CONSTANTS.TOKEN_HEIGHT + STYLE_CONSTANTS.TOKEN_GAP; // 36.2px

/**
 * 动态计算每组应该包含多少个 token
 * 基于容器宽度和 token 文本长度智能分组
 */
const calculateOptimalBlockSize = (containerWidth: number): number => {
  if (!containerWidth || containerWidth < 100) {
    return 32; // 默认值
  }

  // 计算平均每个 token 的宽度
  const tokens = props.tokenizedText || [];
  if (tokens.length === 0) return 32;

  const avgTokenWidth =
    tokens.reduce((sum, token) => {
      const textWidth = token.text.length * STYLE_CONSTANTS.CHAR_WIDTH;
      return (
        sum +
        textWidth +
        STYLE_CONSTANTS.TOKEN_PADDING +
        STYLE_CONSTANTS.TOKEN_BORDER +
        STYLE_CONSTANTS.TOKEN_GAP
      );
    }, 0) / tokens.length;

  // 估算每行能放多少个 token
  const tokensPerRow = Math.max(1, Math.floor(containerWidth / avgTokenWidth));

  // 计算合适的分组大小：尽量让每组占用 4-8 行
  // 这样既能保证虚拟滚动的性能，又能让每组有合理的高度
  const targetRows = 6;
  const optimalSize = Math.max(32, Math.min(256, tokensPerRow * targetRows));

  return Math.floor(optimalSize);
};

// 动态计算的分组大小
const dynamicBlockSize = computed(() => calculateOptimalBlockSize(containerWidth.value));

// 根据动态分组大小切分 token
const virtualBlocks = computed(() => {
  const blocks: { start: number; end: number; estimatedHeight: number }[] = [];
  const tokens = props.tokenizedText || [];
  const width = containerWidth.value || 0;
  const maxTokensPerBlock = Math.max(16, dynamicBlockSize.value || 32);

  if (tokens.length === 0) return blocks;
  // 容器宽度未知时，退化为简单分组，避免出现超大 DOM 元素
  if (width < 100) {
    for (let i = 0; i < tokens.length; i += maxTokensPerBlock) {
      const end = Math.min(i + maxTokensPerBlock, tokens.length);
      const rows = 3; // 粗略估算一个中等高度，后续会通过 measureElement 校正
      const estimatedHeight =
        Math.max(ROW_HEIGHT, rows * ROW_HEIGHT) + STYLE_CONSTANTS.GROUP_MARGIN;
      blocks.push({ start: i, end, estimatedHeight });
    }
    return blocks;
  }

  const TARGET_ROWS_PER_BLOCK = 6;
  const MAX_ROWS_PER_BLOCK = 9;

  let start = 0;

  // 按"行数"进行自适应分组：尽量让每组占用 2-4 行，并尽量填满每一行的宽度
  while (start < tokens.length) {
    let end = start;
    let rows = 1;
    let currentRowWidth = 0;

    while (end < tokens.length && end - start < maxTokensPerBlock) {
      const token = tokens[end];
      const tokenWidth =
        token.text.length * STYLE_CONSTANTS.CHAR_WIDTH +
        STYLE_CONSTANTS.TOKEN_PADDING +
        STYLE_CONSTANTS.TOKEN_BORDER +
        STYLE_CONSTANTS.TOKEN_GAP;

      if (tokenWidth >= width) {
        // 超长 token，独占一行
        if (currentRowWidth > 0) {
          rows++;
        }
        currentRowWidth = width;
      } else if (currentRowWidth + tokenWidth > width) {
        // 换行
        rows++;
        currentRowWidth = tokenWidth;
      } else {
        currentRowWidth += tokenWidth;
      }

      end++;

      const reachedTargetRows = rows >= TARGET_ROWS_PER_BLOCK;
      const reachedMaxRows = rows >= MAX_ROWS_PER_BLOCK;

      if (reachedMaxRows) {
        break;
      }

      if (reachedTargetRows && end < tokens.length) {
        const nextToken = tokens[end];
        const nextWidth =
          nextToken.text.length * STYLE_CONSTANTS.CHAR_WIDTH +
          STYLE_CONSTANTS.TOKEN_PADDING +
          STYLE_CONSTANTS.TOKEN_BORDER +
          STYLE_CONSTANTS.TOKEN_GAP;

        // 如果再塞一个 token 就大概率需要换行，则结束当前分组
        if (currentRowWidth + nextWidth > width) {
          break;
        }
      }
    }

    const estimatedHeight = Math.max(ROW_HEIGHT, rows * ROW_HEIGHT) + STYLE_CONSTANTS.GROUP_MARGIN;
    blocks.push({ start, end, estimatedHeight });
    start = end;
  }

  return blocks;
});

const blockCount = computed(() => virtualBlocks.value.length);

const virtualizer = useVirtualizer({
  get count() {
    return blockCount.value;
  },
  getScrollElement: () => tokenBlocksContainer.value,
  // 使用每个分组的动态估算高度
  estimateSize: (index) => {
    const block = virtualBlocks.value[index];
    return block?.estimatedHeight || 100;
  },
  overscan: 4,
});

// 当容器宽度或 token 数据变化时，重新测量所有虚拟项
watch([containerWidth, () => props.tokenizedText.length], () => {
  nextTick(() => {
    virtualizer.value.measure();
  });
});

const virtualItems = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

// 获取某个虚拟分组内的 token 列表
const getBlockTokens = (blockIndex: number) => {
  const block = virtualBlocks.value[blockIndex];
  if (!block) return [];
  return props.tokenizedText.slice(block.start, block.end);
};

// 将分组内下标转换为全局 token 下标
const getGlobalTokenIndex = (blockIndex: number, localIndex: number) => {
  const block = virtualBlocks.value[blockIndex];
  if (!block) return localIndex;
  return block.start + localIndex;
};

// 暴露根元素引用
const rootEl = ref<HTMLElement | null>(null);
defineExpose({ rootEl });
</script>

<style scoped>
.result-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 100px;
  overflow: hidden;
  box-sizing: border-box;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background-color: transparent;
  flex-shrink: 0;
  box-sizing: border-box;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.calculating-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--primary-color);
}

.panel-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 20px 20px 20px;
  gap: 16px;
  box-sizing: border-box;
  overflow: hidden;
}

/* 统计容器 */
.stats-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

/* 汇总卡片 */
.summary-card {
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  gap: 24px;
  box-shadow: var(--shadow-sm);
}

/* 左侧总数区域 */
.total-section {
  flex: 1;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  border-right: 1px solid var(--border-color-light);
  padding-right: 20px;
}

.stat-label {
  font-size: 13px;
  color: var(--text-color-secondary);
  margin-bottom: 8px;
  font-weight: 500;
}

.total-value {
  display: flex;
  align-items: baseline;
  line-height: 1;
}

.total-value .number {
  font-size: 42px;
  font-weight: 700;
  color: var(--primary-color);
  font-family: "Consolas", "Monaco", monospace;
  letter-spacing: -1px;
}

.estimate-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  padding: 4px 8px;
  background-color: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

/* 右侧分布详情 */
.breakdown-section {
  flex: 2;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.breakdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.breakdown-item.is-empty {
  opacity: 0.4;
  filter: grayscale(1);
}

.item-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.text-icon { background-color: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.image-icon { background-color: rgba(16, 185, 129, 0.1); color: #10b981; }
.video-icon { background-color: rgba(139, 92, 246, 0.1); color: #8b5cf6; }
.audio-icon { background-color: rgba(245, 158, 11, 0.1); color: #f59e0b; }

.item-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.item-label {
  color: var(--text-color-secondary);
}

.item-value {
  font-weight: 600;
  color: var(--text-color);
  font-family: "Consolas", monospace;
}

.progress-bg {
  height: 4px;
  background-color: var(--border-color-light);
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.text-bar { background-color: #3b82f6; }
.image-bar { background-color: #10b981; }
.video-bar { background-color: #8b5cf6; }
.audio-bar { background-color: #f59e0b; }

/* 详情网格 */
.details-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.detail-card {
  background-color: var(--bg-color-soft);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.detail-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
  font-family: "Consolas", monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-value.tokenizer-name {
  font-size: 14px;
}

/* 可视化区域 */
.visualization-section {
  background-color: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 18px;
  box-sizing: border-box;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0; /* 关键：允许 flex item 缩小 */
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  flex-shrink: 0;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.truncation-notice {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #f59e0b;
  font-weight: 500;
}

.token-blocks {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 14px;
  line-height: 1.8;
  position: relative;
}

.token-block-group {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  align-content: flex-start;
  padding-bottom: 4px;
}

.token-block {
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  cursor: default;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.token-block:hover {
  transform: translateY(-2px);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.12);
  z-index: 1;
}

.empty-placeholder {
  text-align: center;
  color: var(--text-color-light);
  padding: 40px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .summary-card {
    flex-direction: column;
    gap: 16px;
  }
  
  .total-section {
    border-right: none;
    border-bottom: 1px solid var(--border-color-light);
    padding-right: 0;
    padding-bottom: 16px;
    align-items: center;
  }

  .breakdown-section {
    grid-template-columns: 1fr;
  }
}
</style>

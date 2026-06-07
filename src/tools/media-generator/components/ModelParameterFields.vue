<script setup lang="ts">
import { Sparkles, Info, ArrowLeftRight } from "lucide-vue-next";
import { useMediaGenParameterState } from "../composables/useMediaGenParameterState";

const {
  mediaType,
  params,
  sizeWidth,
  sizeHeight,
  swapSize,
  sizeMode,
  sizeOptions,
  aspectRatioOptions,
  resolutionOptions,
  sizeValidationError,
  supportsQuality,
  qualityOptions,
  supportsStyle,
  styleOptions,
  supportsNegativePrompt,
  supportsSeed,
  supportsTransparency,
  backgroundOptions,
  supportsInputFidelity,
  supportsPartialImages,
  maxPartialImages,
  supportsSteps,
  supportsCfg,
  supportsModeration,
  moderationOptions,
  supportsOutputFormat,
  outputFormatOptions,
  supportsOutputCompression,
  supportsBatch,
  maxBatchSize,
  durationSeconds,
  supportsDuration,
  durationOptions,
  durationMin,
  durationMax,
  durationStep,
  supportsPromptEnhancement,
  supportsGenerateAudio,
  supportsWatermark,
  supportsCameraFixed,
  supportsMovementAmplitude,
  movementAmplitudeOptions,
  isSuno,
  isMiniMaxMusic,
  isMiniMaxCoverModel,
  isMiniMaxTextMusicModel,
  minimaxSampleRate,
  minimaxBitrate,
  minimaxAudioFormat,
  speechVoiceOptions,
  speechFormatOptions,
  speechVoice,
  speechFormat,
  speechSpeed,
  speechInstructions,
} = useMediaGenParameterState();

const handleCoverWorkflowChange = (value: string | number | boolean) => {
  if (value === "two_step") {
    if (params.value.cover_feature_id) {
      params.value.cover_reference_mode = "feature";
    }
    return;
  }
  params.value.cover_reference_mode = "audio";
};
</script>

<template>
  <div class="model-parameter-fields">
    <!-- 图片特定参数 -->
    <template v-if="mediaType === 'image'">
      <!-- xAI 宽高比模式 -->
      <template v-if="sizeMode === 'aspectRatio'">
        <div class="section">
          <div class="section-title">宽高比 (Aspect Ratio)</div>
          <el-select
            v-model="params.aspectRatio"
            size="small"
            style="width: 100%"
          >
            <el-option
              v-for="opt in aspectRatioOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </div>
        <div v-if="resolutionOptions.length > 0" class="section">
          <div class="section-title">分辨率 (Resolution)</div>
          <el-radio-group v-model="params.resolution" size="small">
            <el-radio-button
              v-for="opt in resolutionOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </div>
      </template>

      <!-- 标准尺寸模式 -->
      <template v-else>
        <div class="section">
          <div class="section-title">
            <span>分辨率</span>
            <el-dropdown
              trigger="click"
              @command="(val: string) => (params.size = val)"
            >
              <span class="preset-link">
                预设 <el-icon><Sparkles /></el-icon>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="opt in sizeOptions"
                    :key="opt.value"
                    :command="opt.value"
                  >
                    {{ opt.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
          <div class="size-control-row">
            <el-input-number
              v-model="sizeWidth"
              :min="64"
              :max="4096"
              :step="64"
              size="small"
              controls-position="right"
              class="size-input"
            />
            <el-button size="small" circle class="swap-btn" @click="swapSize">
              <el-icon><ArrowLeftRight /></el-icon>
            </el-button>
            <el-input-number
              v-model="sizeHeight"
              :min="64"
              :max="4096"
              :step="64"
              size="small"
              controls-position="right"
              class="size-input"
            />
          </div>
          <div v-if="sizeValidationError" class="validation-error">
            {{ sizeValidationError }}
          </div>
        </div>
      </template>

      <div v-if="supportsQuality" class="section">
        <div class="section-title">质量级别</div>
        <el-select v-model="params.quality" size="small" style="width: 100%">
          <el-option
            v-for="opt in qualityOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </div>

      <div v-if="supportsStyle" class="section">
        <div class="section-title">生成风格</div>
        <el-select v-model="params.style" size="small" style="width: 100%">
          <el-option
            v-for="opt in styleOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </div>

      <div v-if="supportsNegativePrompt" class="section">
        <div class="section-title">负向提示词 (Negative Prompt)</div>
        <el-input
          v-model="params.negativePrompt"
          type="textarea"
          :rows="3"
          placeholder="不希望在图片中出现的内容..."
          size="small"
        />
      </div>

      <div v-if="supportsTransparency" class="section">
        <div class="section-title">背景设置</div>
        <el-radio-group v-model="params.background" size="small">
          <el-radio-button
            v-for="opt in backgroundOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </el-radio-button>
        </el-radio-group>
      </div>

      <div v-if="supportsInputFidelity" class="section">
        <div class="section-title">输入保真度 (Fidelity)</div>
        <el-radio-group v-model="params.inputFidelity" size="small">
          <el-radio-button value="low">标准</el-radio-button>
          <el-radio-button value="high">高保真 (保留面部/Logo)</el-radio-button>
        </el-radio-group>
      </div>

      <div v-if="supportsPartialImages" class="section">
        <div class="section-title">
          <span>流式预览图 ({{ params.partialImages ?? 0 }} 张)</span>
          <el-tooltip content="生成过程中展示的渐进预览图数量，0 表示关闭预览">
            <el-icon class="info-icon"><Info /></el-icon>
          </el-tooltip>
        </div>
        <div class="slider-wrapper">
          <el-slider
            v-model="params.partialImages"
            :min="0"
            :max="maxPartialImages"
            :step="1"
            show-stops
            size="small"
          />
        </div>
      </div>

      <div v-if="supportsModeration" class="section">
        <div class="section-title">内容审核 (Moderation)</div>
        <el-radio-group v-model="params.moderation" size="small">
          <el-radio-button
            v-for="opt in moderationOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </el-radio-button>
        </el-radio-group>
      </div>

      <div v-if="supportsOutputFormat" class="section">
        <div class="section-title">输出格式</div>
        <el-radio-group v-model="params.outputFormat" size="small">
          <el-radio-button
            v-for="opt in outputFormatOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </el-radio-button>
        </el-radio-group>
      </div>

      <div v-if="supportsOutputCompression" class="section">
        <div class="section-title">
          输出压缩 ({{ params.outputCompression }}%)
        </div>
        <div class="slider-wrapper">
          <el-slider
            v-model="params.outputCompression"
            :min="0"
            :max="100"
            size="small"
          />
        </div>
      </div>

      <div v-if="supportsBatch" class="section">
        <div class="section-title">批量生成 (n)</div>
        <div class="slider-wrapper">
          <el-slider
            v-model="params.n"
            :min="1"
            :max="maxBatchSize"
            :step="1"
            show-stops
            size="small"
          />
        </div>
      </div>
    </template>

    <!-- 视频特定参数 -->
    <template v-else-if="mediaType === 'video'">
      <template v-if="sizeMode === 'aspectRatio'">
        <div class="section">
          <div class="section-title">宽高比 (Aspect Ratio)</div>
          <el-select
            v-model="params.aspectRatio"
            size="small"
            style="width: 100%"
          >
            <el-option
              v-for="opt in aspectRatioOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </div>
        <div v-if="resolutionOptions.length > 0" class="section">
          <div class="section-title">分辨率 (Resolution)</div>
          <el-radio-group v-model="params.resolution" size="small">
            <el-radio-button
              v-for="opt in resolutionOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </div>
      </template>

      <template v-else>
        <div class="section">
          <div class="section-title">
            <span>分辨率</span>
            <el-dropdown
              trigger="click"
              @command="(val: string) => (params.size = val)"
            >
              <span class="preset-link">
                预设 <el-icon><Sparkles /></el-icon>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="opt in sizeOptions"
                    :key="opt.value"
                    :command="opt.value"
                  >
                    {{ opt.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
          <div class="size-control-row">
            <el-input-number
              v-model="sizeWidth"
              :min="64"
              :max="4096"
              :step="64"
              size="small"
              controls-position="right"
              class="size-input"
            />
            <el-button size="small" circle class="swap-btn" @click="swapSize">
              <el-icon><ArrowLeftRight /></el-icon>
            </el-button>
            <el-input-number
              v-model="sizeHeight"
              :min="64"
              :max="4096"
              :step="64"
              size="small"
              controls-position="right"
              class="size-input"
            />
          </div>
          <div v-if="sizeValidationError" class="validation-error">
            {{ sizeValidationError }}
          </div>
        </div>
      </template>

      <div v-if="supportsDuration" class="section">
        <div class="section-title">时长 (秒)</div>
        <el-radio-group
          v-if="durationOptions.length > 0"
          v-model="durationSeconds"
          size="small"
        >
          <el-radio-button
            v-for="opt in durationOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </el-radio-button>
        </el-radio-group>
        <div v-else class="slider-wrapper">
          <el-slider
            v-model="durationSeconds"
            :min="durationMin"
            :max="durationMax"
            :step="durationStep"
            show-input
            size="small"
          />
        </div>
      </div>

      <div v-if="supportsStyle" class="section">
        <div class="section-title">生成风格</div>
        <el-select v-model="params.style" size="small" style="width: 100%">
          <el-option
            v-for="opt in styleOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </div>

      <div v-if="supportsNegativePrompt" class="section">
        <div class="section-title">负向提示词 (Negative Prompt)</div>
        <el-input
          v-model="params.negativePrompt"
          type="textarea"
          :rows="3"
          placeholder="不希望在视频中出现的内容..."
          size="small"
        />
      </div>

      <div v-if="supportsMovementAmplitude" class="section">
        <div class="section-title">运动幅度</div>
        <el-select
          v-model="params.movementAmplitude"
          size="small"
          style="width: 100%"
        >
          <el-option
            v-for="opt in movementAmplitudeOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </div>

      <div v-if="supportsPromptEnhancement" class="section switch-section">
        <span>提示词增强</span>
        <el-switch v-model="params.promptEnhancement" size="small" />
      </div>

      <div v-if="supportsGenerateAudio" class="section switch-section">
        <span>生成音频</span>
        <el-switch v-model="params.generateAudio" size="small" />
      </div>

      <div v-if="supportsCameraFixed" class="section switch-section">
        <span>固定镜头</span>
        <el-switch v-model="params.cameraFixed" size="small" />
      </div>

      <div v-if="supportsWatermark" class="section switch-section">
        <span>水印</span>
        <el-switch v-model="params.watermark" size="small" />
      </div>
    </template>

    <!-- 语音特定参数 -->
    <template v-else-if="mediaType === 'speech'">
      <div class="section">
        <div class="section-title">声音 (Voice)</div>
        <el-select v-model="speechVoice" size="small" style="width: 100%">
          <el-option
            v-for="voice in speechVoiceOptions"
            :key="voice"
            :label="voice"
            :value="voice"
          />
        </el-select>
      </div>

      <div class="section">
        <div class="section-title">输出格式</div>
        <el-radio-group v-model="speechFormat" size="small">
          <el-radio-button
            v-for="format in speechFormatOptions"
            :key="format"
            :value="format"
          >
            {{ format }}
          </el-radio-button>
        </el-radio-group>
      </div>

      <div class="section">
        <div class="section-title">语速 ({{ speechSpeed }})</div>
        <div class="slider-wrapper">
          <el-slider
            v-model="speechSpeed"
            :min="0.25"
            :max="4"
            :step="0.05"
            show-input
            size="small"
          />
        </div>
      </div>

      <div class="section">
        <div class="section-title">朗读指令 (Instructions)</div>
        <el-input
          v-model="speechInstructions"
          type="textarea"
          :rows="3"
          placeholder="例如：温柔、清晰、带一点兴奋感..."
          size="small"
        />
      </div>
    </template>

    <!-- 音乐特定参数 -->
    <template v-else-if="mediaType === 'music'">
      <template v-if="isMiniMaxMusic">
        <div v-if="isMiniMaxTextMusicModel" class="section">
          <div class="section-title">生成模式</div>
          <el-radio-group v-model="params.minimax_music_mode" size="small">
            <el-radio-button value="song">歌曲</el-radio-button>
            <el-radio-button value="instrumental">纯音乐</el-radio-button>
          </el-radio-group>
        </div>

        <div
          v-if="params.minimax_music_mode !== 'instrumental'"
          class="section"
        >
          <div class="section-title">歌词来源</div>
          <el-radio-group v-model="params.lyrics_source" size="small">
            <el-radio-button value="optimizer">
              {{ isMiniMaxCoverModel ? "提取" : "自动" }}
            </el-radio-button>
            <el-radio-button value="manual">手填</el-radio-button>
            <el-radio-button value="generate">先生成</el-radio-button>
          </el-radio-group>
        </div>

        <div
          v-if="
            params.minimax_music_mode !== 'instrumental' &&
            params.lyrics_source !== 'optimizer'
          "
          class="section"
        >
          <div class="section-title">歌词</div>
          <el-input
            v-model="params.lyrics"
            type="textarea"
            :rows="5"
            :placeholder="
              isMiniMaxCoverModel
                ? '可选；留空则从参考音频提取歌词'
                : '[Verse]\n...'
            "
            size="small"
          />
        </div>

        <div
          v-if="
            params.minimax_music_mode !== 'instrumental' &&
            params.lyrics_source === 'generate'
          "
          class="section"
        >
          <div class="section-title">歌词生成指令</div>
          <el-input
            v-model="params.lyrics_generation_prompt"
            type="textarea"
            :rows="2"
            :placeholder="
              isMiniMaxCoverModel
                ? '描述要生成或改写的翻唱歌词'
                : '留空则使用主输入框描述'
            "
            size="small"
          />
        </div>

        <div v-if="isMiniMaxCoverModel" class="section">
          <div class="section-title">翻唱流程</div>
          <el-radio-group
            v-model="params.cover_workflow"
            size="small"
            @change="handleCoverWorkflowChange"
          >
            <el-radio-button value="one_step">一步</el-radio-button>
            <el-radio-button value="two_step">两步</el-radio-button>
          </el-radio-group>
        </div>

        <div v-if="isMiniMaxCoverModel" class="section">
          <div class="section-title">参考音频 URL</div>
          <el-input
            v-model="params.audio_url"
            placeholder="或在输入框添加一个音频附件"
            size="small"
          />
        </div>

        <div class="section">
          <div class="section-title">输出格式</div>
          <el-radio-group v-model="params.output_format" size="small">
            <el-radio-button value="url">URL</el-radio-button>
            <el-radio-button value="hex">HEX</el-radio-button>
          </el-radio-group>
        </div>

        <div class="section">
          <div class="section-title">音频设置</div>
          <div class="mini-field-grid">
            <el-select v-model="minimaxAudioFormat" size="small">
              <el-option label="MP3" value="mp3" />
              <el-option label="WAV" value="wav" />
              <el-option label="PCM" value="pcm" />
            </el-select>
            <el-select v-model="minimaxSampleRate" size="small">
              <el-option label="44.1 kHz" :value="44100" />
              <el-option label="32 kHz" :value="32000" />
              <el-option label="24 kHz" :value="24000" />
              <el-option label="16 kHz" :value="16000" />
            </el-select>
            <el-select v-model="minimaxBitrate" size="small">
              <el-option label="256 kbps" :value="256000" />
              <el-option label="128 kbps" :value="128000" />
              <el-option label="64 kbps" :value="64000" />
              <el-option label="32 kbps" :value="32000" />
            </el-select>
          </div>
        </div>
      </template>
      <template v-else-if="isSuno">
        <div class="section">
          <div class="section-title">生成模式</div>
          <el-radio-group v-model="params.suno_mode" size="small">
            <el-radio-button value="simple">灵感模式</el-radio-button>
            <el-radio-button value="custom">自定义模式</el-radio-button>
          </el-radio-group>
        </div>

        <div class="section">
          <div class="section-title">模型版本</div>
          <el-select v-model="params.mv" size="small" style="width: 100%">
            <el-option label="Chirp v4 (最新)" value="chirp-v4" />
            <el-option label="Chirp v3.5" value="chirp-v3-5" />
            <el-option label="Chirp v3.0" value="chirp-auk" />
          </el-select>
        </div>

        <div v-if="params.suno_mode === 'custom'" class="section">
          <div class="section-title">风格标签 (Tags)</div>
          <el-input
            v-model="params.tags"
            type="textarea"
            :rows="2"
            placeholder="例如: heavy metal, male vocals..."
            size="small"
          />
        </div>

        <div v-if="params.suno_mode === 'custom'" class="section">
          <div class="section-title">歌曲标题</div>
          <el-input
            v-model="params.title"
            placeholder="可选标题"
            size="small"
          />
        </div>

        <div class="section">
          <div class="section-title">纯音乐</div>
          <el-switch v-model="params.make_instrumental" size="small" />
        </div>
      </template>
      <template v-else>
        <div class="section">
          <div class="section-title">音频质量</div>
          <el-select v-model="params.quality" size="small" style="width: 100%">
            <el-option label="标准 (128kbps)" value="standard" />
            <el-option label="高音质 (320kbps)" value="hd" />
          </el-select>
        </div>
      </template>
    </template>

    <!-- 公共高级参数 -->
    <el-collapse class="advanced-collapse">
      <el-collapse-item name="advanced">
        <template #title>
          <div class="advanced-title">
            <el-icon><Sparkles /></el-icon>
            <span>高级参数</span>
          </div>
        </template>

        <div v-if="supportsSeed" class="section">
          <div class="section-title">
            <span>种子 (Seed)</span>
            <el-tooltip content="-1 表示随机">
              <el-icon class="info-icon"><Info /></el-icon>
            </el-tooltip>
          </div>
          <el-input-number
            v-model="params.seed"
            :min="-1"
            size="small"
            style="width: 100%"
          />
        </div>

        <div v-if="supportsSteps" class="section">
          <div class="section-title">迭代步数 (Steps)</div>
          <div class="slider-wrapper">
            <el-slider
              v-model="params.steps"
              :min="1"
              :max="100"
              size="small"
            />
          </div>
        </div>

        <div v-if="supportsCfg" class="section">
          <div class="section-title">引导系数 (CFG Scale)</div>
          <div class="slider-wrapper">
            <el-slider
              v-model="params.cfgScale"
              :min="1"
              :max="20"
              :step="0.5"
              size="small"
            />
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.model-parameter-fields,
.model-parameter-fields * {
  box-sizing: border-box;
}

.section {
  margin-bottom: 10px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.switch-section {
  min-height: 28px;
  padding: 6px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.preset-link {
  margin-left: auto;
  font-size: 11px;
  color: var(--el-color-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 2px;
  font-weight: normal;
}

.preset-link:hover {
  opacity: 0.8;
}

.size-control-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.size-input {
  flex: 1;
}

.size-input :deep(.el-input__inner) {
  text-align: left;
}

.swap-btn {
  color: var(--el-text-color-secondary);
  border-color: var(--border-color);
  background: transparent;
}

.swap-btn:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
}

.advanced-collapse {
  border: none;
  background: transparent;
}

.advanced-collapse :deep(.el-collapse-item__header) {
  background: transparent;
  border: none;
  height: 40px;
}

.advanced-collapse :deep(.el-collapse-item__wrap) {
  background: transparent;
  border: none;
}

.advanced-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-color-primary);
}

.info-icon {
  font-size: 12px;
  cursor: help;
}

.validation-error {
  color: var(--el-color-danger);
  font-size: 11px;
  margin-top: 4px;
}

.slider-wrapper {
  padding: 0 12px;
  width: 100%;
  overflow: hidden;
}

.mini-field-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}
</style>

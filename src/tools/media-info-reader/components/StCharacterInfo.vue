<template>
  <div class="st-character-container">
    <el-scrollbar class="main-scrollbar">
      <div class="content-wrapper" v-if="stDisplayData">
        <!-- Header Section -->
        <div class="st-card-view">
          <div class="st-header">
            <div class="header-main">
              <div class="info-container">
                <div class="name-line">
                  <h2 class="st-name">{{ stDisplayData.name || "Unknown Character" }}</h2>
                  <span v-if="stDisplayData.version" class="version-badge"
                    >v{{ stDisplayData.version }}</span
                  >
                </div>
                <div class="st-meta">
                  <div class="meta-tag" v-if="stDisplayData.creator">
                    <User :size="14" />
                    <span>{{ stDisplayData.creator }}</span>
                  </div>
                  <div class="meta-tag" v-if="stDisplayData.tags?.length">
                    <Tags :size="14" />
                    <span>{{ stDisplayData.tags.length }} Tags</span>
                  </div>
                  <div class="meta-tag" v-if="stDisplayData.regexCount">
                    <Zap :size="14" />
                    <span>{{ stDisplayData.regexCount }} Regex</span>
                  </div>
                </div>
              </div>
            </div>
            <!-- Tags Cloud -->
            <div v-if="stDisplayData.tags?.length" class="tags-cloud">
              <el-tag
                v-for="tag in stDisplayData.tags"
                :key="tag"
                size="small"
                effect="light"
                round
                class="st-tag"
              >
                {{ tag }}
              </el-tag>
            </div>
          </div>

          <div class="st-content-body">
            <!-- 1. Persona & Description -->
            <div class="content-section">
              <div class="section-header">
                <Fingerprint :size="18" />
                <span>角色设定</span>
              </div>
              <div class="section-body">
                <div class="info-card" v-if="stDisplayData.description">
                  <div class="card-header">
                    <span class="card-label">Description / 角色描述</span>
                    <CopyButton :text="stDisplayData.description" />
                  </div>
                  <div class="card-text">{{ stDisplayData.description }}</div>
                </div>
                <div class="info-card" v-if="stDisplayData.personality">
                  <div class="card-header">
                    <span class="card-label">Personality / 性格特质</span>
                    <CopyButton :text="stDisplayData.personality" />
                  </div>
                  <div class="card-text">{{ stDisplayData.personality }}</div>
                </div>
              </div>
            </div>

            <!-- 2. Prompts & Instructions -->
            <div
              class="content-section"
              v-if="stDisplayData.system_prompt || stDisplayData.post_history_instructions"
            >
              <div class="section-header">
                <Settings :size="18" />
                <span>提示词策略</span>
              </div>
              <div class="section-body">
                <div class="info-card" v-if="stDisplayData.system_prompt">
                  <div class="card-header">
                    <span class="card-label">System Prompt</span>
                    <CopyButton :text="stDisplayData.system_prompt" />
                  </div>
                  <div class="card-text code-font">{{ stDisplayData.system_prompt }}</div>
                </div>
                <div class="info-card" v-if="stDisplayData.post_history_instructions">
                  <div class="card-header">
                    <span class="card-label">Post History Instructions</span>
                    <CopyButton :text="stDisplayData.post_history_instructions" />
                  </div>
                  <div class="card-text code-font">
                    {{ stDisplayData.post_history_instructions }}
                  </div>
                </div>
              </div>
            </div>

            <!-- 3. Scenario & Examples -->
            <div class="content-section">
              <div class="section-header">
                <MessageSquare :size="18" />
                <span>对话与场景</span>
              </div>
              <div class="section-body">
                <div class="info-card" v-if="stDisplayData.scenario">
                  <div class="card-header">
                    <span class="card-label">Scenario / 场景设定</span>
                    <CopyButton :text="stDisplayData.scenario" />
                  </div>
                  <div class="card-text">{{ stDisplayData.scenario }}</div>
                </div>

                <!-- Greetings -->
                <div class="info-card" v-if="stDisplayData.first_mes">
                  <div class="card-header">
                    <span class="card-label">First Message / 首条消息</span>
                    <CopyButton :text="stDisplayData.first_mes" />
                  </div>
                  <div class="card-text assistant-msg">{{ stDisplayData.first_mes }}</div>
                </div>

                <div v-if="stDisplayData.alternate_greetings?.length" class="alternate-greetings">
                  <div
                    v-for="(greet, idx) in stDisplayData.alternate_greetings"
                    :key="idx"
                    class="info-card mini"
                  >
                    <div class="card-header">
                      <span class="card-label">Alternate Greeting {{ Number(idx) + 1 }}</span>
                      <CopyButton :text="greet" />
                    </div>
                    <div class="card-text assistant-msg">{{ greet }}</div>
                  </div>
                </div>

                <div class="info-card" v-if="stDisplayData.mes_example">
                  <div class="card-header">
                    <span class="card-label">Message Examples / 对话示例</span>
                    <CopyButton :text="stDisplayData.mes_example" />
                  </div>
                  <div class="card-text example-box">{{ stDisplayData.mes_example }}</div>
                </div>
              </div>
            </div>

            <!-- 4. Creator Notes -->
            <div class="content-section" v-if="stDisplayData.creator_notes">
              <div class="section-header">
                <Info :size="18" />
                <span>作者备注</span>
              </div>
              <div class="section-body">
                <div class="info-card creator-notes">
                  <div class="card-text">{{ stDisplayData.creator_notes }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ElTag, ElScrollbar } from "element-plus";
import { User, Tags, Fingerprint, MessageSquare, Settings, Info, Zap } from "lucide-vue-next";
import CopyButton from "./CopyButton.vue";

const props = defineProps<{
  stCharacterInfo: string;
}>();

// 解析 ST 角色卡数据，提取常用字段
const stDisplayData = computed(() => {
  if (!props.stCharacterInfo) return null;

  try {
    const data = JSON.parse(props.stCharacterInfo);
    const isV2V3 = data.spec === "chara_card_v2" || data.spec === "chara_card_v3" || data.data;
    const core = isV2V3 ? data.data : data;

    return {
      name: core?.name,
      description: core?.description,
      personality: core?.personality,
      scenario: core?.scenario,
      first_mes: core?.first_mes,
      mes_example: core?.mes_example,
      creator: core?.creator || core?.creatorcomment,
      version: core?.character_version,
      tags: core?.tags || [],
      system_prompt: core?.system_prompt,
      post_history_instructions: core?.post_history_instructions,
      alternate_greetings: core?.alternate_greetings || [],
      creator_notes: core?.creator_notes || core?.creatorcomment,
      regexCount: (core?.regex_scripts || core?.extensions?.regex_scripts)?.length || 0,
    };
  } catch (e) {
    return null;
  }
});
</script>

<style scoped>
.st-character-container {
  height: 100%;
  position: relative;
  background-color: var(--el-bg-color);
}

.content-wrapper {
  padding: 24px;
  max-width: 900px;
  margin: 0 auto;
}

.st-card-view {
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 20px;
}

/* Header */
.st-header {
  padding: 32px;
  background: var(--el-fill-color-lighter);
  border-bottom: 1px solid var(--border-color);
}

.header-main {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.info-container {
  flex: 1;
}

.name-line {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.st-name {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.version-badge {
  font-size: 11px;
  background: var(--el-fill-color-darker);
  color: var(--el-text-color-secondary);
  padding: 2px 8px;
  border-radius: 6px;
}

.st-meta {
  display: flex;
  gap: 16px;
}

.meta-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.tags-cloud {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.st-tag {
  border: none;
  background: var(--el-fill-color-darker);
  color: var(--el-text-color-regular);
}

/* Content Body */
.st-content-body {
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.content-section {
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--el-text-color-primary);
}

.section-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Info Card */
.info-card {
  background: var(--el-fill-color-blank);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  transition: border-color 0.2s;
}

.info-card:hover {
  border-color: var(--el-color-primary-light-5);
}

.info-card.mini {
  padding: 12px;
  background: var(--el-fill-color-lighter);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.card-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.card-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
}

.code-font {
  font-family: var(--el-font-family-mono);
  background: var(--el-fill-color-darker);
  padding: 12px;
  border-radius: 8px;
}

.assistant-msg {
  color: var(--el-color-success);
  border-left: 3px solid var(--el-color-success-light-5);
  padding-left: 12px;
}

.example-box {
  font-style: italic;
  opacity: 0.9;
}

.creator-notes {
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning-light-8);
}

.alternate-greetings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-left: 16px;
  border-left: 2px dashed var(--border-color);
}

@media (max-width: 768px) {
  .st-header {
    padding: 24px;
  }
  .st-content-body {
    padding: 20px;
  }
}
</style>

<template>
  <div class="tab-content scrollable st-content">
    <!-- 角色卡片视图 -->
    <div v-if="stDisplayData" class="st-card-view">
      <div class="st-header">
        <h2 class="st-name">{{ stDisplayData.name || "Unknown Character" }}</h2>
        <div class="st-meta">
          <el-tag v-if="stDisplayData.creator" size="small" effect="plain"
            >By {{ stDisplayData.creator }}</el-tag
          >
          <el-tag v-if="stDisplayData.version" size="small" effect="plain"
            >v{{ stDisplayData.version }}</el-tag
          >
        </div>
      </div>

      <div class="st-fields">
        <div class="info-section" v-if="stDisplayData.description">
          <div class="section-header">
            <span class="label">Description</span><CopyButton :text="stDisplayData.description" />
          </div>
          <div class="text-block">{{ stDisplayData.description }}</div>
        </div>

        <div class="info-section" v-if="stDisplayData.personality">
          <div class="section-header">
            <span class="label">Personality</span><CopyButton :text="stDisplayData.personality" />
          </div>
          <div class="text-block">{{ stDisplayData.personality }}</div>
        </div>

        <div class="info-section" v-if="stDisplayData.first_mes">
          <div class="section-header">
            <span class="label">First Message</span><CopyButton :text="stDisplayData.first_mes" />
          </div>
          <div class="text-block">{{ stDisplayData.first_mes }}</div>
        </div>

        <div class="info-section" v-if="stDisplayData.scenario">
          <div class="section-header">
            <span class="label">Scenario</span><CopyButton :text="stDisplayData.scenario" />
          </div>
          <div class="text-block">{{ stDisplayData.scenario }}</div>
        </div>

        <div class="info-section" v-if="stDisplayData.mes_example">
          <div class="section-header">
            <span class="label">Message Examples</span
            ><CopyButton :text="stDisplayData.mes_example" />
          </div>
          <div class="text-block">{{ stDisplayData.mes_example }}</div>
        </div>
      </div>
    </div>

    <el-divider content-position="left">原始数据</el-divider>

    <!-- 原始 JSON -->
    <div class="editor-container raw-json-editor">
      <RichCodeEditor
        :model-value="stCharacterInfo"
        language="json"
        :read-only="true"
        :minimap="false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ElTag, ElDivider } from "element-plus";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import CopyButton from "./CopyButton.vue";

const props = defineProps<{
  stCharacterInfo: string;
}>();

// 解析 ST 角色卡数据，提取常用字段
const stDisplayData = computed(() => {
  if (!props.stCharacterInfo) return null;

  try {
    const data = JSON.parse(props.stCharacterInfo);

    // 处理 V2/V3 格式 (数据在 data 字段下)
    if (data.spec === "chara_card_v2" || data.spec === "chara_card_v3" || data.data) {
      return {
        name: data.data?.name,
        description: data.data?.description,
        personality: data.data?.personality,
        scenario: data.data?.scenario,
        first_mes: data.data?.first_mes,
        mes_example: data.data?.mes_example,
        creator: data.data?.creator,
        version: data.data?.character_version,
        tags: data.data?.tags,
      };
    }

    // 处理 V1 格式 (扁平结构)
    return {
      name: data.name,
      description: data.description,
      personality: data.personality,
      scenario: data.scenario,
      first_mes: data.first_mes,
      mes_example: data.mes_example,
      creator: data.creator,
      version: data.character_version,
      tags: data.tags,
    };
  } catch (e) {
    return null;
  }
});
</script>

<style scoped>
.tab-content {
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label {
  font-weight: bold;
  color: var(--text-color);
  font-size: 0.95em;
}

.editor-container {
  width: 100%;
}

.raw-json-editor {
  height: 800px; /* 给原始数据一个固定高度 */
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

/* ST Content Styles */
.st-content {
  gap: 24px;
}

.st-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.st-name {
  margin: 0;
  font-size: 1.5em;
  color: var(--primary-color);
}

.st-meta {
  display: flex;
  gap: 8px;
}

.st-fields {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.text-block {
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 12px;
  font-size: 0.95em;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--text-color);
}
</style>

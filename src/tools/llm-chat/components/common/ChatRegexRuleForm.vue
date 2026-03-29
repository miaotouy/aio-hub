<template>
  <div class="chat-regex-rule-form">
    <!-- 预制规则 -->
    <div class="form-section preset-section">
      <div class="section-header" @click="togglePresets">
        <div class="section-title">
          <el-icon class="collapse-icon" :class="{ expanded: presetsExpanded }">
            <ChevronRight />
          </el-icon>
          预制规则
        </div>
        <span class="preset-hint">点击快速填充</span>
      </div>
      <el-collapse-transition>
        <div v-show="presetsExpanded" class="presets-content">
          <div class="preset-category" v-for="category in presetCategories" :key="category.name">
            <div class="category-name">{{ category.name }}</div>
            <div class="preset-tags">
              <el-tooltip
                v-for="preset in category.presets"
                :key="preset.name"
                :content="preset.description"
                placement="top"
              >
                <el-tag class="preset-tag" size="small" @click="applyPreset(preset)">
                  {{ preset.name }}
                </el-tag>
              </el-tooltip>
            </div>
          </div>
        </div>
      </el-collapse-transition>
    </div>

    <!-- 基础配置 -->
    <div class="form-section">
      <div class="section-title">基础配置</div>
      <el-form label-position="top" size="small">
        <el-form-item label="规则名称">
          <el-input v-model="localRule.name" placeholder="规则名称（可选）" />
        </el-form-item>

        <el-form-item label="正则表达式">
          <el-input
            v-model="localRule.regex"
            type="textarea"
            :rows="2"
            placeholder="正则表达式"
            class="mono-input"
          />
        </el-form-item>

        <el-form-item label="替换模式">
          <el-radio-group v-model="localRule.replacementType">
            <el-radio-button value="regex">简单替换</el-radio-button>
            <el-radio-button value="script">脚本处理</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="localRule.replacementType === 'regex'" label="替换内容">
          <el-input
            v-model="localRule.replacement"
            type="textarea"
            :rows="2"
            placeholder="替换内容，支持 $1, $2 等捕获组引用"
            class="mono-input"
          />
        </el-form-item>

        <el-form-item v-else label="自定义脚本">
          <div class="script-editor-container">
            <RichCodeEditor
              v-model="localRule.scriptContent"
              language="javascript"
              height="200px"
              placeholder="// 脚本必须通过 return 返回一个字符串&#10;// 可用变量: match, groups, index, source&#10;return match.toUpperCase();"
            />
            <div class="script-hint">
              可用变量: <code>match</code> (完整匹配), <code>groups</code> (捕获组数组),
              <code>index</code> (偏移位置), <code>source</code> (原始输入)
            </div>
          </div>
        </el-form-item>

        <el-form-item label="正则标志">
          <el-input v-model="localRule.flags" placeholder="默认 gm" style="width: 100px" />
          <span class="form-hint"
            >支持: g(全局) i(忽略大小写) m(多行) s(点号通配) u(Unicode) y(粘连)</span
          >
        </el-form-item>
      </el-form>
    </div>

    <!-- 规则测试 -->
    <div class="form-section test-section">
      <div class="section-header" @click="toggleTest">
        <div class="section-title">
          <el-icon class="collapse-icon" :class="{ expanded: testExpanded }">
            <ChevronRight />
          </el-icon>
          规则测试
        </div>
        <span class="preset-hint" v-if="!testExpanded">点击展开测试</span>
      </div>
      <el-collapse-transition>
        <div v-show="testExpanded" class="test-content">
          <el-form label-position="top" size="small">
            <el-form-item label="测试输入">
              <el-input
                v-model="localRule.testInput"
                type="textarea"
                :rows="3"
                placeholder="输入测试文本，观察替换效果"
                class="mono-input"
              />
            </el-form-item>

            <el-form-item>
              <template #label>
                替换结果
                <span v-if="matchCount !== null" class="match-info">
                  (匹配 {{ matchCount }} 次)
                </span>
              </template>
              <div class="test-result" :class="{ 'has-error': testError }">
                <template v-if="testError">
                  <span class="error-text">{{ testError }}</span>
                </template>
                <template v-else>
                  <div class="preview-output" v-html="highlightedOutput"></div>
                </template>
              </div>
            </el-form-item>
          </el-form>
        </div>
      </el-collapse-transition>
    </div>

    <!-- 应用范围 -->
    <div class="form-section">
      <div class="section-title">应用范围</div>
      <el-form label-position="left" label-width="100px" size="small">
        <el-form-item label="应用阶段">
          <el-checkbox v-model="applyToRender">渲染层</el-checkbox>
          <el-checkbox v-model="applyToRequest">请求层</el-checkbox>
        </el-form-item>

        <el-form-item label="流式处理">
          <el-switch v-model="localRule.applyInStreaming" />
          <span class="form-hint">是否在流式输出过程中实时应用。复杂脚本建议关闭以提高性能。</span>
        </el-form-item>

        <el-form-item label="目标角色">
          <el-checkbox-group v-model="localRule.targetRoles">
            <el-checkbox value="system">系统</el-checkbox>
            <el-checkbox value="user">用户</el-checkbox>
            <el-checkbox value="assistant">助手</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item label="消息深度">
          <div class="depth-range">
            <el-input-number
              v-model="depthMin"
              :min="0"
              :max="999"
              placeholder="最小"
              controls-position="right"
            />
            <span class="range-separator">~</span>
            <el-input-number
              v-model="depthMax"
              :min="0"
              :max="999"
              placeholder="最大"
              controls-position="right"
            />
          </div>
          <span class="form-hint">0 = 最新消息，留空表示不限制</span>
        </el-form-item>
      </el-form>
    </div>

    <!-- 高级配置 -->
    <div class="form-section">
      <div class="section-title">高级配置</div>
      <el-form label-position="top" size="small">
        <el-form-item label="宏替换模式">
          <el-radio-group v-model="localRule.substitutionMode">
            <el-radio-button value="NONE">不替换</el-radio-button>
            <el-radio-button value="RAW">原始值</el-radio-button>
            <el-radio-button value="ESCAPED">转义值</el-radio-button>
          </el-radio-group>
          <div class="form-hint">RAW: 将宏替换为文本值；ESCAPED: 替换后转义正则特殊字符</div>
        </el-form-item>

        <el-form-item label="后处理移除字符串">
          <el-select
            v-model="localRule.trimStrings"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="添加要从捕获组中移除的字符串"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive } from "vue";
import { ChevronRight } from "lucide-vue-next";
import type { ChatRegexRule } from "../../types/chatRegex";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { executeReplacementScript, parseRegexString } from "../../utils/chatRegexUtils";

// 预制规则类型
interface PresetRule {
  name: string;
  description: string;
  regex: string;
  replacement: string;
  flags?: string;
}

interface PresetCategory {
  name: string;
  presets: PresetRule[];
}

// 预制规则分类
const presetCategories: PresetCategory[] = [
  {
    name: "思考标签处理",
    presets: [
      {
        name: "折叠思考块",
        description: "将 <think>...</think> 或 <thinking>...</thinking> 转换为可折叠的详情块",
        regex: "<think(?:ing)?>(.*?)</think(?:ing)?>",
        replacement: "<details><summary>💭 思考过程</summary>\n\n$1\n\n</details>",
        flags: "gms",
      },
      {
        name: "移除思考块",
        description: "完全移除 <think>...</think> 或 <thinking>...</thinking> 标签及其内容",
        regex: "<think(?:ing)?>.*?</think(?:ing)?>",
        replacement: "",
        flags: "gms",
      },
      {
        name: "提取思考内容",
        description: "仅保留思考标签内的内容，移除标签本身",
        regex: "<think(?:ing)?>(.*?)</think(?:ing)?>",
        replacement: "$1",
        flags: "gms",
      },
    ],
  },
  {
    name: "格式清理",
    presets: [
      {
        name: "移除多余空行",
        description: "将连续的多个空行合并为单个空行",
        regex: "\\n{3,}",
        replacement: "\\n\\n",
        flags: "gm",
      },
      {
        name: "移除行首空格",
        description: "移除每行开头的空白字符",
        regex: "^[ \\t]+",
        replacement: "",
        flags: "gm",
      },
      {
        name: "移除行尾空格",
        description: "移除每行末尾的空白字符",
        regex: "[ \\t]+$",
        replacement: "",
        flags: "gm",
      },
    ],
  },
  {
    name: "内容转换",
    presets: [
      {
        name: "URL 转链接",
        description: "将纯文本 URL 转换为 Markdown 链接",
        regex: "(https?://[^\\s<>\"']+)",
        replacement: "[$1]($1)",
        flags: "gm",
      },
      {
        name: "强调转粗体",
        description: "将 *text* 转换为 **text**",
        regex: "(?<!\\*)\\*([^*]+)\\*(?!\\*)",
        replacement: "**$1**",
        flags: "gm",
      },
      {
        name: "移除 Markdown 链接",
        description: "将 [text](url) 转换为纯文本 text",
        regex: "\\[([^\\]]+)\\]\\([^)]+\\)",
        replacement: "$1",
        flags: "gm",
      },
    ],
  },
  {
    name: "代码块处理",
    presets: [
      {
        name: "移除代码块语言标记",
        description: "移除代码块的语言标识符",
        regex: "```\\w+\\n",
        replacement: "```\\n",
        flags: "gm",
      },
      {
        name: "行内代码转普通文本",
        description: "移除行内代码的反引号",
        regex: "`([^`]+)`",
        replacement: "$1",
        flags: "gm",
      },
    ],
  },
  {
    name: "特殊字符",
    presets: [
      {
        name: "移除 HTML 标签",
        description: "移除所有 HTML 标签，保留内容",
        regex: "<[^>]+>",
        replacement: "",
        flags: "gm",
      },
      {
        name: "转义 HTML 实体",
        description: "将 < > & 转换为 HTML 实体",
        regex: "[<>&]",
        replacement: "<!-- 需要手动处理 -->",
        flags: "gm",
      },
      {
        name: "移除 Emoji",
        description: "移除文本中的 Emoji 表情",
        regex: "[\\u{1F300}-\\u{1F9FF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}]",
        replacement: "",
        flags: "gmu",
      },
    ],
  },
];

// 预制规则展开状态
const presetsExpanded = ref(false);

const togglePresets = () => {
  presetsExpanded.value = !presetsExpanded.value;
};

// 测试区域展开状态
const testExpanded = ref(false);

const toggleTest = () => {
  testExpanded.value = !testExpanded.value;
};

interface Props {
  modelValue: ChatRegexRule;
}

interface Emits {
  (e: "update:modelValue", value: ChatRegexRule): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 使用可写的计算属性代理来处理表单字段，避免使用本地副本和 watch 导致的递归更新
const createFieldProxy = <K extends keyof ChatRegexRule>(key: K) => {
  return computed({
    get: () => props.modelValue[key],
    set: (value) => {
      // 创建一个新对象来触发更新，而不是直接修改 prop
      emit("update:modelValue", { ...props.modelValue, [key]: value });
    },
  });
};

// replacementType 需要单独处理默认值，旧规则数据可能缺失该字段
const replacementTypeProxy = computed({
  get: () => props.modelValue.replacementType ?? "regex",
  set: (value) => {
    emit("update:modelValue", { ...props.modelValue, replacementType: value });
  },
});

const localRule = reactive({
  name: createFieldProxy("name"),
  regex: createFieldProxy("regex"),
  replacement: createFieldProxy("replacement"),
  flags: createFieldProxy("flags"),
  replacementType: replacementTypeProxy,
  scriptContent: createFieldProxy("scriptContent"),
  applyInStreaming: createFieldProxy("applyInStreaming"),
  // applyTo 是嵌套对象，需要单独处理
  targetRoles: createFieldProxy("targetRoles"),
  substitutionMode: createFieldProxy("substitutionMode"),
  trimStrings: createFieldProxy("trimStrings"),
  testInput: createFieldProxy("testInput"),
});

// 为 applyTo 的嵌套属性创建独立的计算属性
const applyToRender = computed({
  get: () => props.modelValue.applyTo?.render ?? false,
  set: (value) => {
    const newApplyTo = { ...(props.modelValue.applyTo || {}), render: value };
    emit("update:modelValue", { ...props.modelValue, applyTo: newApplyTo });
  },
});

const applyToRequest = computed({
  get: () => props.modelValue.applyTo?.request ?? false,
  set: (value) => {
    const newApplyTo = { ...(props.modelValue.applyTo || {}), request: value };
    emit("update:modelValue", { ...props.modelValue, applyTo: newApplyTo });
  },
});

// 深度范围处理
const depthMin = computed({
  get: () => props.modelValue.depthRange?.min,
  set: (val) => {
    const newDepthRange = { ...(props.modelValue.depthRange || {}), min: val };
    if (newDepthRange.min === undefined && newDepthRange.max === undefined) {
      const { depthRange, ...rest } = props.modelValue;
      emit("update:modelValue", rest);
    } else {
      emit("update:modelValue", { ...props.modelValue, depthRange: newDepthRange });
    }
  },
});

const depthMax = computed({
  get: () => props.modelValue.depthRange?.max,
  set: (val) => {
    const newDepthRange = { ...(props.modelValue.depthRange || {}), max: val };
    if (newDepthRange.min === undefined && newDepthRange.max === undefined) {
      const { depthRange, ...rest } = props.modelValue;
      emit("update:modelValue", rest);
    } else {
      emit("update:modelValue", { ...props.modelValue, depthRange: newDepthRange });
    }
  },
});

// 应用预制规则
const applyPreset = (preset: PresetRule) => {
  emit("update:modelValue", {
    ...props.modelValue,
    name: preset.name,
    regex: preset.regex,
    replacement: preset.replacement,
    replacementType: "regex", // 预制规则目前均为正则模式
    flags: preset.flags || "gm",
  });
};

// 工具函数
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
    "\n": "<br>",
  };
  return text.replace(/[&<>"'\n]/g, (m) => map[m]);
}

// 测试功能
const matchCount = ref<number | null>(null);
const testError = ref<string | null>(null);

const highlightedOutput = computed(() => {
  const input = localRule.testInput || "";
  const regexStr = props.modelValue.regex;
  const replacement = props.modelValue.replacement;
  const flagsStr = props.modelValue.flags || "gm";

  if (!input) {
    matchCount.value = null;
    return '<span class="placeholder-text">输入测试文本后显示结果</span>';
  }

  if (!regexStr) {
    matchCount.value = null;
    return '<span class="placeholder-text">请输入正则表达式</span>';
  }

  try {
    testError.value = null;
    const parsed = parseRegexString(regexStr);
    const finalFlags = flagsStr || parsed.flags || "gm";
    const regex = new RegExp(parsed.pattern, finalFlags);

    const matches = input.match(regex);
    matchCount.value = matches ? matches.length : 0;

    const replacementType = props.modelValue.replacementType || "regex";
    const scriptContent = props.modelValue.scriptContent;

    // 如果有替换内容，显示替换结果并高亮被替换的部分
    if (
      (replacementType === "regex" && replacement !== undefined && replacement !== "") ||
      (replacementType === "script" && scriptContent)
    ) {
      // 收集所有替换信息：原始位置、匹配长度、替换后的内容
      interface ReplacementInfo {
        originalStart: number;
        originalLength: number;
        replacedContent: string;
      }
      const replacements: ReplacementInfo[] = [];

      // 第一遍：收集所有匹配和替换信息
      let tempRegex = new RegExp(parsed.pattern, finalFlags);
      input.replace(tempRegex, (match, ...args) => {
        const offset = args[args.length - 2] as number;
        let actualReplacement = "";
        if (replacementType === "script") {
          // 调用统一的脚本执行逻辑
          const source = args[args.length - 1] as string;
          const groups = args.slice(0, -2).filter((g) => typeof g === "string");

          try {
            actualReplacement = executeReplacementScript(scriptContent!, {
              match,
              groups,
              index: offset,
              source,
            });
            // 如果执行出错回退了原始匹配，且脚本内容不为空，说明可能有静默错误
            // 在测试界面我们希望看到错误，所以这里做一个简单的检查
            if (actualReplacement === match && scriptContent?.trim()) {
              // 再次执行以捕获错误（由于 cache 存在，开销较小）
              try {
                const fn = new Function("match", "groups", "index", "source", scriptContent!);
                fn(match, groups, offset, source);
              } catch (e) {
                actualReplacement = `[Error: ${e instanceof Error ? e.message : String(e)}]`;
              }
            }
          } catch (e) {
            actualReplacement = `[Error: ${e instanceof Error ? e.message : String(e)}]`;
          }
        } else {
          // 计算实际的替换内容（处理 $1, $2 等捕获组引用）
          // 同时处理常用的转义序列，如 \n, \t
          const finalReplacement = replacement!.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
          actualReplacement = match.replace(tempRegex, finalReplacement);
        }

        replacements.push({
          originalStart: offset,
          originalLength: match.length,
          replacedContent: actualReplacement,
        });
        return match;
      });

      // 第二遍：构建带高亮的 HTML
      // 需要根据原始位置计算替换后的位置偏移
      let html = "";
      let lastOriginalIndex = 0;
      let positionOffset = 0; // 累计的位置偏移量

      for (const rep of replacements) {
        // 添加匹配项之前的文本（这部分没有变化）
        if (rep.originalStart > lastOriginalIndex) {
          html += escapeHtml(input.slice(lastOriginalIndex, rep.originalStart));
        }

        // 添加替换后的内容（高亮显示）
        html += `<mark class="highlight-replacement">${escapeHtml(rep.replacedContent)}</mark>`;

        lastOriginalIndex = rep.originalStart + rep.originalLength;
        positionOffset += rep.replacedContent.length - rep.originalLength;
      }

      // 添加剩余的文本
      html += escapeHtml(input.slice(lastOriginalIndex));
      return html;
    } else {
      // 没有替换内容，显示原文本并高亮匹配项
      // 为了安全地处理 HTML 转义，我们需要手动构建结果
      let lastIndex = 0;
      let html = "";

      // 使用 replace 的回调来遍历匹配项
      // 注意：如果 flags 没有 'g'，replace 只会处理第一个匹配
      input.replace(regex, (match, ...args) => {
        // args 的倒数第二个参数是 offset
        const offset = args[args.length - 2];

        // 添加匹配项之前的文本（转义）
        if (offset > lastIndex) {
          html += escapeHtml(input.slice(lastIndex, offset));
        }

        // 添加匹配项（转义并高亮）
        html += `<mark class="highlight-match">${escapeHtml(match)}</mark>`;

        lastIndex = offset + match.length;
        return match; // 返回值不重要
      });

      // 添加剩余的文本
      html += escapeHtml(input.slice(lastIndex));
      return html;
    }
  } catch (error) {
    testError.value = error instanceof Error ? error.message : "正则表达式错误";
    matchCount.value = null;
    return "";
  }
});
</script>

<style scoped>
.chat-regex-rule-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-weight: 500;
  font-size: 14px;
  color: var(--text-color);
  margin-bottom: 8px;
}

/* 预制规则样式 */
.preset-section,
.test-section {
  background: var(--container-bg);
  border-radius: 8px;
  padding: 12px;
  border: var(--border-width) solid var(--border-color);
}

.test-content {
  margin-top: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}

.section-header .section-title {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 0;
}

.collapse-icon {
  transition: transform 0.2s ease;
  font-size: 14px;
}

.collapse-icon.expanded {
  transform: rotate(90deg);
}

.preset-hint {
  font-size: 12px;
  color: var(--text-color-light);
}

.presets-content {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preset-category {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.category-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color-light);
}

.preset-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.preset-tag {
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: color-mix(in srgb, var(--primary-color) 15%, transparent) !important;
  border-color: var(--primary-color) !important;
  color: var(--primary-color) !important;
}

.preset-tag:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  background-color: color-mix(in srgb, var(--primary-color) 25%, transparent) !important;
}

.preset-tag:active {
  transform: translateY(0);
  opacity: 0.8;
}

.mono-input :deep(textarea) {
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 13px;
}

.form-hint {
  font-size: 12px;
  color: var(--text-color-light);
  margin-left: 8px;
}

.script-editor-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.script-hint {
  font-size: 12px;
  color: var(--text-color-light);
}

.script-hint code {
  background-color: var(--bg-color-soft);
  padding: 2px 4px;
  border-radius: 4px;
  font-family: monospace;
}

.depth-range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range-separator {
  color: var(--text-color-light);
}

.test-result {
  padding: 12px;
  border-radius: 6px;
  border: var(--border-width) solid var(--border-color);
  background: var(--container-bg);
  min-height: 60px;
  width: 100%;
}

.test-result.has-error {
  border-color: var(--error-color);
  background: var(--error-color-alpha);
}

.result-text {
  margin: 0;
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
  border: none;
}

.preview-output {
  margin: 0;
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.6;
  color: var(--text-color);
}

.preview-output :deep(mark.highlight-match) {
  background-color: #ffd700;
  color: #000;
  padding: 0 2px;
  border-radius: 2px;
  font-weight: 500;
}

.preview-output :deep(mark.highlight-replacement) {
  background-color: #90ee90;
  color: #000;
  padding: 0 2px;
  border-radius: 2px;
  font-weight: 500;
}

.match-info {
  font-size: 12px;
  font-weight: normal;
  color: var(--primary-color);
  margin-left: 8px;
}

.error-text {
  color: var(--error-color);
  font-size: 13px;
}

.placeholder-text {
  color: var(--text-color-light);
  font-style: italic;
}
</style>

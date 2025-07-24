<template>
  <div class="regex-applier-container">
    <el-row :gutter="20" class="input-output-section">
      <el-col :span="12">
        <el-card shadow="never" class="box-card">
          <template #header>
            <div class="card-header">
              <span>输入文本</span>
              <el-button class="button" text @click="pasteToSource">粘贴</el-button>
            </div>
          </template>
          <el-input
            v-model="sourceText"
            :rows="10"
            type="textarea"
            placeholder="请输入待处理的文本..."
          />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never" class="box-card">
          <template #header>
            <div class="card-header">
              <span>输出文本</span>
              <el-button class="button" text @click="copyResult">复制</el-button>
            </div>
          </template>
          <el-input
            v-model="resultText"
            :rows="10"
            type="textarea"
            placeholder="处理结果将显示在这里..."
            readonly
          />
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="box-card regex-rules-section">
      <template #header>
        <div class="card-header">
          <span>正则规则 ({{ rules.length }})</span>
          <div>
            <el-button type="primary" @click="addRule()">添加规则</el-button>
            <el-button @click="importRules">导入规则</el-button>
            <el-button @click="exportRules">导出规则</el-button>
            <el-tooltip content="将剪贴板内容作为输入，应用规则后复制结果回剪贴板" placement="top">
              <el-button type="success" @click="oneClickProcess">一键处理剪贴板</el-button>
            </el-tooltip>
          </div>
        </div>
      </template>
      <div class="rules-list-wrapper">
        <div v-if="rules.length === 0" class="empty-rules">
          <el-empty description="暂无正则规则，点击“添加规则”按钮创建"></el-empty>
        </div>
        <VueDraggableNext
          v-else
          class="rules-list"
          v-model="rules"
          item-key="id"
          handle=".rule-item-handle"
        >
          <template #item="{ element: rule, index }">
            <el-row :gutter="10" class="rule-item">
              <el-col :span="1" class="rule-item-handle">
                <el-icon><Rank /></el-icon>
              </el-col>
              <el-col :span="2">
                <el-checkbox v-model="rule.enabled" size="large"></el-checkbox>
              </el-col>
              <el-col :span="9">
                <el-input v-model="rule.regex" placeholder="正则表达式"></el-input>
              </el-col>
              <el-col :span="8">
                <el-input v-model="rule.replacement" placeholder="替换内容"></el-input>
              </el-col>
              <el-col :span="4">
                <el-button type="danger" :icon="Delete" circle @click="removeRule(index)"></el-button>
              </el-col>
            </el-row>
          </template>
        </VueDraggableNext>
      </div>
    </el-card>

    <el-card shadow="never" class="box-card log-section">
      <template #header>
        <div class="card-header">
          <span>日志</span>
        </div>
      </template>
      <div class="log-output">
        <p v-for="(log, index) in logs" :key="index" :class="`log-${log.type}`">
          [{{ log.time }}] {{ log.message }}
        </p>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, Rank } from '@element-plus/icons-vue';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { create, exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { open as openFile, save as saveFile } from '@tauri-apps/plugin-dialog';
import debounce from 'lodash/debounce';
import { VueDraggableNext } from 'vue-draggable-next';

interface RegexRule {
  id: string;
  enabled: boolean;
  regex: string;
  replacement: string;
}

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'warn' | 'error';
}

const sourceText = ref('');
const resultText = ref('');
const rules = ref<RegexRule[]>([]);
const logs = ref<LogEntry[]>([]);

const addLog = (message: string, type: LogEntry['type'] = 'info') => {
  const time = new Date().toLocaleTimeString();
  logs.value.push({ time, message, type });
};

const configFileName = 'regex_rules_config.json';
const appDataDirPath = ref('');

onMounted(async () => {
  appDataDirPath.value = await appDataDir();
  await create(appDataDirPath.value);
  loadRules();
});

const getConfigFile = () => {
  return join(appDataDirPath.value, configFileName);
};

const loadRules = async () => {
  try {
    const filePath = await getConfigFile();
    if (await exists(filePath)) {
      const content = await readTextFile(filePath);
      const loadedRules = JSON.parse(content);
      // 确保加载的规则都有ID
      rules.value = loadedRules.map((rule: any) => ({
        ...rule,
        id: rule.id || `rule-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      }));
      addLog(`成功加载 ${rules.value.length} 条正则规则。`, 'info');
    } else {
      addLog('未找到正则规则配置文件，已创建空白规则。', 'info');
      addRule(true);
    }
  } catch (error: any) {
    ElMessage.error(`加载规则失败: ${error.message}`);
    addLog(`加载规则失败: ${error.message}`, 'error');
    addRule(true);
  }
};

const saveRules = async () => {
  try {
    const filePath = await getConfigFile();
    await writeTextFile(filePath, JSON.stringify(rules.value, null, 2));
    addLog('正则规则已自动保存。', 'info');
  } catch (error: any) {
    ElMessage.error(`保存规则失败: ${error.message}`);
    addLog(`保存规则失败: ${error.message}`, 'error');
  }
};

watch(rules, debounce(saveRules, 500), { deep: true });

const debouncedProcessText = debounce(() => {
  processText();
}, 300);

watch(sourceText, debouncedProcessText);
watch(rules, debouncedProcessText, { deep: true });

const addRule = (isInitial = false) => {
  const newRule: RegexRule = {
    id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    enabled: true,
    regex: '',
    replacement: ''
  };
  rules.value.push(newRule);
  if (!isInitial) {
    addLog('添加了一条新的空白规则。');
  }
};

const removeRule = (index: number) => {
  if (rules.value.length === 1) {
    ElMessageBox.confirm('这是最后一条规则，确定要清空内容吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    .then(() => {
      rules.value[index] = {
        id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        enabled: true,
        regex: '',
        replacement: ''
      };
      addLog('最后一条规则已清空。');
    })
    .catch(() => {});
  } else {
    rules.value.splice(index, 1);
    addLog(`移除了第 ${index + 1} 条规则。`);
  }
};

const processText = () => {
  if (!sourceText.value) {
    resultText.value = '';
    return;
  }

  let processed = sourceText.value;
  let appliedRulesCount = 0;

  rules.value.forEach((rule, index) => {
    if (rule.enabled) {
      try {
        const regex = new RegExp(rule.regex, 'g');
        const originalProcessed = processed;
        processed = processed.replace(regex, rule.replacement);
        if (originalProcessed !== processed) {
          addLog(`应用规则 ${index + 1}: /${rule.regex}/ -> "${rule.replacement}"`);
          appliedRulesCount++;
        }
      } catch (e: any) {
        addLog(`规则 ${index + 1} 错误: 无效的正则表达式 "${rule.regex}" - ${e.message}`, 'error');
        ElMessage.error(`规则 ${index + 1} 错误: ${e.message}`);
      }
    }
  });

  resultText.value = processed;
  if (sourceText.value) {
    addLog(`文本处理完成。共应用了 ${appliedRulesCount} 条规则。`);
  }
};

const pasteToSource = async () => {
  try {
    sourceText.value = await readText();
    addLog('已从剪贴板粘贴内容到输入框。');
  } catch (error: any) {
    ElMessage.error(`粘贴失败: ${error.message}`);
    addLog(`粘贴失败: ${error.message}`, 'error');
  }
};

const copyResult = async () => {
  try {
    await writeText(resultText.value);
    ElMessage.success('处理结果已复制到剪贴板！');
    addLog('处理结果已复制到剪贴板。');
  } catch (error: any) {
    ElMessage.error(`复制失败: ${error.message}`);
    addLog(`复制失败: ${error.message}`, 'error');
  }
};

const oneClickProcess = async () => {
  addLog('执行一键处理剪贴板...');
  await pasteToSource();
  processText();
  await copyResult();
  addLog('一键处理剪贴板完成。');
};

const importRules = async () => {
  try {
    const filePath = await openFile({
      multiple: false,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (filePath) {
      const content = await readTextFile(filePath as string);
      const importedRules: Partial<RegexRule>[] = JSON.parse(content);

      const existingRulesMap = new Map(rules.value.map(r => [`${r.regex}::${r.replacement}`, r]));
      let addedCount = 0;
      importedRules.forEach((newRule) => {
        const key = `${newRule.regex}::${newRule.replacement}`;
        if (!existingRulesMap.has(key)) {
          rules.value.push({
            id: newRule.id || `rule-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            enabled: newRule.enabled ?? true,
            regex: newRule.regex || '',
            replacement: newRule.replacement || ''
          });
          existingRulesMap.set(key, newRule as RegexRule);
          addedCount++;
        }
      });

      if (addedCount > 0) {
        ElMessage.success(`成功导入 ${addedCount} 条新规则。`);
        addLog(`成功导入 ${addedCount} 条新规则。`, 'info');
      } else {
        ElMessage.info('没有新的规则需要导入。');
        addLog('没有新的规则需要导入。', 'info');
      }
    } else {
      addLog('导入规则操作已取消。', 'info');
    }
  } catch (error: any) {
    ElMessage.error(`导入规则失败: ${error.message}`);
    addLog(`导入规则失败: ${error.message}`, 'error');
  }
};

const exportRules = async () => {
  try {
    const filePath = await saveFile({
      defaultPath: `regex_rules_${Date.now()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (filePath) {
      await writeTextFile(filePath, JSON.stringify(rules.value, null, 2));
      ElMessage.success('规则已成功导出！');
      addLog('规则已成功导出。', 'info');
    } else {
      addLog('导出规则操作已取消。', 'info');
    }
  } catch (error: any) {
    ElMessage.error(`导出规则失败: ${error.message}`);
    addLog(`导出规则失败: ${error.message}`, 'error');
  }
};
</script>

<style scoped>
.regex-applier-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.box-card {
  margin-bottom: 20px;
  border: 1px solid var(--border-color);
  background-color: var(--container-bg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: bold;
  color: var(--text-color);
}

.input-output-section .el-textarea__inner {
  font-family: monospace;
}

.rules-list-wrapper {
  max-height: 300px;
  overflow-y: auto;
  padding-right: 10px;
}

.rule-item-handle {
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-rules {
  text-align: center;
  color: var(--text-color-light);
  padding: 40px 0;
}

.rule-item {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  padding: 5px;
  border-radius: 4px;
  background-color: var(--bg-color);
}

.rule-item:last-child {
  margin-bottom: 0;
}

.rule-item .el-col {
  display: flex;
  align-items: center;
}

.log-section .log-output {
  height: 150px;
  overflow-y: auto;
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  padding: 10px;
  font-family: monospace;
  font-size: 14px;
  color: var(--text-color);
  line-height: 1.5;
}

.log-info {
  color: var(--text-color);
}

.log-warn {
  color: #e6a23c;
}

.log-error {
  color: var(--error-color);
}

.card-footer {
  margin-top: 20px;
  text-align: right;
}
</style>
<template>
  <div class="storage-performance-tester">
    <div class="action-bar">
      <div class="bar-title">
        <Activity class="icon" :size="18" />
        <span>性能测试配置</span>
      </div>
      <el-form :inline="true" :model="config" class="config-form">
        <el-form-item label="消息数量">
          <el-input-number
            v-model="config.messageCount"
            :min="100"
            :max="100000"
            :step="100"
            size="small"
          />
        </el-form-item>
        <el-form-item label="单条长度 (KB)">
          <el-input-number
            v-model="config.contentSizeKB"
            :min="1"
            :max="1000"
            :step="1"
            size="small"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="runAllTests" :loading="testing" size="small">
            <template #icon><Play :size="14" /></template>
            运行全部方案
          </el-button>
        </el-form-item>
      </el-form>
      <div class="estimated-size">
        <Database :size="14" />
        预计大小 (美化): <span>{{ estimatedSize }} MB</span>
      </div>
    </div>
    <div class="main-content">
      <div class="comparison-card" v-if="comparisonData.length > 0">
        <div class="card-header"><BarChart3 :size="16" /><span>方案对比总览</span></div>
        <el-table :data="comparisonData" style="width: 100%" class="custom-table" row-key="tag">
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="expand-steps">
                <div class="expand-steps-header">详细步骤</div>
                <div class="step-item" v-for="(s, i) in row.steps" :key="i">
                  <span class="step-index">{{ i + 1 }}</span>
                  <span class="step-name">{{ s.step }}</span>
                  <span class="duration-tag" :class="getDurationClass(s.duration)"
                    >{{ s.duration.toFixed(2) }} ms</span
                  >
                  <span class="step-details">{{ s.details }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="scheme" label="方案" width="280">
            <template #default="{ row }">
              <div class="scheme-cell">
                <span class="scheme-tag" :style="{ backgroundColor: row.color }">{{
                  row.tag
                }}</span>
                <span>{{ row.scheme }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="文件大小" width="110">
            <template #default="{ row }"
              ><span class="mono-value">{{ row.fileSizeMB }} MB</span></template
            >
          </el-table-column>
          <el-table-column label="写入 (ms)" width="120">
            <template #default="{ row }"
              ><span class="duration-tag" :class="getDurationClass(row.writeTime)">{{
                row.writeTime.toFixed(1)
              }}</span></template
            >
          </el-table-column>
          <el-table-column label="读取 (ms)" width="120">
            <template #default="{ row }"
              ><span class="duration-tag" :class="getDurationClass(row.readTime)">{{
                row.readTime.toFixed(1)
              }}</span></template
            >
          </el-table-column>
          <el-table-column label="序列化 (ms)" width="120">
            <template #default="{ row }"
              ><span class="duration-tag" :class="getDurationClass(row.serializeTime)">{{
                row.serializeTime.toFixed(1)
              }}</span></template
            >
          </el-table-column>
          <el-table-column label="反序列化 (ms)" width="120">
            <template #default="{ row }"
              ><span class="duration-tag" :class="getDurationClass(row.deserializeTime)">{{
                row.deserializeTime.toFixed(1)
              }}</span></template
            >
          </el-table-column>
          <el-table-column label="总耗时 (ms)" width="120">
            <template #default="{ row }"
              ><span
                class="duration-tag"
                :class="getDurationClass(row.totalTime)"
                style="font-weight: 700"
                >{{ row.totalTime.toFixed(1) }}</span
              ></template
            >
          </el-table-column>
          <el-table-column label="相对基准" width="110">
            <template #default="{ row }">
              <span v-if="row.relativePercent === 100" class="baseline-tag">基准</span>
              <span
                v-else
                class="relative-tag"
                :class="row.relativePercent < 100 ? 'faster' : 'slower'"
              >
                {{ row.relativePercent < 100 ? "↓" : "↑"
                }}{{ Math.abs(row.relativePercent - 100).toFixed(1) }}%
              </span>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="log-container">
        <div class="log-header">
          <Terminal :size="16" /><span>实时执行日志</span>
          <div class="log-actions">
            <el-button link size="small" @click="logs = []">清空</el-button>
          </div>
        </div>
        <div class="log-area" ref="logContainer">
          <div v-if="logs.length === 0" class="empty-log">等待测试开始...</div>
          <div v-for="(log, i) in logs" :key="i" class="log-entry" :class="log.type">
            <span class="log-time">{{ log.time }}</span>
            <span class="log-type-tag">[{{ log.type.toUpperCase() }}]</span>
            <span class="log-msg">{{ log.message }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, nextTick } from "vue";
import { Activity, Play, Database, BarChart3, Terminal } from "lucide-vue-next";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { writeTextFile, readTextFile, readFile } from "@tauri-apps/plugin-fs";
import * as jsonpatch from "fast-json-patch";
import { getAppConfigDir } from "@/utils/appPath";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("StoragePerfTest");

interface StepResult {
  step: string;
  duration: number;
  details: string;
}
interface SchemeSummary {
  fileSizeMB: number;
  totalTime: number;
  writeTime: number;
  readTime: number;
  serializeTime: number;
  deserializeTime: number;
}
interface SchemeResult {
  name: string;
  tag: string;
  color: string;
  steps: StepResult[];
  summary: SchemeSummary | null;
}
interface ComparisonRow {
  scheme: string;
  tag: string;
  color: string;
  fileSizeMB: string;
  writeTime: number;
  readTime: number;
  serializeTime: number;
  deserializeTime: number;
  totalTime: number;
  relativePercent: number;
  steps: StepResult[];
}

const config = reactive({ messageCount: 1000, contentSizeKB: 10 });
const testing = ref(false);
const logs = ref<{ time: string; message: string; type: string }[]>([]);
const logContainer = ref<HTMLElement | null>(null);
const allSchemeResults = ref<SchemeResult[]>([]);
const comparisonData = ref<ComparisonRow[]>([]);
const estimatedSize = computed(() =>
  ((config.messageCount * config.contentSizeKB) / 1024).toFixed(2)
);

function addLog(message: string, type: "info" | "warn" | "error" | "success" = "info") {
  logs.value.push({ time: new Date().toLocaleTimeString(), message, type });
  nextTick(() => {
    if (logContainer.value) logContainer.value.scrollTop = logContainer.value.scrollHeight;
  });
}
function getDurationClass(d: number) {
  return d > 1000 ? "text-danger" : d > 300 ? "text-warning" : "text-success";
}
function yieldToUI(): Promise<void> {
  return new Promise((r) => setTimeout(r, 50));
}

// 方案 A: 旧方案 Vec<u8> 写入 + 美化 JSON (基准 — 反面教材)
// ⚠ Array.from(Uint8Array) → number[] → IPC JSON 序列化膨胀 3-4x
async function runSchemeA(
  session: Record<string, unknown>,
  basePath: string
): Promise<SchemeResult> {
  const r: SchemeResult = {
    name: "方案 A: Vec<u8>写入 + 美化 JSON (旧)",
    tag: "A",
    color: "#409eff",
    steps: [],
    summary: null,
  };
  const p = await join(basePath, "perf-test-a.json");
  addLog("[A] Vec<u8>写入 + 美化 JSON (Array.from膨胀)");
  const t0 = performance.now();
  const js = JSON.stringify(session, null, 2);
  const t1 = performance.now();
  r.steps.push({ step: "JSON.stringify (美化)", duration: t1 - t0, details: `长度: ${js.length}` });
  const enc = new TextEncoder();
  const buf = enc.encode(js);
  const t2 = performance.now();
  await invoke("write_file_force", { path: p, content: Array.from(buf) });
  const t3 = performance.now();
  r.steps.push({
    step: "write_file_force (Vec<u8>)",
    duration: t3 - t2,
    details: `${buf.length} bytes (IPC膨胀~3-4x)`,
  });
  addLog(`[A] 写入 ${(buf.length / 1048576).toFixed(2)} MB`);
  const t4 = performance.now();
  const txt = await invoke<string>("read_text_file_force", { path: p });
  const t5 = performance.now();
  r.steps.push({ step: "read_text_file_force", duration: t5 - t4, details: `${txt.length} chars` });
  const t6 = performance.now();
  const pd = JSON.parse(txt) as Record<string, unknown>;
  const t7 = performance.now();
  const nd = pd.nodes as Record<string, unknown> | undefined;
  r.steps.push({
    step: "JSON.parse",
    duration: t7 - t6,
    details: `节点: ${nd ? Object.keys(nd).length : 0}`,
  });
  r.summary = {
    fileSizeMB: buf.length / 1048576,
    totalTime: t1 - t0 + (t3 - t2) + (t5 - t4) + (t7 - t6),
    writeTime: t3 - t2,
    readTime: t5 - t4,
    serializeTime: t1 - t0,
    deserializeTime: t7 - t6,
  };
  addLog(`[A] 完成 ${r.summary.totalTime.toFixed(1)} ms`, "success");
  addLog("[A] ⚠ Array.from(Uint8Array) 经 IPC JSON 序列化为 number[]，写入膨胀约 3-4x", "warn");
  return r;
}

// 方案 B: 文本直传写入 + 紧凑 JSON
// 使用 write_text_file_force 直接传 String，零膨胀
async function runSchemeB(
  session: Record<string, unknown>,
  basePath: string
): Promise<SchemeResult> {
  const r: SchemeResult = {
    name: "方案 B: 文本直传 + 紧凑 JSON",
    tag: "B",
    color: "#67c23a",
    steps: [],
    summary: null,
  };
  const p = await join(basePath, "perf-test-b.json");
  addLog("[B] 文本直传写入 (write_text_file_force) + 紧凑 JSON");
  const t0 = performance.now();
  const js = JSON.stringify(session);
  const t1 = performance.now();
  r.steps.push({ step: "JSON.stringify (紧凑)", duration: t1 - t0, details: `长度: ${js.length}` });
  const t2 = performance.now();
  await invoke("write_text_file_force", { path: p, content: js });
  const t3 = performance.now();
  r.steps.push({
    step: "write_text_file_force (String直传)",
    duration: t3 - t2,
    details: `${js.length} chars (零膨胀)`,
  });
  addLog(`[B] 写入 ${(new TextEncoder().encode(js).length / 1048576).toFixed(2)} MB`);
  const t4 = performance.now();
  const txt = await invoke<string>("read_text_file_force", { path: p });
  const t5 = performance.now();
  r.steps.push({ step: "read_text_file_force", duration: t5 - t4, details: `${txt.length} chars` });
  const t6 = performance.now();
  const pd = JSON.parse(txt) as Record<string, unknown>;
  const t7 = performance.now();
  const nd = pd.nodes as Record<string, unknown> | undefined;
  r.steps.push({
    step: "JSON.parse",
    duration: t7 - t6,
    details: `节点: ${nd ? Object.keys(nd).length : 0}`,
  });
  const fileSizeBytes = new TextEncoder().encode(js).length;
  r.summary = {
    fileSizeMB: fileSizeBytes / 1048576,
    totalTime: t1 - t0 + (t3 - t2) + (t5 - t4) + (t7 - t6),
    writeTime: t3 - t2,
    readTime: t5 - t4,
    serializeTime: t1 - t0,
    deserializeTime: t7 - t6,
  };
  addLog(`[B] 完成 ${r.summary.totalTime.toFixed(1)} ms`, "success");
  return r;
}

// 方案 C: 伪二进制传输 + 紧凑 JSON (read_file_binary → Vec<u8> → number[])
// ⚠ 这是一个反面教材：Vec<u8> 经 Tauri IPC JSON 序列化后变成 number[]，传输量膨胀 3-4x
async function runSchemeC(
  session: Record<string, unknown>,
  basePath: string
): Promise<SchemeResult> {
  const r: SchemeResult = {
    name: "方案 C: 伪二进制 (Vec<u8>→number[])",
    tag: "C",
    color: "#e6a23c",
    steps: [],
    summary: null,
  };
  const p = await join(basePath, "perf-test-c.json");
  addLog("[C] 伪二进制传输 (read_file_binary → Vec<u8> → JSON number[])");
  const t0 = performance.now();
  const js = JSON.stringify(session);
  const t1 = performance.now();
  r.steps.push({ step: "JSON.stringify (紧凑)", duration: t1 - t0, details: `长度: ${js.length}` });
  const enc = new TextEncoder();
  const buf = enc.encode(js);
  const t2 = performance.now();
  await invoke("write_file_force", { path: p, content: Array.from(buf) });
  const t3 = performance.now();
  r.steps.push({ step: "write_file_force", duration: t3 - t2, details: `${buf.length} bytes` });
  addLog(`[C] 写入 ${(buf.length / 1048576).toFixed(2)} MB`);
  // 二进制读取: read_file_binary 返回 Vec<u8> → Tauri IPC 序列化为 number[]
  const t4 = performance.now();
  const binData = await invoke<number[]>("read_file_binary", { path: p });
  const t5 = performance.now();
  r.steps.push({
    step: "read_file_binary (IPC→number[])",
    duration: t5 - t4,
    details: `${binData.length} elements (JSON数组传输，膨胀~3-4x)`,
  });
  const t5b = performance.now();
  const decoded = new TextDecoder().decode(new Uint8Array(binData));
  const t5c = performance.now();
  r.steps.push({
    step: "Uint8Array + TextDecoder",
    duration: t5c - t5b,
    details: `${decoded.length} chars`,
  });
  const t6 = performance.now();
  const pd = JSON.parse(decoded) as Record<string, unknown>;
  const t7 = performance.now();
  const nd = pd.nodes as Record<string, unknown> | undefined;
  r.steps.push({
    step: "JSON.parse",
    duration: t7 - t6,
    details: `节点: ${nd ? Object.keys(nd).length : 0}`,
  });
  const deTime = t5c - t5b + (t7 - t6);
  r.summary = {
    fileSizeMB: buf.length / 1048576,
    totalTime: t1 - t0 + (t3 - t2) + (t5 - t4) + (t5c - t5b) + (t7 - t6),
    writeTime: t3 - t2,
    readTime: t5 - t4,
    serializeTime: t1 - t0,
    deserializeTime: deTime,
  };
  addLog(`[C] 完成 ${r.summary.totalTime.toFixed(1)} ms`, "success");
  addLog("[C] ⚠ Vec<u8> 经 IPC JSON 序列化为 number[]，传输量膨胀约 3-4x，这是反面教材", "warn");
  return r;
}

// 方案 D: 文本直传写入 + 真二进制读取 ✅ 最优组合
// 写入: write_text_file_force (String直传，零膨胀)
// 读取: read_file_binary_raw (IPC Response → ArrayBuffer，零膨胀)
async function runSchemeD(
  session: Record<string, unknown>,
  basePath: string
): Promise<SchemeResult> {
  const r: SchemeResult = {
    name: "方案 D: 直传写入 + 二进制读取 ✅",
    tag: "D",
    color: "#f56c6c",
    steps: [],
    summary: null,
  };
  const p = await join(basePath, "perf-test-d.json");
  addLog("[D] 文本直传写入 + 真二进制读取 (最优组合)");
  const t0 = performance.now();
  const js = JSON.stringify(session);
  const t1 = performance.now();
  r.steps.push({ step: "JSON.stringify (紧凑)", duration: t1 - t0, details: `长度: ${js.length}` });
  // 文本直传写入: 直接传 String，零膨胀
  const t2 = performance.now();
  await invoke("write_text_file_force", { path: p, content: js });
  const t3 = performance.now();
  r.steps.push({
    step: "write_text_file_force (String直传)",
    duration: t3 - t2,
    details: `${js.length} chars (零膨胀)`,
  });
  const fileSizeBytes = new TextEncoder().encode(js).length;
  addLog(`[D] 写入 ${(fileSizeBytes / 1048576).toFixed(2)} MB`);
  // 真二进制读取: read_file_binary_raw 返回 tauri::ipc::Response → 前端收到 ArrayBuffer
  const t4 = performance.now();
  const rawBuffer = await invoke<ArrayBuffer>("read_file_binary_raw", { path: p });
  const t5 = performance.now();
  r.steps.push({
    step: "read_file_binary_raw (IPC Response)",
    duration: t5 - t4,
    details: `${rawBuffer.byteLength} bytes (原始二进制，零膨胀)`,
  });
  const t5b = performance.now();
  const decoded = new TextDecoder().decode(new Uint8Array(rawBuffer));
  const t5c = performance.now();
  r.steps.push({
    step: "Uint8Array + TextDecoder",
    duration: t5c - t5b,
    details: `${decoded.length} chars`,
  });
  const t6 = performance.now();
  const pd = JSON.parse(decoded) as Record<string, unknown>;
  const t7 = performance.now();
  const nd = pd.nodes as Record<string, unknown> | undefined;
  r.steps.push({
    step: "JSON.parse",
    duration: t7 - t6,
    details: `节点: ${nd ? Object.keys(nd).length : 0}`,
  });
  const deTime = t5c - t5b + (t7 - t6);
  r.summary = {
    fileSizeMB: fileSizeBytes / 1048576,
    totalTime: t1 - t0 + (t3 - t2) + (t5 - t4) + (t5c - t5b) + (t7 - t6),
    writeTime: t3 - t2,
    readTime: t5 - t4,
    serializeTime: t1 - t0,
    deserializeTime: deTime,
  };
  addLog(`[D] 完成 ${r.summary.totalTime.toFixed(1)} ms`, "success");
  return r;
}

// 方案 E: 增量更新 (JSON Patch)
// ✅ 模拟实际业务中“只更新一个节点”的场景，极大减少序列化和 I/O 压力
async function runSchemeE(
  session: Record<string, unknown>,
  basePath: string
): Promise<SchemeResult> {
  const r: SchemeResult = {
    name: "方案 E: 增量更新 (JSON Patch)",
    tag: "E",
    color: "#909399",
    steps: [],
    summary: null,
  };
  const p = await join(basePath, "perf-test-e.patch.json");
  addLog("[E] 增量更新 (JSON Patch - 模拟修改 1 个节点)");

  // 1. 模拟修改：克隆并修改一个节点
  const t0 = performance.now();
  const newSession = JSON.parse(JSON.stringify(session));
  const nodeIds = Object.keys(newSession.nodes);
  const targetId = nodeIds[Math.floor(Math.random() * nodeIds.length)];
  newSession.nodes[targetId].content += " (Patched!)";
  newSession.updatedAt = new Date().toISOString();
  const t1 = performance.now();
  r.steps.push({ step: "模拟业务修改", duration: t1 - t0, details: `修改节点: ${targetId}` });

  // 2. 生成 Patch
  const t2 = performance.now();
  const patch = jsonpatch.compare(session, newSession);
  const t3 = performance.now();
  const patchStr = JSON.stringify(patch);
  r.steps.push({
    step: "fast-json-patch.compare",
    duration: t3 - t2,
    details: `Patch 长度: ${patchStr.length} chars`,
  });

  // 3. 写入 Patch (通常很小，使用文本直传)
  const t4 = performance.now();
  await invoke("write_text_file_force", { path: p, content: patchStr });
  const t5 = performance.now();
  const patchSizeBytes = new TextEncoder().encode(patchStr).length;
  r.steps.push({
    step: "write_text_file_force (Patch)",
    duration: t5 - t4,
    details: `${patchSizeBytes} bytes`,
  });
  addLog(`[E] Patch 写入 ${(patchSizeBytes / 1024).toFixed(2)} KB`);

  // 4. 读取并应用 Patch
  const t6 = performance.now();
  const readPatchStr = await invoke<string>("read_text_file_force", { path: p });
  const readPatch = JSON.parse(readPatchStr);
  const t7 = performance.now();
  r.steps.push({ step: "读取 Patch", duration: t7 - t6, details: `耗时包含 IPC` });

  const t8 = performance.now();
  const patchedSession = jsonpatch.applyPatch(session, readPatch).newDocument as any;
  const t9 = performance.now();
  r.steps.push({
    step: "fast-json-patch.applyPatch",
    duration: t9 - t8,
    details: `还原后节点数: ${Object.keys(patchedSession.nodes || {}).length}`,
  });

  r.summary = {
    fileSizeMB: patchSizeBytes / 1048576,
    totalTime: t3 - t2 + (t5 - t4) + (t7 - t6) + (t9 - t8),
    writeTime: t5 - t4,
    readTime: t7 - t6,
    serializeTime: t3 - t2,
    deserializeTime: t9 - t8,
  };
  addLog(`[E] 完成 ${r.summary.totalTime.toFixed(1)} ms (仅计算 Patch 相关耗时)`, "success");
  return r;
}

// 方案 F: 生产环境真实模拟 ✅ (plugin-fs + 数据清洗)
// 1. 模拟解构 history (数据清洗)
// 2. 使用 @tauri-apps/plugin-fs (官方插件通道)
async function runSchemeF(
  session: Record<string, unknown>,
  basePath: string
): Promise<SchemeResult> {
  const r: SchemeResult = {
    name: "方案 F: 生产环境模拟 (plugin-fs)",
    tag: "F",
    color: "#a855f7",
    steps: [],
    summary: null,
  };
  const p = await join(basePath, "perf-test-f.json");
  addLog("[F] 生产环境模拟: 数据清洗 + plugin-fs 写入");

  // 1. 模拟数据清洗 (useChatStorageSeparated.ts 第 150 行)
  const t0 = performance.now();
  const { history, historyIndex, ...sessionToSave } = session as any;
  const js = JSON.stringify(sessionToSave, null, 2); // 生产环境用了美化 JSON
  const t1 = performance.now();
  r.steps.push({
    step: "数据清洗 + Stringify",
    duration: t1 - t0,
    details: `清洗后长度: ${js.length}`,
  });

  // 2. 使用 plugin-fs 写入
  const t2 = performance.now();
  await writeTextFile(p, js);
  const t3 = performance.now();
  r.steps.push({
    step: "plugin-fs.writeTextFile",
    duration: t3 - t2,
    details: "Tauri 官方标准通道",
  });

  // 3. 使用 plugin-fs 读取 (文本模式)
  const t4 = performance.now();
  const txt = await readTextFile(p);
  const t5 = performance.now();
  r.steps.push({
    step: "plugin-fs.readTextFile",
    duration: t5 - t4,
    details: `${txt.length} chars`,
  });

  // 4. 使用 plugin-fs 读取 (二进制模式 - 潜在优化点)
  const t4b = performance.now();
  const bin = await readFile(p);
  const decoded = new TextDecoder().decode(bin);
  const t5b = performance.now();
  r.steps.push({
    step: "plugin-fs.readFile + Decoder",
    duration: t5b - t4b,
    details: `长度: ${decoded.length} (潜在优化路径)`,
  });

  // 5. 解析
  const t6 = performance.now();
  const pd = JSON.parse(txt);
  const t7 = performance.now();
  r.steps.push({
    step: "JSON.parse",
    duration: t7 - t6,
    details: `还原对象, 节点数: ${Object.keys(pd.nodes || {}).length}`,
  });

  const fileSizeBytes = new TextEncoder().encode(js).length;
  r.summary = {
    fileSizeMB: fileSizeBytes / 1048576,
    totalTime: t1 - t0 + (t3 - t2) + (t5 - t4) + (t7 - t6),
    writeTime: t3 - t2,
    readTime: t5 - t4,
    serializeTime: t1 - t0,
    deserializeTime: t7 - t6,
  };
  addLog(`[F] 完成 ${r.summary.totalTime.toFixed(1)} ms`, "success");
  return r;
}

async function runAllTests() {
  testing.value = true;
  logs.value = [];
  allSchemeResults.value = [];
  comparisonData.value = [];
  try {
    addLog(`多方案对比: ${config.messageCount} 条, 每条 ~${config.contentSizeKB} KB`);
    const g0 = performance.now();
    const session = generateMockSession(config.messageCount, config.contentSizeKB);
    const g1 = performance.now();
    addLog(`数据生成: ${Object.keys(session.nodes).length} 节点, ${(g1 - g0).toFixed(1)} ms`);
    const appDir = await getAppConfigDir();
    const bp = await join(appDir, "component-tester/perf-tests");
    addLog("--- 方案 A ---");
    await yieldToUI();
    const rA = await runSchemeA(session as unknown as Record<string, unknown>, bp);
    addLog("--- 方案 B ---");
    await yieldToUI();
    const rB = await runSchemeB(session as unknown as Record<string, unknown>, bp);
    addLog("--- 方案 C (反面教材: Vec<u8>→number[]) ---");
    await yieldToUI();
    const rC = await runSchemeC(session as unknown as Record<string, unknown>, bp);
    addLog("--- 方案 D (直传写入 + 二进制读取: 最优组合) ---");
    await yieldToUI();
    const rD = await runSchemeD(session as unknown as Record<string, unknown>, bp);
    addLog("--- 方案 E (增量更新: JSON Patch) ---");
    await yieldToUI();
    const rE = await runSchemeE(session as unknown as Record<string, unknown>, bp);
    addLog("--- 方案 F (生产环境模拟: plugin-fs) ---");
    await yieldToUI();
    const rF = await runSchemeF(session as unknown as Record<string, unknown>, bp);
    const results = [rA, rB, rC, rD, rE, rF];
    allSchemeResults.value = results;
    const base = rA.summary?.totalTime ?? 1;
    comparisonData.value = results.map((x) => ({
      scheme: x.name,
      tag: x.tag,
      color: x.color,
      fileSizeMB: x.summary?.fileSizeMB.toFixed(2) ?? "0",
      writeTime: x.summary?.writeTime ?? 0,
      readTime: x.summary?.readTime ?? 0,
      serializeTime: x.summary?.serializeTime ?? 0,
      deserializeTime: x.summary?.deserializeTime ?? 0,
      totalTime: x.summary?.totalTime ?? 0,
      relativePercent: Math.round(((x.summary?.totalTime ?? 0) / base) * 100),
      steps: x.steps,
    }));
    addLog("========== 全部完成 ==========", "success");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    addLog(`测试失败: ${msg}`, "error");
    logger.error("测试失败", e instanceof Error ? e : new Error(msg));
  } finally {
    testing.value = false;
  }
}

// 数据生成
function generateRandomContent(targetBytes: number): string {
  const frags = [
    "这是一段模拟的中文回复内容，用于测试存储性能。",
    "The quick brown fox jumps over the lazy dog. ",
    "```typescript\nconst result = await fetch(url);\nconst data = await result.json();\n```\n",
    "## 分析结果\n\n根据以上数据，我们可以得出以下结论：\n\n",
    "1. 检查配置文件\n2. 验证 API 密钥\n3. 运行集成测试\n\n",
    "在深度学习领域，Transformer 架构已经成为主流。自注意力机制允许模型捕获长距离依赖关系。",
    "```python\nimport numpy as np\nmatrix = np.random.randn(256, 512)\nresult = np.dot(matrix, matrix.T)\n```\n",
    "| 指标 | 数值 | 状态 |\n|------|------|------|\n| 延迟 | 42ms | OK |\n\n",
    "用户需求可拆解为三个子任务：数据预处理、模型推理和结果后处理。",
    "> 注意：此操作不可逆，请确保已备份重要数据。\n\n",
    "根据 RFC 7231 规范，HTTP 429 表示请求频率超限。建议实现指数退避重试。",
    "性能优化建议：考虑使用 Web Worker 将 JSON 序列化移出主线程。",
    '```json\n{\n  "model": "gpt-4",\n  "temperature": 0.7,\n  "stream": true\n}\n```\n',
  ];
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?-_=+\n";
  const parts: string[] = [];
  let cur = 0;
  while (cur < targetBytes) {
    const f = frags[Math.floor(Math.random() * frags.length)];
    parts.push(f);
    cur += f.length * 1.5;
    const gl = 20 + Math.floor(Math.random() * 80);
    let g = "";
    for (let i = 0; i < gl; i++) g += chars[Math.floor(Math.random() * chars.length)];
    parts.push(g);
    cur += gl;
  }
  return parts.join("");
}

function generateMockSession(count: number, sizeKB: number) {
  const rootId = `node-${Date.now()}-root`;
  const nodes: Record<string, Record<string, unknown>> = {};
  const tgt = Math.max(0, sizeKB * 1024 - 500);
  const gid = (pre = "node") => `${pre}-${Math.random().toString(36).substring(2, 11)}`;
  nodes[rootId] = {
    id: rootId,
    parentId: null,
    childrenIds: [] as string[],
    content: "System Init",
    role: "system",
    status: "complete",
    isEnabled: true,
    timestamp: new Date().toISOString(),
    lastSelectedChildId: null,
  };
  let total = 1;
  const leaves: string[] = [rootId];
  while (total < count) {
    const pid = leaves[Math.floor(Math.random() * leaves.length)];
    const id = gid();
    const isA = Math.random() > 0.5;
    const meta: Record<string, unknown> = { isEnabled: true, timestamp: new Date().toISOString() };
    if (isA) {
      meta.agentId = "agent-gugu";
      meta.modelId = "gemini-3-flash";
      meta.usage = {
        promptTokens: 20000 + Math.floor(Math.random() * 10000),
        completionTokens: 500 + Math.floor(Math.random() * 2000),
      };
    } else {
      meta.userProfileId = "user-mty";
      meta.contentTokens = 1000 + Math.floor(Math.random() * 500);
    }
    const att =
      Math.random() > 0.9
        ? [{ id: gid("file"), type: "image", name: "test.png", size: 1048576 }]
        : [];
    nodes[id] = {
      id,
      parentId: pid,
      childrenIds: [] as string[],
      content: generateRandomContent(tgt) + `\nMsg#${total}`,
      role: isA ? "assistant" : "user",
      status: "complete",
      isEnabled: true,
      timestamp: new Date().toISOString(),
      metadata: meta,
      attachments: att,
      lastSelectedChildId: null,
    };
    (nodes[pid].childrenIds as string[]).push(id);
    nodes[pid].lastSelectedChildId = id;
    if ((nodes[pid].childrenIds as string[]).length > 2 || Math.random() > 0.8) {
      const idx = leaves.indexOf(pid);
      if (idx > -1) leaves.splice(idx, 1);
    }
    leaves.push(id);
    total++;
  }
  return {
    id: `session-perf-${Date.now()}`,
    name: "Perf Test",
    nodes,
    rootNodeId: rootId,
    activeLeafId: leaves[leaves.length - 1],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: total,
    // 模拟运行时字段 (生产环境保存时会剔除)
    history: new Array(100).fill({ type: "undo", data: "..." }),
    historyIndex: 50,
  };
}
</script>

<style scoped>
.storage-performance-tester {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px;
  height: 100%;
  box-sizing: border-box;
}
.action-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 12px;
  border: 1px solid var(--border-color);
  flex-wrap: wrap;
}
.bar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-size: 14px;
  padding-right: 16px;
  border-right: 1px solid var(--border-color);
}
.config-form :deep(.el-form-item) {
  margin-bottom: 0;
  margin-right: 12px;
}
.estimated-size {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-left: auto;
}
.estimated-size span {
  color: var(--el-color-primary);
  font-weight: 600;
  font-family: var(--el-font-family-mono);
}
.main-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  min-height: 0;
}
.comparison-card,
.results-card {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: hidden;
}
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color);
  font-size: 14px;
  font-weight: 600;
  background-color: rgba(var(--el-color-primary-rgb), 0.05);
}
.custom-table {
  --el-table-border-color: var(--border-color);
  --el-table-header-bg-color: transparent;
  background-color: transparent !important;
}
.custom-table :deep(tr) {
  background-color: transparent !important;
}
.duration-tag {
  font-family: var(--el-font-family-mono);
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
}
.text-success {
  color: var(--el-color-success);
}
.text-warning {
  color: var(--el-color-warning);
}
.text-danger {
  color: var(--el-color-danger);
}
.mono-value {
  font-family: var(--el-font-family-mono);
  font-weight: 600;
}
.scheme-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.scheme-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: #fff;
  font-weight: 700;
  font-size: 12px;
  flex-shrink: 0;
}
.baseline-tag {
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}
.relative-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  font-family: var(--el-font-family-mono);
}
.relative-tag.faster {
  background-color: rgba(var(--el-color-success-rgb), 0.1);
  color: var(--el-color-success);
}
.relative-tag.slower {
  background-color: rgba(var(--el-color-danger-rgb), 0.1);
  color: var(--el-color-danger);
}
.expand-steps {
  padding: 8px 16px 12px 48px;
}
.expand-steps-header {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px dashed var(--border-color);
}
.step-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  font-size: 12px;
  line-height: 1.6;
}
.step-item + .step-item {
  border-top: 1px solid rgba(var(--el-color-info-rgb), 0.06);
}
.step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.step-name {
  min-width: 220px;
  font-family: var(--el-font-family-mono);
  color: var(--el-text-color-primary);
}
.step-details {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: auto;
  text-align: right;
  white-space: nowrap;
}
.log-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: hidden;
  min-height: 180px;
  backdrop-filter: blur(var(--ui-blur));
}
.log-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  font-weight: 600;
  color: #ccc;
}
.log-actions {
  margin-left: auto;
}
.log-area {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  font-family: var(--el-font-family-mono);
  font-size: 12px;
  line-height: 1.5;
}
.empty-log {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-style: italic;
}
.log-entry {
  margin-bottom: 4px;
  display: flex;
  gap: 8px;
}
.log-time {
  color: #666;
  min-width: 80px;
}
.log-type-tag {
  min-width: 70px;
}
.info .log-type-tag {
  color: #409eff;
}
.success .log-type-tag {
  color: #67c23a;
}
.warn .log-type-tag {
  color: #e6a23c;
}
.error .log-type-tag {
  color: #f56c6c;
}
.log-msg {
  color: #eee;
  word-break: break-all;
}
.success .log-msg {
  color: #a3da8d;
}
.error .log-msg {
  color: #fab6b6;
}
.log-area::-webkit-scrollbar {
  width: 6px;
}
.log-area::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}
.log-area::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.2);
}
</style>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { invoke } from "@/platform/native/core";
import { listen } from "@/platform/native/events";
import { save } from "@/platform/native/dialog";
import { writeTextFile } from "@/platform/native/fs";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { captureControlEvidence } from "@/services/agent-control/bridge";
import type { ControlStatus } from "@/services/agent-control/protocol";

const errorHandler = createModuleErrorHandler("AgentControlSettings");
const status = ref<ControlStatus>();
const busy = ref(false);
const loadError = ref(false);
let unlisten: (() => void) | undefined;
let alive = true;
onMounted(async () => {
  try {
    const cleanup = await listen<ControlStatus>(
      "agent-control:status",
      (event) => {
        status.value = event.payload;
      }
    );
    if (!alive) {
      cleanup();
      return;
    }
    unlisten = cleanup;
    status.value = await invoke<ControlStatus>("agent_control_status");
  } catch (error) {
    loadError.value = true;
    errorHandler.warn(error, "调试接管状态读取失败");
  }
});
onUnmounted(() => {
  alive = false;
  unlisten?.();
});
async function toggle(value: string | number | boolean) {
  value = Boolean(value);
  busy.value = true;
  try {
    status.value = await invoke<ControlStatus>("agent_control_configure", {
      enabled: value,
    });
  } catch (error) {
    errorHandler.error(error, "调试接管设置失败，请重试");
  } finally {
    busy.value = false;
  }
}
async function capture() {
  // Freeze the in-memory evidence before opening a native dialog or changing focus.
  const evidence = captureControlEvidence();
  try {
    const path = await save({
      defaultPath: `aiohub-layout-${Date.now()}.json`,
      filters: [{ name: "诊断记录", extensions: ["json"] }],
    });
    if (!path) return;
    await writeTextFile(path, JSON.stringify(evidence, null, 2));
    customMessage.success("现场记录已保存");
  } catch (error) {
    errorHandler.error(error, "现场记录保存失败");
  }
}
</script>

<template>
  <section class="control-settings" aria-label="本机调试接管">
    <div class="control-heading">
      <div>
        <h3>本机调试接管</h3>
        <p>允许本机 CLI 查看和操作当前窗口，并持续记录最近的滚动与布局变化。</p>
      </div>
      <el-switch
        :model-value="status?.enabled ?? false"
        :disabled="!status || busy"
        :loading="busy"
        aria-label="启用本机调试接管"
        @change="toggle"
      />
    </div>
    <div class="control-actions">
      <span role="status">{{
        !status
          ? loadError
            ? "桌面服务连接失败，请重新打开此页面"
            : "正在连接桌面服务…"
          : status.enabled
            ? "已开启 · 现场记录中"
            : "已关闭"
      }}</span>
      <el-button :disabled="!status?.enabled" @click="capture"
        >保存现场记录</el-button
      >
    </div>
    <p class="control-hint">
      出现界面跳动时，按 Ctrl+Alt+Shift+D 即可保存现场，也可通过 CLI
      导出。接管开关会在下次启动时沿用；关闭后停止记录并断开 CLI。
    </p>
  </section>
</template>

<style scoped>
.control-settings {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
  background: var(--bg-secondary);
}
.control-heading,
.control-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
h3 {
  margin: 0 0 8px;
  color: var(--text-primary);
  font-size: 16px;
}
p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.6;
  font-size: 13px;
}
.control-actions {
  margin-top: 16px;
  font-size: 13px;
  color: var(--text-primary);
}
.control-hint {
  margin-top: 12px;
}
</style>

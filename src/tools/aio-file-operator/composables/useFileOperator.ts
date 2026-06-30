import { ref, computed } from "vue";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { customMessage } from "@/utils/customMessage";
import { useVcpDistributedStore } from "@/tools/vcp-connector/stores/vcpDistributedStore";
import * as actions from "../actions";
import { DEFAULT_ALLOWED_DIRECTORIES } from "../config";
import type { AioFileOperatorConfig, OperationLogEntry } from "../types";

const FILE_OPERATOR_TOOL_ID = "aio-file-operator";

export function useFileOperator() {
  const distStore = useVcpDistributedStore();

  // 状态变量
  const config = ref<AioFileOperatorConfig>({
    allowedDirectories: [],
    blackListRules: [],
    sandboxMode: "whitelist",
    maxFileSize: 10 * 1024 * 1024,
    enableAuditLog: true,
    overwritePolicy: "follow",
    logPanelWidth: 350,
    isLogCollapsed: false,
  });

  const maxFileSizeMB = ref(10);
  const logs = ref<OperationLogEntry[]>([]);
  const newDirectoryPath = ref("");
  const newRulePath = ref("");
  const newRuleType = ref<"block" | "approve">("block");

  const isFileOperatorSyncedToVcp = computed(() => {
    return distStore.exposedTools.some(
      (tool) => tool.name === FILE_OPERATOR_TOOL_ID
    );
  });

  const isFileOperatorPendingSync = computed(() => {
    return distStore.pendingExposedTools.some(
      (tool) => tool.name === FILE_OPERATOR_TOOL_ID
    );
  });

  // 真实核对分布式桥接状态：连接通道打开且 VCP 已确认当前工具清单。
  const isDistributedExposed = computed(() => {
    return distStore.status === "connected" && isFileOperatorSyncedToVcp.value;
  });

  const distributedStatusText = computed(() => {
    switch (distStore.status) {
      case "connecting":
        return "分布式连接中";
      case "connected":
        if (isFileOperatorSyncedToVcp.value) return "分布式已桥接";
        if (isFileOperatorPendingSync.value) return "分布式同步中";
        if (!distStore.nodeId) return "等待节点确认";
        return "分布式未暴露";
      case "error":
        return "分布式异常";
      default:
        return "本地就绪";
    }
  });

  // 排序后的日志（最新的在最上面）
  const sortedLogs = computed(() => {
    return [...logs.value].sort((a, b) => b.timestamp - a.timestamp);
  });

  // 加载配置
  async function loadConfig() {
    config.value = await actions.getConfig();
    maxFileSizeMB.value = Math.round(config.value.maxFileSize / 1024 / 1024);
  }

  // 保存配置
  async function saveConfig() {
    await actions.setConfig(config.value);
  }

  // 更新最大文件大小
  function updateMaxFileSize(val: any) {
    config.value.maxFileSize = val * 1024 * 1024;
    saveConfig();
  }

  // 处理路径拖放
  const handlePathDrop = (paths: string[]) => {
    if (paths.length > 0) {
      newDirectoryPath.value = paths[0];
      customMessage.success(`已选择路径: ${paths[0]}`);
    }
  };

  // 选择目录
  async function selectDirectory() {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "选择允许 AI 访问的白名单目录",
      });

      if (typeof selected === "string") {
        newDirectoryPath.value = selected;
      }
    } catch (e) {
      console.error("选择目录失败", e);
    }
  }

  // 添加自定义目录
  function addNewDirectory() {
    const path = newDirectoryPath.value.trim();
    if (!path) return;

    // 校验是否是绝对路径
    const isAbsolute = /^(?:[a-zA-Z]:[\\/]|[\\/]).+$/.test(path);
    if (!isAbsolute) {
      customMessage.error("请输入有效的绝对路径");
      return;
    }

    const normalized = path.replace(/\\/g, "/");
    if (config.value.allowedDirectories.includes(normalized)) {
      customMessage.warning("该目录已在列表中");
      return;
    }

    config.value.allowedDirectories.push(normalized);
    saveConfig();
    newDirectoryPath.value = "";
    customMessage.success("成功添加允许目录");
  }

  // 删除目录
  function removeDirectory(index: number) {
    if (config.value.sandboxMode === "blacklist") return;
    config.value.allowedDirectories.splice(index, 1);
    saveConfig();
  }

  // 重置为默认
  function resetToDefault() {
    if (config.value.sandboxMode === "blacklist") return;
    config.value.allowedDirectories = [...DEFAULT_ALLOWED_DIRECTORIES];
    saveConfig();
  }

  // 选择规则路径
  async function selectRulePath() {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "选择规则目录",
      });

      if (typeof selected === "string") {
        newRulePath.value = selected;
      }
    } catch (e) {
      console.error("选择目录失败", e);
    }
  }

  // 处理规则路径拖放
  const handleRulePathDrop = (paths: string[]) => {
    if (paths.length > 0) {
      newRulePath.value = paths[0];
      customMessage.success(`已选择路径: ${paths[0]}`);
    }
  };

  // 添加安全规则
  function addNewRule() {
    const path = newRulePath.value.trim();
    if (!path) return;

    // 校验是否是绝对路径
    const isAbsolute = /^(?:[a-zA-Z]:[\\/]|[\\/]).+$/.test(path);
    if (!isAbsolute) {
      customMessage.error("请输入有效的绝对路径");
      return;
    }

    const normalized = path.replace(/\\/g, "/");

    if (!config.value.blackListRules) {
      config.value.blackListRules = [];
    }

    if (config.value.blackListRules.some((r) => r.path === normalized)) {
      customMessage.warning("该路径已在规则列表中");
      return;
    }

    config.value.blackListRules.push({
      id: Math.random().toString(36).substring(2, 9),
      path: normalized,
      type: newRuleType.value,
    });

    saveConfig();
    newRulePath.value = "";
    customMessage.success("成功添加安全规则");
  }

  // 删除安全规则
  function removeRule(index: number) {
    config.value.blackListRules.splice(index, 1);
    saveConfig();
    customMessage.success("成功删除安全规则");
  }

  // 刷新日志
  async function refreshLogs() {
    logs.value = await actions.getOperationLogs();
  }

  // 清空日志
  async function clearLogs() {
    await actions.clearLogs();
    await refreshLogs();
  }

  return {
    config,
    maxFileSizeMB,
    logs,
    newDirectoryPath,
    newRulePath,
    newRuleType,
    isDistributedExposed,
    distributedStatusText,
    sortedLogs,
    loadConfig,
    saveConfig,
    updateMaxFileSize,
    handlePathDrop,
    selectDirectory,
    addNewDirectory,
    removeDirectory,
    resetToDefault,
    selectRulePath,
    handleRulePathDrop,
    addNewRule,
    removeRule,
    refreshLogs,
    clearLogs,
  };
}

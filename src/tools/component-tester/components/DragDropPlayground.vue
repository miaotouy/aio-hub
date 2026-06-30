<template>
  <div class="drag-drop-playground" :class="{ 'is-detached': isDetached }">
    <!-- 分离模式：顶部 ComponentHeader -->
    <ComponentHeader
      v-if="isDetached"
      ref="headerRef"
      :id="COMPONENT_ID"
      :title="title"
      :drag-mode="isDetached ? 'window' : 'detach'"
      :collapsible="false"
      show-actions
      @mousedown="handleDragStart"
      @reattach="handleReattach"
    />

    <div class="playground-body">
      <!-- ===== 测试区域 A：Web 原生 H5 拖放测试区 ===== -->
      <div class="section-card">
        <div class="section-title">
          <Move class="title-icon" />
          测试区域 A：Web 原生 H5 拖放测试区
        </div>
        <p class="area-desc">
          完全使用 Web 原生 Drag & Drop
          API。支持拖入内部色块，也支持拖入外部文件（通过 `e.dataTransfer.files`
          获取）。
        </p>

        <!-- 内部拖拽源 -->
        <div class="drag-demo">
          <div
            v-for="color in dragItems"
            :key="color.id"
            :draggable="true"
            class="drag-item"
            :style="{ background: color.bg }"
            @dragstart="(e) => handleItemDragStart(e, color)"
          >
            <span>{{ color.label }}</span>
          </div>
        </div>

        <!-- 原生放置目标 -->
        <div
          class="drop-target"
          @dragenter.prevent="handleNativeEnter"
          @dragover.prevent="handleNativeOver"
          @dragleave="handleNativeLeave"
          @drop.prevent="handleNativeDrop"
          :class="{ 'drag-over': nativeDragOver }"
        >
          <div class="drop-hint">
            <MoveHorizontal v-if="!nativeDragOver" class="drop-icon" />
            <ArrowDownToLine v-else class="drop-icon active" />
            <span>{{
              nativeDragOver ? "松开以放置！" : "拖拽色块或外部文件到此处"
            }}</span>
          </div>

          <!-- 放置结果展示 -->
          <div v-if="nativeDroppedColor" class="dropped-info">
            已放置色块:
            <span
              class="color-chip"
              :style="{ background: nativeDroppedColor.bg }"
            ></span>
            {{ nativeDroppedColor.label }}
          </div>

          <div v-if="nativeDroppedFiles.length > 0" class="file-list">
            <div class="file-list-title">
              已放置原生文件 ({{ nativeDroppedFiles.length }}):
            </div>
            <div
              v-for="(file, i) in nativeDroppedFiles"
              :key="i"
              class="file-item"
            >
              <FileIcon class="file-icon" />
              <div class="file-info">
                <span class="file-name">{{ file.name }}</span>
                <span class="file-meta"
                  >{{ formatSize(file.size) }} · {{ file.mime }}</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 测试区域 B：Tauri 窗口级拖放测试区 ===== -->
      <div class="section-card" ref="areaBRef">
        <div class="section-title">
          <FileUp class="title-icon" />
          测试区域 B：Tauri 窗口级拖放测试区
        </div>
        <p class="area-desc">
          不绑定任何原生 drop 事件。纯粹通过 Tauri 的 `listen`
          监听窗口级拖放事件（`custom-file-drop`
          等），并根据坐标判断是否落在此区域。
        </p>
        <div class="file-drop-zone" :class="{ 'drag-over': tauriDragOver }">
          <div class="drop-zone-hint">
            <UploadCloud v-if="!tauriDragOver" class="hint-icon" />
            <ArrowDownToLine v-else class="hint-icon active" />
            <span>{{
              tauriDragOver
                ? "松开文件以放置 (Tauri)"
                : "拖拽外部文件到此处 (Tauri 监听)"
            }}</span>
          </div>
          <div v-if="tauriDroppedPaths.length > 0" class="file-list">
            <div class="file-list-title">
              Tauri 捕获的绝对路径 ({{ tauriDroppedPaths.length }}):
            </div>
            <div
              v-for="(path, i) in tauriDroppedPaths"
              :key="i"
              class="file-item"
            >
              <FileIcon class="file-icon" />
              <div class="file-info">
                <span class="file-name">{{ path.split(/[/\\]/).pop() }}</span>
                <span class="file-meta">{{ path }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 测试区域 C：纯 JS 拖拽测试区 (鼠标/触摸事件) ===== -->
      <div class="section-card">
        <div class="section-title">
          <Move class="title-icon" />
          测试区域 C：纯 JS 拖拽测试区 (鼠标/触摸事件)
          <span class="badge badge-js">纯 JS 模拟</span>
        </div>
        <p class="area-desc">
          不使用 HTML5 Drag & Drop API。完全通过监听 `mousedown`、`mousemove` 和
          `mouseup` 事件，手动计算偏移量并更新 `transform`
          样式。支持碰撞检测与自动吸附放置。
        </p>

        <div class="js-drag-container">
          <!-- 纯 JS 拖拽源 -->
          <div
            ref="jsDragItemRef"
            class="js-drag-item"
            :class="{ 'is-dragging': jsDragging }"
            :style="jsDragStyle"
            @mousedown="handleJsDragStart"
          >
            <span>JS 拖拽</span>
          </div>

          <!-- 纯 JS 放置目标 -->
          <div
            ref="jsDropTargetRef"
            class="js-drop-target"
            :class="{ 'drag-over': jsDragOver, 'has-dropped': jsDropped }"
          >
            <div class="drop-hint" v-if="!jsDropped">
              <MoveHorizontal v-if="!jsDragOver" class="drop-icon" />
              <ArrowDownToLine v-else class="drop-icon active" />
              <span>{{
                jsDragOver ? "松开以放置！" : "将 JS 拖拽方块拖到此处"
              }}</span>
            </div>
            <div v-else class="dropped-info">
              已成功放置 JS 方块！
              <el-button
                size="small"
                text
                type="primary"
                class="reset-btn"
                @click="resetJsDrag"
              >
                重置
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 高频事件日志面板 ===== -->
      <div class="section-card log-panel">
        <div class="section-title">
          <Activity class="title-icon" />
          高频事件日志面板
          <el-button
            size="small"
            text
            type="danger"
            class="clear-btn"
            @click="logEntries = []"
          >
            清空日志
          </el-button>
        </div>
        <div class="log-container" ref="logContainerRef">
          <div v-if="logEntries.length === 0" class="log-empty">
            暂无事件日志，请在上方测试区域拖拽或放置文件
          </div>
          <div
            v-for="(entry, i) in logEntries"
            :key="i"
            class="log-entry"
            :class="[`log-${entry.source}`]"
          >
            <span class="log-badge"
              >[{{
                entry.source === "native" ? "Web 原生" : "Tauri 窗口"
              }}]</span
            >
            <span class="log-type">{{ entry.type }}</span>
            <span class="log-time">{{ entry.time }}</span>
            <span v-if="entry.coords" class="log-coords">
              ({{ entry.coords.x }}, {{ entry.coords.y }})
            </span>
            <span v-if="entry.data" class="log-data">{{ entry.data }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import throttle from "lodash-es/throttle";
import { listen } from "@tauri-apps/api/event";
import {
  Move,
  FileUp,
  Activity,
  MoveHorizontal,
  ArrowDownToLine,
  UploadCloud,
} from "lucide-vue-next";
import ComponentHeader from "@/components/ComponentHeader.vue";
import FileIcon from "@/components/common/FileIcon.vue";
import { useDetachable } from "@/composables/useDetachable";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { customMessage } from "@/utils/customMessage";

// ==================== 常量 ====================
const COMPONENT_ID = "component-tester:drag-drop-playground";

// ==================== Props ====================
interface Props {
  isDetached?: boolean;
  title?: string;
}
const props = withDefaults(defineProps<Props>(), {
  isDetached: false,
  title: "拖放测试区",
  embedded: false,
});

// ==================== 拖拽数据 ====================
interface DragItem {
  id: string;
  label: string;
  bg: string;
}
const dragItems: DragItem[] = [
  { id: "red", label: "红色方块", bg: "var(--el-color-danger)" },
  { id: "blue", label: "蓝色方块", bg: "var(--el-color-primary)" },
  { id: "green", label: "绿色方块", bg: "var(--el-color-success)" },
];

// 区域 A 状态
const nativeDragOver = ref(false);
const nativeDroppedColor = ref<DragItem | null>(null);
interface DroppedFile {
  name: string;
  size: number;
  mime: string;
}
const nativeDroppedFiles = ref<DroppedFile[]>([]);

// 区域 B 状态与引用
const areaBRef = ref<HTMLElement>();
const tauriDragOver = ref(false);
const tauriDroppedPaths = ref<string[]>([]);
let lastTauriDrop: { signature: string; receivedAt: number } | null = null;

const recordTauriDrop = (
  paths: string[] | undefined,
  position: { x: number; y: number } | undefined,
  isInside: boolean
) => {
  const normalizedPaths = Array.isArray(paths) ? paths : [];
  const signature = JSON.stringify({
    paths: normalizedPaths,
    position: position ? { x: position.x, y: position.y } : null,
    isInside,
  });
  const nowMs = performance.now();

  if (
    lastTauriDrop &&
    lastTauriDrop.signature === signature &&
    nowMs - lastTauriDrop.receivedAt < 150
  ) {
    return false;
  }

  lastTauriDrop = { signature, receivedAt: nowMs };

  if (isInside && normalizedPaths.length > 0) {
    tauriDroppedPaths.value = [...tauriDroppedPaths.value, ...normalizedPaths];
  }

  return true;
};

// Tauri 监听器注销函数列表
const unlistens: (() => void)[] = [];

// ==================== 日志系统 ====================
interface LogEntry {
  source: "native" | "tauri";
  type: string;
  time: string;
  coords?: { x: number; y: number };
  data?: string;
}
const logEntries = ref<LogEntry[]>([]);
const logContainerRef = ref<HTMLElement>();

const logEntry = (entry: LogEntry) => {
  logEntries.value.unshift(entry);
  if (logEntries.value.length > 200) logEntries.value.pop();
  nextTick(() => {
    if (logContainerRef.value) {
      logContainerRef.value.scrollTop = 0;
    }
  });
};

const now = () => new Date().toLocaleTimeString("zh-CN", { hour12: false });

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ==================== 辅助解析函数 ====================
const parsePathsFromDataTransfer = (dt: DataTransfer): string[] => {
  const paths: string[] = [];

  // 1. 尝试从 text/uri-list 获取
  const uriList = dt.getData("text/uri-list");
  if (uriList) {
    const uris = uriList.split(/[\r\n]+/).filter(Boolean);
    for (const uri of uris) {
      if (uri.startsWith("file://")) {
        try {
          let p = decodeURIComponent(uri.substring(7));
          if (p.startsWith("/")) {
            if (p.charAt(2) === ":" || p.charAt(2) === "|") {
              p = p.substring(1);
            }
          }
          p = p.replace(/\|/, ":");
          p = p.replace(/\//g, "\\");
          paths.push(p);
        } catch (err) {
          console.error("解析 URI 失败:", err);
        }
      }
    }
  }

  // 2. 如果 uri-list 没拿到，尝试从 text/plain 获取
  if (paths.length === 0) {
    const plainText = dt.getData("text/plain");
    if (plainText) {
      const lines = plainText.split(/[\r\n]+/).filter(Boolean);
      for (const line of lines) {
        const trimmed = line.trim();
        const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(trimmed);
        const isUnixPath = trimmed.startsWith("/");
        if (isWindowsPath || isUnixPath) {
          paths.push(trimmed);
        }
      }
    }
  }

  return paths;
};

// ==================== 区域 A：Web 原生 H5 拖放 ====================
let currentDragItem: DragItem | null = null;

const handleItemDragStart = (e: DragEvent, item: DragItem) => {
  currentDragItem = item;
  e.dataTransfer?.setData("text/plain", item.id);
  e.dataTransfer!.effectAllowed = "move";
  logEntry({
    source: "native",
    type: "dragstart",
    time: now(),
    coords: { x: e.clientX, y: e.clientY },
    data: `开始拖拽色块: ${item.label}`,
  });
};

const handleNativeEnter = (e: DragEvent) => {
  nativeDragOver.value = true;
  logEntry({
    source: "native",
    type: "dragenter (A)",
    time: now(),
    coords: { x: e.clientX, y: e.clientY },
    data: "原生拖拽进入区域 A",
  });
};

const _throttledNativeOver = throttle((e: DragEvent) => {
  logEntry({
    source: "native",
    type: "dragover (A)",
    time: now(),
    coords: { x: e.clientX, y: e.clientY },
  });
}, 100);
const handleNativeOver = (e: DragEvent) => _throttledNativeOver(e);

const handleNativeLeave = (e: DragEvent) => {
  nativeDragOver.value = false;
  logEntry({
    source: "native",
    type: "dragleave (A)",
    time: now(),
    coords: { x: e.clientX, y: e.clientY },
    data: "原生拖拽离开区域 A",
  });
};

const handleNativeDrop = (e: DragEvent) => {
  nativeDragOver.value = false;

  // 1. 尝试获取内部色块数据
  const data = e.dataTransfer?.getData("text/plain");
  const droppedColor = data
    ? dragItems.find((i) => i.id === data)
    : currentDragItem;
  if (droppedColor) {
    nativeDroppedColor.value = droppedColor;
    logEntry({
      source: "native",
      type: "drop (A) - 色块",
      time: now(),
      coords: { x: e.clientX, y: e.clientY },
      data: `成功放置色块: ${droppedColor.label}`,
    });
    currentDragItem = null;
    return;
  }

  // 2. 尝试获取外部 file 数据
  const fileList = e.dataTransfer?.files;
  const newFiles: DroppedFile[] = [];
  const filesLog: string[] = [];

  if (fileList && fileList.length > 0) {
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      newFiles.push({ name: f.name, size: f.size, mime: f.type || "未知" });
      filesLog.push(`${f.name} (${f.type || "未知"})`);
    }
  }

  // 3. 如果原生 files 为空，尝试解析路径（VSCode 拖拽兜底）
  if (newFiles.length === 0 && e.dataTransfer) {
    const parsedPaths = parsePathsFromDataTransfer(e.dataTransfer);
    for (const p of parsedPaths) {
      const name = p.split(/[/\\]/).pop() || p;
      newFiles.push({ name, size: 0, mime: "VSCode 拖拽路径" });
      filesLog.push(`${name} (路径: ${p})`);
    }
  }

  if (newFiles.length > 0) {
    nativeDroppedFiles.value = [...nativeDroppedFiles.value, ...newFiles];
    logEntry({
      source: "native",
      type: `drop (A) - ${newFiles.length} 个文件`,
      time: now(),
      coords: { x: e.clientX, y: e.clientY },
      data: `成功放置文件: ${filesLog.join("; ")}`,
    });
  }

  currentDragItem = null;
};

// ==================== 区域 B：Tauri 窗口级拖放监听 ====================
// 辅助函数：判断位置是否在元素内
const isPositionInElement = (
  position: { x: number; y: number },
  element: HTMLElement
) => {
  const rect = element.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  return (
    position.x >= rect.left * ratio &&
    position.x <= rect.right * ratio &&
    position.y >= rect.top * ratio &&
    position.y <= rect.bottom * ratio
  );
};

const setupTauriListeners = async () => {
  // 1. 监听拖动进入事件
  const unlistenEnter = await listen("custom-drag-enter", (event: any) => {
    const element = areaBRef.value;
    if (!element) return;

    const { position } = event.payload;
    const isInside = isPositionInElement(position, element);

    if (isInside) {
      tauriDragOver.value = true;
    }

    logEntry({
      source: "tauri",
      type: "custom-drag-enter",
      time: now(),
      coords: position,
      data: `Tauri 拖拽进入窗口 | 是否在区域 B 内: ${isInside}`,
    });
  });
  unlistens.push(unlistenEnter);

  // 2. 监听拖动移动事件
  const unlistenOver = await listen("custom-drag-over", (event: any) => {
    const element = areaBRef.value;
    if (!element) return;

    const { position } = event.payload;
    const isInside = isPositionInElement(position, element);

    if (isInside !== tauriDragOver.value) {
      tauriDragOver.value = isInside;
    }

    // 节流记录 Tauri 拖拽移动日志
    logTauriOver(position, isInside);
  });
  unlistens.push(unlistenOver);

  const logTauriOver = throttle(
    (position: { x: number; y: number }, isInside: boolean) => {
      logEntry({
        source: "tauri",
        type: "custom-drag-over",
        time: now(),
        coords: position,
        data: `Tauri 拖拽移动 | 是否在区域 B 内: ${isInside}`,
      });
    },
    100
  );

  // 3. 监听拖动离开事件
  const unlistenLeave = await listen("custom-drag-leave", () => {
    tauriDragOver.value = false;
    logEntry({
      source: "tauri",
      type: "custom-drag-leave",
      time: now(),
      data: "Tauri 拖拽离开窗口",
    });
  });
  unlistens.push(unlistenLeave);

  // 4. 监听文件放下事件
  const unlistenDrop = await listen("custom-file-drop", (event: any) => {
    tauriDragOver.value = false;
    const element = areaBRef.value;
    if (!element) return;

    const { paths, position } = event.payload;
    const isInside = isPositionInElement(position, element);

    const shouldLog = recordTauriDrop(paths, position, isInside);
    if (!shouldLog) return;

    logEntry({
      source: "tauri",
      type: `custom-file-drop (${paths?.length || 0} 个文件)`,
      time: now(),
      coords: position,
      data: `Tauri 放置文件 | 是否在区域 B 内: ${isInside} | 路径: ${paths?.join("; ")}`,
    });
  });
  unlistens.push(unlistenDrop);

  // 5. 监听 Tauri 原生 Webview 拖放事件（Tauri v2 官方最底层的拖放监听，对 VSCode 拖拽极其可靠）
  try {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    const webview = getCurrentWebview();

    const logWebviewOver = throttle(
      (coords: { x: number; y: number }, isInside: boolean) => {
        logEntry({
          source: "tauri",
          type: "webview-drag-over",
          time: now(),
          coords,
          data: `Webview 拖拽移动 | 是否在区域 B 内: ${isInside}`,
        });
      },
      100
    );

    const unlistenDragDrop = await webview.onDragDropEvent((event) => {
      const element = areaBRef.value;
      if (!element) return;

      const { type, position, paths } = event.payload as any;
      const coords = position
        ? { x: position.x, y: position.y }
        : { x: 0, y: 0 };
      const isInside = position
        ? isPositionInElement(position, element)
        : false;

      if (type === "enter") {
        if (isInside) {
          tauriDragOver.value = true;
        }
        logEntry({
          source: "tauri",
          type: "webview-drag-enter",
          time: now(),
          coords,
          data: `Webview 拖拽进入 | 是否在区域 B 内: ${isInside}`,
        });
      } else if (type === "over") {
        if (isInside !== tauriDragOver.value) {
          tauriDragOver.value = isInside;
        }
        logWebviewOver(coords, isInside);
      } else if (type === "leave") {
        tauriDragOver.value = false;
        logEntry({
          source: "tauri",
          type: "webview-drag-leave",
          time: now(),
          data: "Webview 拖拽离开",
        });
      } else if (type === "drop") {
        tauriDragOver.value = false;
        const shouldLog = recordTauriDrop(paths, coords, isInside);
        if (!shouldLog) return;

        logEntry({
          source: "tauri",
          type: `webview-file-drop (${paths?.length || 0} 个文件)`,
          time: now(),
          coords,
          data: `Webview 放置文件 | 是否在区域 B 内: ${isInside} | 路径: ${paths?.join("; ")}`,
        });
      }
    });
    unlistens.push(unlistenDragDrop);
  } catch (err) {
    console.error("监听 webview.onDragDropEvent 失败:", err);
  }
};

// 生命周期注册
onMounted(() => {
  setupTauriListeners();
});

onUnmounted(() => {
  unlistens.forEach((unlisten) => unlisten());
});

// ==================== 窗口分离 / 重附着 ====================
const headerRef = ref<InstanceType<typeof ComponentHeader>>();
const detachedManager = useDetachedManager();

const handleDragStart = (e: MouseEvent) => {
  if (props.isDetached || !headerRef.value) return;
  const config = headerRef.value.getDetachableConfig(e);
  config.width = 680;
  config.height = 640;
  useDetachable().startDetaching(config);
};

const handleReattach = async () => {
  if (props.isDetached) {
    customMessage.info("正在回归主窗口...");
    await detachedManager.closeWindow(COMPONENT_ID);
  }
};

// ==================== 区域 C：纯 JS 拖拽模拟 (鼠标事件) ====================
const jsDragItemRef = ref<HTMLElement>();
const jsDropTargetRef = ref<HTMLElement>();
const jsDragging = ref(false);
const jsDragOver = ref(false);
const jsDropped = ref(false);

// 拖拽位置状态
let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;
const offsetX = ref(0);
const offsetY = ref(0);

const jsDragStyle = computed(() => {
  return {
    transform: `translate(${offsetX.value}px, ${offsetY.value}px)`,
    transition: jsDragging.value ? "none" : "transform 0.2s ease",
    background: jsDropped.value
      ? "var(--el-color-success)"
      : "var(--el-color-warning)",
    cursor: jsDragging.value ? "grabbing" : "grab",
  };
});

// 碰撞检测
const checkCollision = () => {
  if (!jsDragItemRef.value || !jsDropTargetRef.value) return false;
  const dragRect = jsDragItemRef.value.getBoundingClientRect();
  const targetRect = jsDropTargetRef.value.getBoundingClientRect();

  // 简单的 AABB 碰撞检测
  return !(
    dragRect.right < targetRect.left ||
    dragRect.left > targetRect.right ||
    dragRect.bottom < targetRect.top ||
    dragRect.top > targetRect.bottom
  );
};

const handleJsDragStart = (e: MouseEvent) => {
  if (jsDropped.value) return;

  e.preventDefault();
  jsDragging.value = true;
  startX = e.clientX;
  startY = e.clientY;

  logEntry({
    source: "native",
    type: "js-dragstart",
    time: now(),
    coords: { x: e.clientX, y: e.clientY },
    data: "开始纯 JS 拖拽",
  });

  window.addEventListener("mousemove", handleJsDragMove);
  window.addEventListener("mouseup", handleJsDragEnd);
};

const throttledJsLog = throttle(
  (coords: { x: number; y: number }, over: boolean) => {
    logEntry({
      source: "native",
      type: "js-dragmove",
      time: now(),
      coords,
      data: `纯 JS 拖拽中 | 是否碰撞: ${over}`,
    });
  },
  100
);

const handleJsDragMove = (e: MouseEvent) => {
  if (!jsDragging.value) return;

  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  offsetX.value = currentX + dx;
  offsetY.value = currentY + dy;

  const isOver = checkCollision();
  if (jsDragOver.value !== isOver) {
    jsDragOver.value = isOver;
  }

  throttledJsLog({ x: e.clientX, y: e.clientY }, isOver);
};

const handleJsDragEnd = (e: MouseEvent) => {
  if (!jsDragging.value) return;
  jsDragging.value = false;

  window.removeEventListener("mousemove", handleJsDragMove);
  window.removeEventListener("mouseup", handleJsDragEnd);

  const isOver = checkCollision();
  if (isOver) {
    jsDropped.value = true;
    jsDragOver.value = false;

    // 吸附到目标中心
    if (jsDragItemRef.value && jsDropTargetRef.value) {
      const dragRect = jsDragItemRef.value.getBoundingClientRect();
      const targetRect = jsDropTargetRef.value.getBoundingClientRect();

      const dragCenterX = dragRect.left - offsetX.value + dragRect.width / 2;
      const dragCenterY = dragRect.top - offsetY.value + dragRect.height / 2;
      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;

      offsetX.value = targetCenterX - dragCenterX;
      offsetY.value = targetCenterY - dragCenterY;
      currentX = offsetX.value;
      currentY = offsetY.value;
    }

    logEntry({
      source: "native",
      type: "js-drop",
      time: now(),
      coords: { x: e.clientX, y: e.clientY },
      data: "纯 JS 拖拽成功放置！",
    });
  } else {
    // 回弹
    offsetX.value = 0;
    offsetY.value = 0;
    currentX = 0;
    currentY = 0;

    logEntry({
      source: "native",
      type: "js-dragcancel",
      time: now(),
      coords: { x: e.clientX, y: e.clientY },
      data: "纯 JS 拖拽取消，回弹至原位",
    });
  }
};

const resetJsDrag = () => {
  jsDropped.value = false;
  jsDragOver.value = false;
  offsetX.value = 0;
  offsetY.value = 0;
  currentX = 0;
  currentY = 0;
  logEntry({
    source: "native",
    type: "js-reset",
    time: now(),
    data: "重置纯 JS 拖拽状态",
  });
};
</script>

<style scoped>
.drag-drop-playground {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.drag-drop-playground.is-detached {
  background: var(--container-bg);
  border-radius: 12px;
  height: 100%;
}

.playground-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-content: start;
}

/* 测试区 C 和日志面板占整行 */
.playground-body > .section-card:nth-child(3),
.playground-body > .section-card:nth-child(4) {
  grid-column: 1 / -1;
}

/* ===== 区块卡片 ===== */
.section-card {
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 10px;
  padding: 12px;
  backdrop-filter: blur(var(--ui-blur));
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--el-text-color-primary);
  border-left: 3px solid var(--primary-color);
  padding-left: 8px;
}

.title-icon {
  width: 16px;
  height: 16px;
  color: var(--primary-color);
}

.badge {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 8px;
  border-radius: 4px;
  margin-left: auto;
}
.badge-embed {
  background: rgba(var(--el-color-info-rgb), 0.1);
  color: var(--el-color-info);
}
.badge-detach {
  background: rgba(var(--el-color-warning-rgb), 0.1);
  color: var(--el-color-warning);
}

.area-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin: 0 0 8px 0;
  line-height: 1.4;
}

/* ===== 原生拖拽区 ===== */
.drag-demo {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.drag-item {
  width: 60px;
  height: 60px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  user-select: none;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  transition:
    transform 0.15s,
    box-shadow 0.15s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.drag-item:active {
  cursor: grabbing;
  transform: scale(1.1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.drop-target {
  border: 2px dashed var(--border-color);
  border-radius: 10px;
  padding: 16px;
  text-align: center;
  transition: all 0.2s;
  min-height: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.drop-target.drag-over {
  border-color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), 0.05);
}

.drop-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.drop-icon {
  width: 22px;
  height: 22px;
  color: var(--el-text-color-placeholder);
}
.drop-icon.active {
  color: var(--el-color-primary);
  animation: bounce 0.4s infinite alternate;
}

.dropped-info {
  font-size: 13px;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-chip {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 4px;
}

/* ===== 文件拖入区 ===== */
.file-drop-zone {
  border: 2px dashed var(--border-color);
  border-radius: 10px;
  padding: 20px 16px;
  text-align: center;
  transition: all 0.2s;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background-color: rgba(var(--el-color-primary-rgb), 0.01);
}
.file-drop-zone.drag-over {
  border-color: var(--el-color-success);
  background-color: rgba(var(--el-color-success-rgb), 0.05);
}

.drop-zone-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.hint-icon {
  width: 28px;
  height: 28px;
  color: var(--el-text-color-placeholder);
}
.hint-icon.active {
  color: var(--el-color-success);
  animation: bounce 0.4s infinite alternate;
}

.file-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--border-color);
  padding-top: 12px;
}

.file-list-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-align: left;
  margin-bottom: 4px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--input-bg);
  border-radius: 8px;
}

.file-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.file-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.file-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

/* ===== 纯 JS 拖拽区 ===== */
.badge-js {
  background: rgba(var(--el-color-warning-rgb), 0.1);
  color: var(--el-color-warning);
}

.js-drag-container {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  position: relative;
}

.js-drag-item {
  width: 60px;
  height: 60px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  position: relative;
  z-index: 10;
  will-change: transform;
}

.js-drag-item.is-dragging {
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  opacity: 0.9;
}

.js-drop-target {
  flex: 1;
  min-width: 120px;
  min-height: 100px;
  border: 2px dashed var(--border-color);
  border-radius: 10px;
  padding: 16px;
  text-align: center;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-color: rgba(var(--el-color-warning-rgb), 0.01);
}
.js-drop-target.drag-over {
  border-color: var(--el-color-warning);
  background-color: rgba(var(--el-color-warning-rgb), 0.08);
}
.js-drop-target.has-dropped {
  border-color: var(--el-color-success);
  background-color: rgba(var(--el-color-success-rgb), 0.05);
  border-style: solid;
}

.js-drop-target .dropped-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--el-color-success);
  font-weight: 600;
}

.js-drop-target .reset-btn {
  margin-left: 8px;
}

/* ===== 日志面板 ===== */
.log-panel {
  display: flex;
  flex-direction: column;
  min-height: 140px;
}

.log-panel .section-title {
  flex-shrink: 0;
}

.clear-btn {
  margin-left: auto;
}

.log-container {
  flex: 1;
  overflow-y: auto;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.5;
  max-height: 180px;
}

.log-empty {
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 20px;
}

.log-entry {
  display: flex;
  gap: 4px;
  padding: 1px 4px;
  border-bottom: 1px solid var(--border-color);
  align-items: baseline;
  white-space: normal;
  word-break: break-all;
  font-size: 11px;
}

.log-entry.log-native {
  background-color: rgba(var(--el-color-primary-rgb), 0.03);
}
.log-entry.log-tauri {
  background-color: rgba(var(--el-color-success-rgb), 0.03);
}

.log-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-color-info);
  flex-shrink: 0;
}
.log-native .log-badge {
  color: var(--el-color-primary);
}
.log-tauri .log-badge {
  color: var(--el-color-success);
}

.log-type {
  font-weight: 600;
  color: var(--el-text-color-primary);
  flex-shrink: 0;
}

.log-time {
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}

.log-coords {
  color: var(--el-color-warning);
  flex-shrink: 0;
}

.log-data {
  color: var(--el-text-color-secondary);
}

@keyframes bounce {
  from {
    transform: translateY(-4px);
  }
  to {
    transform: translateY(4px);
  }
}
</style>

# 实时字幕OCR (Realtime Subtitle OCR) 实施计划书

本文档详细规划了“实时字幕OCR”独立模块的开发步骤、核心代码实现细节以及验证方法，作为后续施工的指导路线图。

> 创建时间：2026-07-05

---

## 1. 准备工作与依赖分析

### 1.1. 核心依赖

- **前端**：
  - `lucide-vue-next`：图标支持。
  - `element-plus`：UI 组件支持。
  - `pinia`：状态管理（可选，若逻辑简单可直接用 Composable 闭环）。
- **后端 (Rust)**：
  - `windows` crate：用于调用 Windows GDI API 进行区域截屏。
  - `image` crate：用于图像缩放、灰度化、aHash 计算以及将截取的像素数据编码为 PNG 格式。

### 1.2. 共享能力导入

- **OCR 调度器**：`src/tools/smart-ocr/platform/runner.ts` 中的 `useOcrRunner`。
- **OCR 配置管理**：`src/tools/smart-ocr/platform/cloud/profiles.ts` 中的 `useOcrProfiles`。

---

## 2. 实施步骤规划

整个开发过程分为四个阶段，每个阶段都有明确的交付物和验证标准。

### 阶段一：Rust 后端极速区域截屏命令实现

#### 1. 编写 Rust 命令

在 `src-tauri/src/commands/window_automator.rs`（或新建 `src-tauri/src/commands/screen_capture.rs`）中实现 `capture_screen_rect` 命令：

- **函数签名**（实际实现中采用 Tauri v2 推荐的二进制响应包装）：
  ```rust
  #[tauri::command]
  pub fn capture_screen_rect(
      x: i32,
      y: i32,
      width: i32,
      height: i32,
      last_hash: Option<String>,
      threshold: Option<i32>,
  ) -> Result<CaptureResult, String>
  ```
- **实现逻辑 (Windows GDI + aHash 去重)**：
  1. 获取屏幕设备上下文：`hdc_screen = GetDC(HWND(0))`。
  2. 创建兼容的内存设备上下文：`hdc_mem = CreateCompatibleDC(hdc_screen)`。
  3. 创建兼容的位图：`h_bitmap = CreateCompatibleBitmap(hdc_screen, width, height)`。
  4. 将位图选入内存上下文：`SelectObject(hdc_mem, h_bitmap)`。
  5. 拷贝屏幕指定区域像素到位图：`BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, x, y, SRCCOPY)`。
  6. 将位图数据转换为 `image::RgbaImage`。
  7. 在内存中将图像缩放到 8x8 并计算 aHash。
  8. 对比 `last_hash`，若汉明距离小于 `threshold`，则直接返回 `changed: false`，不进行 PNG 编码。
  9. 若有变化，将图像编码为 PNG 字节流，返回 `changed: true`。
  10. 释放资源：`DeleteObject(h_bitmap)`，`DeleteDC(hdc_mem)`，`ReleaseDC(HWND(0), hdc_screen)`。

#### 2. 注册命令

在 `src-tauri/src/lib.rs` 的 `tauri::generate_handler![]` 中注册 `capture_screen_rect`。

---

### 阶段二：前端核心业务逻辑 `useScreenMonitor.ts` 实现

In `src/tools/realtime-subtitle-ocr/composables/useScreenMonitor.ts` 中实现核心逻辑：

#### 1. 文本合并与断句 (编辑距离)

```typescript
function getLevenshteinDistance(s1: string, s2: string): number {
  // 标准编辑距离算法实现
}

function getSimilarity(s1: string, s2: string): number {
  const distance = getLevenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  return maxLength === 0 ? 1 : 1 - distance / maxLength;
}
```

#### 3. 定时采样与 OCR 调度

- 维护 `subtitleList` 响应式数组。
- 启动 `setInterval`，定时调用 `capture_screen_rect`。
- 对比 aHash，若画面有变化，调用 `useOcrRunner().runOcr` 进行识别。
- 根据相似度合并或追加字幕。

---

### 阶段三：UI 组件与悬浮监控框实现

#### 1. 悬浮监控框 `MonitorBox.vue` (可分离组件)

- **视觉设计**：
  - 整体背景完全透明：`background: transparent !important;`。
  - 边缘保留 2px 主题色虚线边框（`border: 2px dashed var(--el-color-primary)`），并带微弱呼吸灯发光效果。
  - 顶部提供一个 24px 高的极简半透明控制栏（`background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);`），包含拖拽手柄（`data-tauri-drag-region`）、实时坐标尺寸显示、置顶切换和关闭按钮。
- **坐标同步**：
  - 监听窗口的 `resize` 和 `move` 事件，高频防抖将当前窗口的绝对屏幕坐标 $(X, Y, W, H)$ 同步到 `monitorStore`。
  - 截图时，自动将坐标向内收缩（如 $X+2, Y+26, W-4, H-30$），完美避开监控框自身的边框和控制栏。

#### 2. 主界面 `RealtimeSubtitleOcr.vue`

- **左侧：字幕时间轴**
  - 滚动展示已识别的字幕列表，每条字幕包含 `[开始时间 --> 结束时间]` 和 `文本内容`。
  - 支持双击文本直接编辑，支持删除单条字幕。
  - 底部提供“一键复制全部文本”和“导出 SRT 字幕”按钮。
- **右侧：控制面板**
  - **区域选择**：提供“打开监控框” / “聚焦监控框”按钮，显示当前监控框的绝对坐标。
  - **监控设置**：
    - 采样频率（滑块，0.5s ~ 3s）。
    - 去重灵敏度（下拉框，高/中/低，对应汉明距离阈值）。
    - OCR 引擎选择（下拉框，直接读取并渲染 `useOcrProfiles().profiles`）。
  - **控制按钮**：大而醒目的“开始监控” / “停止监控”按钮。

---

### 阶段四：工具注册与集成

#### 1. 注册工具

在 `src/tools/realtime-subtitle-ocr/realtime-subtitle-ocr.registry.ts` 中注册工具：

```typescript
import { markRaw } from "vue";
import { Video } from "lucide-vue-next";
import type { ToolConfig } from "@/types/tools";

export default class RealtimeSubtitleOcrRegistry implements ToolRegistry {
  public readonly id = "realtime-subtitle-ocr";
  public readonly runMode = "any";
  public readonly name = "实时字幕OCR";
  public readonly description =
    "高频、低开销的屏幕动态监控与流式字幕 OCR 识别工具";

  public readonly detachableComponents: Record<
    string,
    DetachableComponentRegistration
  > = {
    "realtime-subtitle-ocr:monitor-box": {
      component: () => import("./components/MonitorBox.vue"),
      logicHook: () => {
        return {
          props: ref({
            isDetached: true,
          }),
          listeners: {},
        };
      },
    },
  };
}

export const toolConfig: ToolConfig = {
  id: "realtime-subtitle-ocr",
  name: "实时字幕OCR",
  icon: markRaw(Video),
  path: "/realtime-subtitle-ocr",
  component: () => import("./RealtimeSubtitleOcr.vue"),
  description: "高频、低开销的屏幕动态监控与流式字幕 OCR 识别工具",
  category: ["媒体工具"],
  version: "1.0.0",
};
```

#### 2. 配置默认顺序

在 `src/config/tools.ts` 的 `DEFAULT_TOOLS_ORDER` 中，将 `"/realtime-subtitle-ocr"` 插入到合适的位置（建议排在 `"/smart-ocr"` 后面）。

---

## 3. 验证与测试标准

### 3.1. 后端截图验证

- 运行 `check:backend` 确保 Rust 代码无 Clippy 错误。
- 在前端调用 `capture_screen_rect`，将返回的字节流转为 Object URL 渲染到 `<img>` 标签上，验证截图区域和画面是否完全正确。

### 3.2. 去重算法验证

- 播放一段静止画面或无字幕视频，验证 aHash 算法是否能正确拦截，控制台不应输出新的 OCR 请求。
- 播放带字幕视频，验证字幕出现时是否能精准触发 OCR。

### 3.3. 字幕合并验证

- 验证当字幕未发生变化时，时间轴上的结束时间戳是否在持续顺延，而不是疯狂刷屏追加重复文本。
- 验证当字幕切换时，是否能优雅地断句并开启新的一行。

# @aiohub/tool-icons

桌面端与移动端共用的工具图标。图标是 24 × 24 网格上的线性描边组件，调用参数与 `lucide-vue-next` 一致，可以和 Lucide 图标混排，也可以在现有调用处直接替换。

## 使用

```ts
import { markRaw } from "vue";
import { RecallIcon } from "@aiohub/tool-icons";

export const toolConfig: ToolConfig = {
  name: "思绪",
  path: "/recall",
  icon: markRaw(RecallIcon),
  // ...
};
```

```vue
<RecallIcon :size="16" class="recall-icon" />
<el-icon><RecallIcon /></el-icon>
```

| 参数                  | 默认值         | 说明                                   |
| :-------------------- | :------------- | :------------------------------------- |
| `size`                | `24`           | 宽高，数字或 CSS 长度                  |
| `color`               | `currentColor` | 描边颜色                               |
| `strokeWidth`         | `2`            | 描边宽度                               |
| `absoluteStrokeWidth` | `false`        | 按 `size` 换算描边，使线宽不随缩放变化 |

未传 `aria-*`、`role` 或 `title` 时，图标按装饰图形处理并带上 `aria-hidden="true"`。

## 一个概念一个图标

图标代表工具概念。同一概念出现在侧边栏、页面标题、Agent 编辑器页签、设置分区或模型能力中时，统一使用同一个组件；页面里的通用操作（刷新、删除、设置等）继续使用 Lucide。

| 组件                      | 工具                          | 其他使用位置                                                             |
| :------------------------ | :---------------------------- | :----------------------------------------------------------------------- |
| `LlmChatIcon`             | LLM 对话（桌面 / 移动）       |                                                                          |
| `LlmServiceIcon`          | LLM 服务（移动）              |                                                                          |
| `RecallIcon`              | 思绪                          | Agent 编辑器「思绪」页签与绑定项、聊天设置「思绪设置」、思绪集列表与统计 |
| `KnowledgeBaseIcon`       | 知识资料库                    | 资料库页头、Agent 编辑器「知识库」页签                                   |
| `WorldbookIcon`           | ST 世界书管理器               | 聊天设置「世界书」                                                       |
| `SkillManagerIcon`        | 技能管理                      |                                                                          |
| `EmbeddingIcon`           | Embedding 测试                | 模型能力「嵌入」（桌面 / 移动）                                          |
| `MediaGeneratorIcon`      | 媒体生成中心                  |                                                                          |
| `MediaInfoReaderIcon`     | AI 信息解析                   |                                                                          |
| `TranscriptionIcon`       | 多模态转写                    |                                                                          |
| `SmartOcrIcon`            | 智能 OCR                      |                                                                          |
| `ColorPickerIcon`         | 图片色彩分析                  |                                                                          |
| `DanmakuPlayerIcon`       | 弹幕播放器                    | 播放区占位、弹幕开关                                                     |
| `FfmpegToolsIcon`         | FFmpeg 工具                   |                                                                          |
| `AssetManagerIcon`        | 资产管理器（桌面 / 移动）     |                                                                          |
| `CodeFormatterIcon`       | 代码格式化                    |                                                                          |
| `ConfigConverterIcon`     | 配置转换器                    |                                                                          |
| `RegexApplierIcon`        | 正则批量替换                  |                                                                          |
| `TextDiffIcon`            | 文本差异对比                  |                                                                          |
| `DataFilterIcon`          | 数据筛选工具                  |                                                                          |
| `RichTextRendererIcon`    | 富文本渲染测试（桌面 / 移动） |                                                                          |
| `TokenCalculatorIcon`     | Token 计算器                  |                                                                          |
| `WebCanvasIcon`           | Web Canvas                    | 画布窗口标题栏、聊天输入区画布面板与状态胶囊                             |
| `WebDistilleryIcon`       | 网页蒸馏室                    | 预览区空状态                                                             |
| `LlmInspectorIcon`        | LLM 检查器                    |                                                                          |
| `ServiceMonitorIcon`      | 服务注册表浏览器              |                                                                          |
| `ApiTesterIcon`           | API 测试工具                  |                                                                          |
| `ContentDeduplicatorIcon` | 内容查重                      | 结果区空状态                                                             |
| `DirectoryTreeIcon`       | 目录结构浏览器                |                                                                          |
| `DirectoryJanitorIcon`    | 目录清洁工具                  |                                                                          |
| `SymlinkMoverIcon`        | 符号链接搬家工具              |                                                                          |

Lucide 已有贴切图标的工具直接使用 Lucide（如 Git 分析器的 `GitGraph`、壁纸探测器的 `Wallpaper`），不在本包重复绘制。

## 绘制规范

- 24 × 24 网格，四周保留 2px 安全边距，主体落在 2–22 之间。
- 2px 描边，圆头圆角（`stroke-linecap` / `stroke-linejoin` 为 `round`），`fill="none"`，颜色只用 `currentColor`。
- 只使用 `path`、`rect`、`circle`、`ellipse`、`line`、`polyline`、`polygon` 基本图形。
- 图标内不放文字；符号用线条画出（如 `</>`、`¶`、`ƒ`）。
- 在 14、18、24、48px 下都要可辨认，侧边栏 18px 时与相邻 Lucide 图标的视觉重量一致。
- 造型不与本包其他图标或项目中常用的 Lucide 图标重复。

## 新增图标

1. 在 `src/icons/` 下新建 `{tool-id}.ts`，用 `createToolIcon` 描述图形：

   ```ts
   import { createToolIcon } from "../createToolIcon";

   /** 工具名：图形含义 */
   export const MyToolIcon = createToolIcon("my-tool", [
     ["rect", { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
     ["path", { d: "M8 12h8" }],
   ]);
   ```

2. 在 `src/index.ts` 的对应分组中导出。
3. 运行 `bun run test:tool-icons` 与 `bun run check:tool-icons`。测试会检查图元类型、颜色是否只用 `currentColor`，以及图标之间是否重复。

# Chat 发送长图附件自动切分调研

日期：2026-11-01  
状态：已实施（2026-11-01）

## 1. 建议结论

增加一个默认关闭的「发送长图时自动切分」开关，复用 Smart OCR 的空白横带切图算法，对最终以图片形式提交给主模型的附件进行处理。

执行顺序：

```text
附件解析、转写策略判定
  → 对保留的图片制定切分方案
  → 按每张切片的尺寸估算 Token、执行上下文预算
  → 将保留下来的图片按方案裁成切片
  → 每张切片执行模型安全缩放
  → 每张切片执行 Agent 图片压缩
  → Base64 编码并按从上到下的顺序放入同一条消息
```

切图必须早于 `capabilities.maxImageDimension` 和 `parameters.imageCompression` 两层缩放。长图一旦整张缩小，文字像素就已经损失，后续再切图收益有限。

原始资产、聊天附件数量和消息节点保持原样；切片属于一次请求的派生内容。开启后，当前请求中保留为图片的历史附件也使用相同策略，重新生成、重试和完整上下文预览沿用该规则。

第一版建议采用现有的空白横带切分语义：竖向长图达到比例阈值，并且存在合适空白时自动切分；没有合适切点时继续发送整图。连续照片、无间隙拼图等场景需要额外的定高切分策略，可单独扩展。

## 2. 当前实现核对

### 2.1 主模型图片发送

入口为 [`asset-resolver.ts`](../../core/context-processors/asset-resolver.ts) 的 `processImageAsset()`：

1. 读取图片尺寸并检查图片有效性。
2. 按模型 `capabilities.maxImageDimension` 等比缩小。
3. 按 Agent `parameters.imageCompression` 缩放及转码。
4. 返回一个 `imageBase64` 内容项。

函数返回值已经是 `LlmMessageContent[]`，调用方使用 `newContentParts.push(...parts)`，因此一张原图展开成多个图片内容项具备现成的数据通道。

压缩配置及语义见 [`image-compression.md`](../architecture/image-compression.md)。

### 2.2 可复用的 OCR 切图能力

- [`useImageSlicer.ts`](../../../smart-ocr/composables/useImageSlicer.ts)：按行计算灰度方差，用 Otsu 阈值识别空白横带，生成切点，再裁出图片块。
- [`SmartOcrRegistry.sliceImage()`](../../../smart-ocr/smart-ocr.registry.ts)：加载 Smart OCR 配置，合并调用方覆盖参数，调用切图模块。
- [`SlicerConfig`](../../../smart-ocr/types.ts)：包含比例阈值、空白灵敏度、最小空白高度、最小切片高度和切点偏移。

当前 Smart OCR 默认值：

| 参数                        | 默认值            |
| --------------------------- | ----------------- |
| 竖向长宽比 `height / width` | 超过 3 才尝试切分 |
| 空白灵敏度系数              | 0.3               |
| 最小空白横带高度            | 20px              |
| 最小切片高度                | 680px             |
| 空白区域内切点偏移          | 0.2               |

这里的「智能切图」仅做本地像素分析，调用切图函数本身无需启动文字识别引擎。

需要注意：

- 当前触发判断仅覆盖竖向长图。
- `minCutHeight` 约束最小切片高度，尾部过小会合并回上一块。
- 现有算法没有最大切片高度约束，也没有无空白时的定高兜底。
- `sliceImage()` 本体未检查 `config.enabled`，开关应由调用方显式执行；转写模块目前通过极大比例阈值绕过切图。
- 当前返回的 `ImageBlock` 同时持有 Canvas 和 Data URL；低于比例阈值或找不到切点时，也会创建整图 Canvas 并编码。直接用于每轮聊天会产生可避免的处理开销。

### 2.3 Chat 已有的相近能力

Chat 设置中的 `transcription.enableImageSlicer` 已经接到 [`useTranscriptionManager.ts`](../../composables/features/useTranscriptionManager.ts)，最终由 [`image.engine.ts`](../../../transcription/engines/image.engine.ts) 调用 OCR 切图。

它服务于图片转写任务。主模型直接接收图片时，当前 `asset-resolver` 路径没有使用这个配置。

建议为发送附件新增独立开关，保留转写现有设置。两处共享算法，分别控制各自处理的图片。

## 3. 配置与用户交互

建议放在 Chat「请求设置」下，与媒体附件相关选项相邻：

```ts
requestSettings: {
  // 其余现有字段保留
  longImageSlicing: {
    enabled: false,
    aspectRatioThreshold: 3,
    minCutHeight: 680,
  },
}
```

用户可见内容：

- **发送长图时自动切分**：默认关闭。
- 提示：`发送前沿图片空白区域切分长图，再分别应用图片压缩。可保留更多文字细节，也可能增加图片数量和 Token 用量。`
- 开启后展示「长宽比阈值」「最小切片高度」，高级算法参数沿用切图模块默认值。

建议从 Smart OCR 提取共享默认切图常量，Chat 使用独立、明确的参数快照，避免用户在 OCR 页面调参后改变聊天发送结果。通过 Registry 直接调用时会读取 OCR 当前配置，需要显式覆盖全部有效参数，或为共享切图核心提供无需加载配置的入口。

涉及文件：

- [`types/settings.ts`](../../types/settings.ts)
- [`config/defaultSettings.ts`](../../config/defaultSettings.ts)
- [`components/settings/settingsConfig.ts`](../../components/settings/settingsConfig.ts)
- [`composables/settings/useChatSettings.ts`](../../composables/settings/useChatSettings.ts)

当前 `requestSettings` 只进行一层合并。新增嵌套配置时补充 `longImageSlicing` 的默认值合并，兼容旧设置和后续字段扩展。

## 4. 推荐接入方式

### 4.1 共享「切分方案」，发送时才裁图

建议从 OCR 模块抽出可复用的切点规划能力，让现有 OCR 页面继续由原 composable 适配 `ImageBlock`。Chat 消费轻量结果：

```ts
interface ImageSlicePlan {
  width: number;
  height: number;
  regions: Array<{ startY: number; endY: number }>;
}
```

规划与裁图分离的收益：

- Token 计算只需要每段的宽高，无需先生成全部切片 Base64。
- 被上下文预算裁掉的历史图片可以省去切片编码。
- 发送和预算复用同一组切点，避免两次分析得到不同图片数量。
- 普通图片和无有效切点图片沿用原始缓冲区，省去整图重新编码。

Chat 的适配 helper 建议放在 `core/context-utils/`，负责按需读取附件、调用共享算法、缓存方案，以及在发送阶段按区域输出二进制切片。

第一版限制为最终 `_attachments` 中的图片引用。用户上传、粘贴、截图及已被解析成图片的附件可沿该通道处理；直接写入 `msg.content` 的结构化图片需要另外处理，实施时保持范围清晰。

### 4.2 预算与物化两个入口复用 helper

推荐在现有入口调用共享 helper：

1. [`token-limiter.ts`](../../core/context-processors/token-limiter.ts) 进行媒体 Token 计算前，读取切分方案，构造仅供计算使用的切片尺寸列表。
2. [`asset-resolver.ts`](../../core/context-processors/asset-resolver.ts) 的图片处理入口取得同一方案，按顺序裁图，每段独立进入现有缩放与压缩逻辑。

当上下文预算关闭，或 Token 处理器被用户关闭时，发送入口仍可自行准备方案。原始 `_attachments` 可继续保留，帮助附件指向、来源追踪和原图展示。

初期无需增加一个可拖动的独立管道处理器。当前管道会保存处理器的开关及顺序，`contextPipelineStore` 加载旧配置时还会重写优先级、将新增处理器追加到末尾。仅注册一个名义优先级为 550 的处理器，无法保证已有用户自动获得正确顺序和启用状态。

按现有默认顺序，转写发生在 250，注入组装在 400，Token 限制在 600，资产物化在 10000。预算入口与发送入口共用方案可以覆盖后加入的图片，并减少额外的管道迁移工作。任意自定义管道顺序仍需遵循附件解析、预算、物化的既有依赖。

### 4.3 切片数量与顺序

- 一张原图对应一组相邻图片内容项，按 `startY` 从小到大提交。
- 组与组保持原附件顺序，同一条用户消息承载整组切片。
- 上下文分析中的图片 Token 按原附件汇总；最终请求内容保留切片顺序。消息列表继续展示原图。
- 发送多个图片内容项时，先检查目标渠道已有的图片数量及请求体限制。超限时给出可操作提示，保留全部内容，避免静默舍弃后半段。
- 对选定切分方案的所有切片采用整组成功策略。处理失败时丢弃该组临时结果，回退到整张原图的现有处理路径，防止部分切片缺失或原图重复提交。若预算已按切片估算，回退后更新本次统计。

## 5. Token 统计与性能

### 5.1 需要同步的统计位置

[`token-calculator.registry.ts`](../../../token-calculator/token-calculator.registry.ts) 当前按每个附件的 `metadata.width/height` 计算图片 Token，再应用有效最大边限制。

因此一张长图展开为多张图片后，要把每段的原始宽高交给既有计算器，并对每段应用 `resolveEffectiveImageMaxDimension()`；费用由目标模型现有的 `visionTokenCost` 规则计算。

需要同步的调用面：

- `token-limiter.ts`：发送时上下文预算。
- [`useChatInputTokenPreview.ts`](../../composables/input/useChatInputTokenPreview.ts)：输入框预估及设置变更监听。
- [`chatTokenUtils.ts`](../../utils/chatTokenUtils.ts)：节点 Token 重算。
- [`preview-builder.ts`](../../core/context-utils/preview-builder.ts) 与 [`useChatExecutor.ts`](../../composables/chat/useChatExecutor.ts)：上下文预览及统计。

只修改 `asset-resolver` 会导致前面的预算仍按整图缩小后的尺寸计数，切片请求的 Token 可能被低估。

### 5.2 被动统计保持轻量

当前 `previewPurpose === "statistics"` 会延后二进制读取，仅按元数据估算；应延续这个性能边界。

建议：

- 发送、完整上下文分析或显式准备附件时，按需产生准确切分方案。
- 被动统计优先使用有效缓存；未缓存的长图先按原图估算并标记为估算值，发送前预算使用实际切分方案重新计算。
- 输入框监听开关及参数变化；方案准备完成后更新估算结果。
- 普通图片有可靠尺寸元数据时，在读取二进制前快速跳过。
- 方案缓存保存切点和尺寸；原始缓冲区或切片缓存设置字节预算，避免长期保留 Canvas 与 Data URL。
- 缓存按附件来源、内容修订信息、有效参数区分，并合并相同图片的并发准备。外部可变文件缺少可靠修订信息时采用请求内缓存。
- 切分方案与 Agent 压缩配置解耦；压缩参数变化重新计算每段缩放尺寸即可。

当前 OCR 分析在主线程遍历原图全部像素，并创建多张 Canvas。超长图接入时应减少重复解码、及时释放 Object URL；必要时用缩小后的分析图寻找候选切点，再映射回原图裁切。降采样会影响窄空白带的识别，需要与原图算法对照后再采用。

## 6. 现有算法的适用边界

现有方案适合有段间空白的网页截图、文档长截图和排版图片。

- 无有效空白时保留整图，模型安全缩放与 Agent 压缩继续执行。
- 一张长图中存在很长的连续内容区时，该区仍可能被缩小；最小切片高度无法解决最大尺寸问题。
- 切图会增加图片数量，部分计费规则下每张图片还会产生固定开销，应向用户说明 Token 可能上升。
- OCR 的空白判定基于行灰度方差，低纹理照片、渐变背景也可能被识别为空白候选；它没有文字或版面语义保证。
- 横向超宽图、动画图片、多页 PDF 转图需要各自明确策略。当前 PDF 转图分支直接返回图片内容项，绕过 `processImageAsset()`；第一版聚焦图片附件，后续可将 PDF 页面接入统一处理函数。

若后续目标升级为「所有长图均保证每片不超过指定高度」，再增加独立的最大切片高度、无空白定高切分及适量重叠策略。它会改变现有 OCR 切图契约，需要单独定义和验证。

## 7. 建议实施范围与验证

建议一轮完成：共享切点能力、Chat 请求开关、发送前逐片压缩、Token 预算及预览对齐、文档同步。

验证围绕实际公开行为：

1. 开关关闭时保持原发送行为；开启后，仅符合阈值且有有效切点的图片展开，切片连续覆盖原图且顺序稳定。
2. 每个切片先于模型安全缩放及 Agent 压缩产生；正常图、无有效切点和处理失败走明确回退路径。
3. Token 预算按每个切片缩放后的尺寸累计，和最终发送图片数量对应。
4. 被动统计无缓存时保持延后读取，缓存可用时复用同一方案；参数变化使相关估算更新。
5. 真实 Tauri 窗口走查上传长截图、发送、重试和重新生成，检查聊天原图及请求预览。

优先扩展现有 `asset-resolver.test.ts`、`token-limiter.test.ts` 及相关统计测试。共享算法用合成图验证覆盖范围和切点边界，避免围绕私有函数结构编写断言。前端实施完成后运行项目类型检查和 Vite 构建。

## 8. 实施记录（2026-11-01）

已完成：

- `smart-ocr/utils/imageSlicing.ts` 提供共享默认参数、纯行方差切点规划和原图条带分析；OCR composable 继续将规划结果适配为可编辑 `ImageBlock`。OCR 显式手动切图保留原行为，自动开关由各调用方控制。
- `llm-chat/core/context-utils/image-slicing.ts` 负责 Chat 参数、请求级缓存、资产库方案缓存、Token 尺寸展开与逐片物化。分析采用串行队列，条带 Canvas 仅保留至多 256 行像素，避免同时解码整段历史及持有整图像素副本。
- 请求设置增加独立开关及两个参数，默认关闭，并补齐旧设置的嵌套合并。
- 资产物化在模型安全缩放与 Agent 压缩之前切图，逐片提交已有图片处理函数。任一裁图或编码异常会整组回退原图，后续请求内统计改用整图方案。
- `getContextTokenCalculator()` 装饰既有文本计数 scope，预算、格式化、完整预览和最终计数共享切片尺寸展开；输入框、发送前节点统计及历史节点重算也复用同一 helper。
- 被动统计延后图片读取，有资产库缓存时复用准确方案；缓存准备完成后通过修订信号更新输入框估算。可变本地文件和内联图片的方案限定在请求内。
- 原始附件和消息持久化保持原样。

范围说明：当前模型能力结构只有最大图片尺寸，缺少统一的渠道图片数量或请求体上限字段。本次沿用渠道的既有错误处理，逐片保留全部内容。超限时用户可关闭切分或减少附件；渠道级上限预检查留待模型能力契约补齐。

验证记录：

- 6 个相关测试文件、40 项用例通过，覆盖共享切点覆盖范围、阈值与无空白回退、预算计入全部切片、缓存与可变来源隔离、整组失败回退、每片缩放顺序及原附件保留。
- 前端类型检查与 Vite 生产构建通过。
- 真实 Windows Tauri/WebView2 中，以本地生成的 `800×6000` 图片执行实际附件物化函数：开启后生成 6 张宽度为 800、高度分别为 980、1000、1000、1000、1000、1020 的图片；关闭时输出 `136×1024` 的整图。预算描述与实际切片尺寸逐一对应，原附件引用保持一致。该检查覆盖本地请求准备，外部模型请求沿用现有发送链路。
- 真实设置页确认默认关闭、开启后参数显示、设置自动保存与正常布局。

运行中间产物位于已忽略的 `.tmp/long-image-slicing/`，界面截图由 Dev Control 保存至隔离开发实例目录。


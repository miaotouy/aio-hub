# 用户反馈修复批次（2026-09-29 整理）

> 本批按问题程度排序：P0 功能阻塞/卡死 → P1 功能行为错误或核心操作受限 → P2 显示错误/能力缺失/体验缺陷 → P3 轻微问题与新需求。`#` 保留原反馈编号，便于对照追溯。

## 状态总览

| #   | 程度 | 问题                                            | 模块                 | 状态                                      |
| --- | ---- | ----------------------------------------------- | -------------------- | ----------------------------------------- |
| 3   | P0   | 图像生成卡入库状态（agnes）                     | media-generator      | ✅ 已完成                                 |
| 6   | P1   | Claude 模型元数据缺思考配置                     | model-metadata       | ✅ 已完成                                 |
| 11  | P1   | dir-search 未处理带引号路径导致目录识别失败     | tools/dir-search     | ✅ 已完成                                 |
| 4   | P1   | 获取模型窗口无法取消已添加、缺已添加/未添加筛选 | Settings/llm-service | ✅ 已完成                                 |
| 1   | P2   | 版本说明「当前版本」标记未识别真实版本          | Settings/关于页      | ✅ 已完成                                 |
| 5   | P2   | 请求重试缺错误码号段白名单                      | Settings/llm-service | ✅ 已完成                                 |
| 2   | P2   | 版本日志列表横向溢出且缺搜索                    | Settings/关于页      | ✅ 已完成                                 |
| 9   | P2   | 悬停上浮效果应改为描边颜色变化                  | 全局样式             | ✅ 已完成（范围收窄为 OCR；全局另立专项） |
| 7   | P3   | 模型元数据覆盖分析操作列缺「查看最终规则详情」  | model-metadata       | ✅ 已完成                                 |
| 10  | P3   | OCR 置信度布局占用右侧宽度                      | ocr                  | ✅ 已完成                                 |
| 8   | P3   | 新增 snazzymaps 静态地图工具（不着急）          | 新工具               | ⏳ 待处理                                 |
| 12  | P3   | 「找不到资源」占位样式不可自定义 / 未展示资源名 | 资源渲染 / 保存提示  | ✅ 已完成（富文本图片失败占位）           |

## 问题详情与定位

### 3. 图像生成卡入库状态（agnes）

- 反馈：agnes 图像生成卡显示「生成成功，正在入库资产...」，为入库阶段的状态展示（附截图）。
- 定位：`src/tools/media-generator/components/MediaTaskCard.vue`（状态文案与进度）。
- 方向：确认agnes渠道的入库流程是否会卡死，可能需要调查agnes ai的文档。
- 结果（2026-09-29）：agnes 走巨型 b64 返回，入库链路的 IPC await（`importAssetFromBytes` 等）无超时保护，promise 永不 settle 时任务永久卡在「正在入库资产」。已在 `useMediaGenerationManager.ts` 为整个入库阶段加 watchdog（下载预算 × 资产数 + 120s 兜底），超时落 error；并在 `handleResponseAssets` 回写前加终态守卫，防止残留流程覆盖已进入的终态。

### 6. Claude 模型元数据缺思考配置

- 反馈：claude 模型元数据中都没有思考（reasoning / thinking）相关配置。
- 定位：模型元数据系统，参考 `docs/Plan/model-metadata-system-optimization-plan.md`。
- 方向：为 Claude 系列补充思考能力元数据（thinking / reasoning 字段），使覆盖分析与执行路由能正确识别。
- 结果（2026-09-29）：根因是 `models-anthropic.ts` 的 `claudeAdaptiveThinkingCapabilities` 把自适应思考模型（Claude 4.7+/5.x）标为 `thinking: false / none`，导致当前主力 Claude 模型在覆盖分析和参数面板没有任何思考配置。已改为 `thinking: true / budget`（未开启时不带 thinking 字段，走 API 默认行为），同步补齐 `llm-presets/presets/anthropic.ts` 中 Claude 5 系列预设，并更新对应测试断言。

### 4. 获取模型窗口无法取消已添加

- 反馈：渠道模型列表的「获取模型」窗口，打开后之前已添加的模型无法在此处取消添加；也缺「已添加 / 未添加」筛选。可参考 newapi。
- 定位：`src/views/Settings/llm-service/` 下的 `ModelFetcherDialog.vue` 与 `useModelEditor.ts`。
- 方向：支持在窗口内取消勾选已添加模型（确认后同步移除）；增加「已添加 / 未添加 / 全部」筛选。
- 结果（2026-09-29）：已添加模型点击后切换为「待移除」标记，底部统计显示「添加 X 个，移除 Y 个」，确认时新增 `remove-models` 事件由父组件 `handleRemoveModels` 同步从 profile 移除；新增添加状态筛选下拉与全选/分组全选对移除标记的支持；补 2 组定向测试。

### 1. 版本说明「当前版本」标记未识别真实版本

- 现象：关于页版本显示 `0.7.0-alpha.6.build.55b1344a3`，但版本说明列表里高亮的「当前版本」与实际版本不一致（附 9-28 截图）。
- 定位：`src/flows/upgrade/`（`releaseNotesRegistry.ts` 的 `normalizeAppVersion`、`releaseNotesViewerStore.ts`、`components/UpgradeReleaseNotesStep.vue`）。
- 方向：版本说明列表的「当前版本」判断改为从运行时版本号解析（读取真实 build 版本，与 package.json / tauri.conf.json 对齐），而不是硬编码或默认回退值。
- 结果（2026-09-29）：根因是 `normalizeAppVersion` 未剥离运行时版本里的 `.build.<hash>` 构建元数据，导致 `0.7.0-alpha.6.build.*` 无法命中任何已注册说明，primaryVersion 回退到列表首项（最旧版本）。已让 `normalizeAppVersion` 剥离 `.build.*` / semver `+build` 元数据；`releaseNotesViewerStore.open` 在无精确命中时回退到「不高于当前版本的最新一条」，availableVersions 也统一取注册表规范化后的版本；补 3 组测试。

### 5. 请求重试缺错误码号段白名单

- 反馈：请求重试配置缺少错误码号段白名单校验；可参考 newapi。
- 现象：截图「重试预算」—「自动重试状态码」当前为纯文本 `100-199,300-399,401-407,409-499,500-503,505-523,525-599`，说明为「2xx、504、524 始终排除」。
- 定位：`src/tools/llm-chat/`（请求设置与 `useSingleNodeExecutor` 重试逻辑）。
- 方向：提供号段白名单编辑（区间解析、非法输入校验、冲突 / 重叠提示），与排除规则（2xx / 504 / 524）联动。
- 结果（2026-09-29）：新增 `utils/retryStatusCodes.ts`（区间解析、非法输入/重叠/排除校验、`isRetryableStatusCode`）与设置项「自动重试状态码」（`RetryStatusCodesEditor.vue`，含号段 chip 预览、错误/重叠/排除提示、恢复默认）；`requestSettings` 增加 `retryStatusCodes`（默认即截图号段，旧配置自动兜底）；`useSingleNodeExecutor` 对带状态码的错误按白名单判定是否重试，2xx/504/524 始终排除，无状态码的超时/网络错误保持原行为；补 9 组解析与判定测试。

### 2. 版本日志列表横向溢出且缺搜索

- 反馈：版本说明 / 更新日志界面左侧列表存在横向滚动条；考虑添加搜索功能（附截图）。
- 定位：`src/flows/upgrade/components/UpgradeReleaseNotesStep.vue`。
- 方向：修复左侧列表横向溢出（文本换行 / 截断 + tooltip）；在版本列表区增加搜索框，支持按版本号 / 关键词过滤。
- 结果（2026-09-29）：左侧栏 `overflow` 改为仅纵向、条目 `width/min-width/box-sizing` 收敛并对标题加 tooltip；新增搜索框（按版本号 / 标题 / 摘要过滤）与空结果提示；补 1 组组件测试。

### 9. 悬停上浮效果应改为描边颜色变化

- 反馈：很多地方有鼠标悬停「上浮」效果，会导致元素位移，不应使用；尽量改用描边颜色变化。
- 现象：OCR 模块的图片卡片是重灾区，鼠标移动时卡片动来动去（附截图）。
- 方向：全局排查 hover 的 `translateY` / `transform` 位移样式，替换为边框 / 轮廓颜色变化；OCR 图片卡片优先处理。
- 结果（2026-09-29）：本批次**仅处理点名的 OCR 图片卡片**（`smart-ocr/PreviewPanel.vue` 的 `.image-item:hover` 与 `.add-image-btn:hover` 移除 `translateY`，改用描边颜色变化）。全仓库 hover 位移排查范围过大，已回退其余改动，另立专项任务处理；排查确认全局仍有约 60 处 hover 上浮（多为卡片/按钮），可在此后专项统一改造。

### 7. 模型元数据覆盖分析操作列缺「查看最终规则详情」

- 反馈：覆盖分析表格「操作」列少一个「查看最终规则详情」入口。
- 现象：截图表格含渠道信息 / 模型信息 / 规则合并链 / 最终图标 / 操作，操作列仅有「新建规则」。
- 方向：在操作列增加「查看最终规则详情」，展示该模型命中的完整规则链（provider → modelContains → modelRegex）与最终解析结果。
- 结果（2026-09-29）：操作列新增「最终规则详情」入口，打开详情对话框展示渠道/模型信息、命中规则合并链（匹配类型、matchValue、优先级、独占标记、生效/被覆盖字段、规则 properties）与最终解析结果 JSON；未匹配时给出空态提示。

### 10. OCR 置信度布局占用右侧宽度

- 反馈：OCR 结果的置信度标注占满右侧宽度，布局不合理（附截图 `当我相 / 置信度: 91.8%`）。
- 定位：`src/tools/smart-ocr/components/ResultPanel.vue` 文本结果渲染。
- 方向：置信度改为紧凑展示（右下角徽标 / 固定宽度），不参与整行宽度分配。
- 结果（2026-09-29）：置信度从整行右对齐的 `el-text` 改为绝对定位在结果右下角的 `el-tag` 徽标（`pointer-events: none`），不参与文档流；文本区增加底部内边距避免遮挡。

### 8. 新增 snazzymaps 静态地图工具（不着急）

- 反馈（需求）：
  - 考虑做一个 snazzymaps 工具；
  - 如果可能，提供预设样式或 snazzymaps 上的样式探索；
  - 具有比 snazzymaps 自带渲染更大的渲染尺寸支持；
  - 可自定义选好地图区域后，选择地图的缩放比例和渲染图分辨率倍率。
  - 参考：https://github.com/mg-chao/snow-apps
- 方向：新建独立工具模块，封装「地图区域选择 + 样式选择 + 缩放 / 分辨率倍率导出」；优先支持大尺寸输出。

### 11. dir-search 未处理带引号路径导致目录识别失败

- 反馈：日志（09-29 20:33:37）`[tools/dir-search/useDirSearch] 目录不存在: "\\vita-nas-01\vitanas-0\公共素材\音效"`。
- 现象：资源管理器「复制路径」得到的是带引号路径（`"..."`），与点击地址栏复制的不一致；工具未剥离引号，成对引号导致路径解析失败（UNC 路径需同时正确识别）。
- 定位：`src/tools/dir-search/`（`useDirSearch`）。
- 方向：对输入路径统一规范化（`trim` + 剥离首尾成对引号 / 反引号 / 智能引号）后再做存在性校验；UNC 路径正确识别；找不到时给出友好提示而非直接抛错。
- 结果（2026-09-29）：前端 `useDirSearch` 新增 `normalizeDirectoryInput`（trim + 逐层剥离成对直引号/单引号/反引号/智能引号）并在请求前应用；Rust `dir_search.rs` 增加 `strip_paired_quotes` 防御性剥离，日志统一输出规范化后的根路径；补 3 组引号/UNC/普通路径单测。

### 12. 「找不到资源」占位样式不可自定义 / 未展示资源名

- 反馈（需求，附截图）：这种「找不到资源」的紫黑格子占位样式，希望支持自定义样式；或渲染中包含尝试请求的资源名字。
- 现象：截图显示资源状态提示找不到资源时紫黑占位样式固定，且不显示原始请求的资源名，排查困难。
- 定位：`src/tools/rich-text-renderer/components/nodes/ImageNode.vue`（图片节点加载失败占位）与 `utils/resourceLabel.ts`。
- 方向：将「找不到资源」占位样式改为可配置（主题 / 插槽），并在占位中展示尝试请求的资源名。
- 结果（2026-09-29）：图片节点失败占位改为 CSS 变量可自定义（`--rich-text-image-placeholder-bg` / `-border` / `-color` / `-resource-color`，均带主题默认回退），并新增 `resolveResourceLabel` 在占位中展示 alt 或从 src 提取的资源名；补 5 组单测。说明：本项按「富文本图片加载失败占位」解读落地，若反馈另指其他资源占位可再补充。

## 提交计划

每个问题独立提交，修复一批后更新本表状态。


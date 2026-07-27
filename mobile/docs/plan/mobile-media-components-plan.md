# 移动端媒体组件设计方案

> 状态：Phase 1 资产管理器原型、组件测试与 Android AVD 资产/附件/音频受控预览回归已完成；全面交互设备验收和消费者接入仍待进行
> 最近核对：2026-07-27
> 范围：图片、视频、音频的内联预览、沉浸式预览和播放；不把桌面组件缩小后直接移植
> 关联文档：[`mobile-asset-manager-design.md`](./mobile-asset-manager-design.md)、[`mobile-development-checklist.md`](./mobile-development-checklist.md)、[`asset-manager/ARCHITECTURE.md`](../../src/tools/asset-manager/ARCHITECTURE.md)

## 1. 先说结论

移动端媒体组件不是一套与 PC 同名的组件库，而是一组围绕“看一眼、打开、返回、继续操作”设计的媒体入口：

1. 资产管理器负责资产查询、受控预览来源和来源回收；媒体组件不读取路径、不生成长期 URL，也不自己实现资产存储。
2. 图片采用“内联缩略图 + 全屏查看器”；视频采用“内联原生播放 + 可选沉浸式播放器”；音频采用“内联紧凑播放器 + 展开式播放面板”。三者共享容器、加载错误和返回语义，但不强行共享一套控制条。
3. 先在资产管理器中落地真实原型，再接入聊天附件和富文本媒体节点。组件 API 以两个真实消费者验证过的字段为准，单一场景的特殊交互留在工具内。
4. 首版支持系统返回、窄屏/平板、安全区、明暗主题、触控和鼠标键盘；不承诺锁屏后台播放、系统媒体通知、强制横屏或系统级亮度手势，这些能力需要原生插件和设备证据后另立方案。

## 2. 设计依据

### 2.1 外部参考及其落地结论

以下参考用于确定交互原则，不是照抄某个平台的视觉实现。链接保留在方案中，后续实现或评审可以逐条复核：

| 参考                                                                                                                                                                     | 对本方案的影响                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| [Android edge-to-edge](https://developer.android.com/develop/ui/views/layout/edge-to-edge)                                                                               | 全屏媒体层必须按安全区布置关闭、标题和底部控制，不能用固定 `100vh` 假定可用高度。                                |
| [Android 手势输入](https://developer.android.com/develop/ui/views/touch-and-input/gestures)                                                                              | 缩放、平移和返回手势需要明确手势优先级；只在组件已经接管手势的区域设置 `touch-action`，不阻断宿主滚动。          |
| [Material accessible design](https://m3.material.io/foundations/accessible-design)                                                                                       | 图标按钮保留可访问名称和足够触控区域；不能用悬停或仅靠颜色表达播放、静音和错误状态。                             |
| [Apple HIG: Playing video](https://developer.apple.com/design/human-interface-guidelines/playing-video)                                                                  | 视频控制应在需要时出现，播放主体优先；全屏进入和退出要有可预测的返回路径，不能让用户被锁在播放器中。             |
| [Apple HIG: Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)                                                                            | 常用手势只承担一个明确动作；双击缩放、拖拽平移和下拉关闭不能在同一状态互相抢夺。                                 |
| [MDN `touch-action`](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action) 与 [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) | 图片手势使用 Pointer Events，按缩放状态切换 `touch-action`；不依赖平台专有手势库。                               |
| [MDN Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API)                                                                                    | 视频全屏先走 Web Fullscreen API；不支持或被 WebView 拒绝时回退到应用内固定层，不把“全屏成功”当成必然的平台能力。 |

外部参考形成的核心判断是：手机媒体查看的第一目标是内容和返回路径，复杂控制应按需显现；手势、全屏和方向不是组件名字上的功能，而是需要在真实设备上验证的行为。

### 2.2 仓库现有能力盘点

#### 资产管理器能提供什么

`mobile/src/tools/asset-manager/services/assetService.ts` 已提供以下领域能力：

- `getAssetPreviewSource(assetId)` 返回带过期时间、MIME、大小、Range 上限的短期 descriptor；
- `revokeAssetPreviewSource(previewId)` 主动撤销 descriptor；
- Android 受控协议支持 Range，原件不会由 WebView 一次性无界读取；
- 资产导入、导出、分享、相机、缺失/回收状态和 storage summary 已有领域命令；
- 消费者持久化 `assetId + snapshot`，不持久化系统 URI、绝对路径或预览 URL。

因此，媒体组件只接收 `assetId` 或已经获取的短期 descriptor。组件卸载、关闭、换资源、加载竞态和错误路径都必须触发撤销；不能为了复用 `<img src>` 而把 descriptor 写进消息或 Pinia 持久状态。

#### 当前移动端场景

- `AssetDetailSheet.vue` 已接入 `MediaPreviewHost`，由 `useManagedMediaPreview` 统一申请和撤销 descriptor；详情页不再持有预览 URL。
- `llm-chat/components/MessageContent.vue` 已有图片 overlay，并处理资源切换、过期和撤销竞态；它目前没有缩放、平移、视频和音频统一契约。
- 资产管理器已有 `AssetDetailSheet` 单测和 Android WebView 预览验证；这使它适合作为第一块真实原型和回归入口。

#### PC 组件可借鉴和不能借鉴的部分

| PC 能力                                                            | 移动端处理                                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `ImageViewer.vue` / `useImageViewer`：多图、缩放、旋转、全屏、键盘 | 保留多图索引、缩放和旋转的需求语义；键盘改为系统返回/鼠标滚轮/快捷键兼容，布局和工具栏重做。 |
| `VideoPlayer.vue`：自定义进度、倍速、音量、全屏、截图、键盘快进    | 首版保留播放、进度、静音/音量、倍速和全屏；截图、亮度手势、复杂菜单留在后续需求。            |
| `AudioPlayer.vue`：进度、音量、倍速、波形/封面和本地音量记忆       | 移动端保留播放、进度、倍速和封面；不在首版引入桌面悬停菜单、全局音量记忆或后台播放承诺。     |
| `BaseDialog` / 桌面固定尺寸                                        | 不复用。移动端容器采用安全区全屏层和底部播放 Sheet。                                         |

## 3. 用户场景和统一入口

| 场景                                 | 初始形态                            | 用户动作                                             | 退出方式                                                     |
| ------------------------------------ | ----------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| 资产列表缩略图、聊天附件、富文本媒体 | 内联预览，不自动播放                | 点按打开对应沉浸式预览；视频只在用户明确点播放后开始 | 系统返回、关闭按钮、下拉关闭（图片）                         |
| 资产详情                             | 详情 Sheet 中显示媒体摘要和预览入口 | 点按“打开预览”进入全屏图片/视频；音频在 Sheet 内展开 | 返回回到详情 Sheet，不丢失详情操作上下文                     |
| 连续图片附件                         | 全屏查看器                          | 左右滑动切换；双击/双指缩放；缩放后平移              | 返回回到来源消息，不回到第一张                               |
| 音频附件                             | 内联紧凑播放器                      | 播放、拖动、倍速；需要看更多信息时展开播放 Sheet     | 返回关闭播放 Sheet，播放是否继续由页面策略决定，首版默认暂停 |

统一入口由 `MediaPreviewHost` 承担容器和生命周期，但图片、视频、音频的主体和控制条分开实现。`MediaPreviewHost` 不承担资产查询、格式探测或播放器业务逻辑。

## 4. 组件边界和 API

建议的最小目录（名称可在实现阶段按现有命名调整）：

```text
mobile/src/components/media/
  MediaPreviewHost.vue       # 安全区、返回、关闭、加载/错误层
  MediaImageViewer.vue       # 图片缩放、平移、旋转、图集切换
  MediaVideoPlayer.vue       # playsinline、控制显隐、全屏回退
  MediaAudioPlayer.vue       # 紧凑/展开两种布局
  useManagedMediaPreview.ts  # descriptor 获取、竞态和撤销
```

公共输入只保留稳定字段：

```ts
type MediaKind = "image" | "video" | "audio";

interface MediaItem {
  assetId: string;
  kind: MediaKind;
  displayName: string;
  mimeType: string;
  posterAssetId?: string;
}

interface MediaPreviewHostProps {
  modelValue: boolean;
  item: MediaItem;
  items?: MediaItem[];
  initialIndex?: number;
  mode?: "inline" | "sheet" | "fullscreen";
}

interface MediaPreviewHostEmits {
  "update:modelValue": [visible: boolean];
  "index-change": [index: number];
  "play-state-change": [playing: boolean];
  error: [assetId: string, code: string];
}
```

`useManagedMediaPreview` 的职责是：按 `assetId` 获取 descriptor；以递增请求序号丢弃迟到结果；换资源和卸载时撤销旧 descriptor；把过期、missing、reclaimed、Range 不支持映射为组件可显示的错误状态。它不负责 toast，页面反馈继续使用 `mobile/src/utils/feedback.ts`。

## 5. 具体交互方案

### 5.1 图片

- 内联只负责缩略图和加载状态，禁止自动放大或跳转；图片失败显示重试和“原件不可用”状态。
- 全屏打开后首屏以 `contain` 显示；单击切换顶部关闭/标题和底部索引的显隐。
- 双击以触点为中心在 1x 与约 2x 之间切换；双指缩放范围先限制在 1x 至 4x，超出边界回弹。
- 缩放大于 1x 时允许平移；平移到边界后才把垂直拖动交给下拉关闭。缩放为 1x 时，向下拖动超过容器高度的约 20% 且速度明确才关闭，否则回弹。
- 有 `items` 时左右滑动切换图片；切换前撤销旧 descriptor，切换失败不改变当前索引。
- 旋转作为显式按钮提供 90 度步进，旋转只影响当前查看状态，不写回资产；旋转后重新计算可视区域和安全区。
- 系统返回优先关闭图片层；若图片层未打开，再由路由/Sheet 处理返回。

### 5.2 视频

- 内联使用原生 `<video controls playsinline preload="metadata">`，不自制一套永远可见的控制条；点击缩略图只打开预览，不自动播放。
- 沉浸式播放器单击主体显隐控制；控制层显示关闭、播放/暂停、进度、当前时间/总时长、静音/音量和倍速。控制层自动隐藏，但暂停或错误时保持可见。
- 全屏按钮先调用 Fullscreen API；失败时切换应用内 fixed 层并记录 fallback。首版不锁定横屏，方向跟随系统；退出时恢复原来的滚动和焦点。
- 双击主体不绑定快进，避免和原生控件、辅助技术冲突；后续若确有需求，用左右区域双击并在设备上验证后再加。
- 系统返回顺序为：退出 Fullscreen API → 关闭应用内播放器 → 返回详情/消息来源。播放中的资源退出时默认暂停并释放 descriptor。

### 5.3 音频

- 内联播放器为固定高度的紧凑行：封面/类型图标、名称、播放/暂停、进度和时长；不自动播放。
- 展开式播放 Sheet 提供拖动进度、前后 10 秒、倍速（0.5x/1x/1.5x/2x）、静音和关闭；按钮均有可访问名称，触控区域不小于项目规范。
- 首版不实现锁屏控制、后台继续播放、系统媒体通知和音量手势。离开页面默认暂停，避免 WebView 生命周期和平台音频会话产生隐式行为。
- 音频错误区分资源不可用、格式不支持和网络/Range 失败；重试沿用同一 `assetId` 重新申请 descriptor。

## 6. 状态、生命周期和错误

每个媒体实例按以下状态转换实现，状态文字和测试 ID 使用稳定枚举，不从 DOM 文案推断：

```text
closed
  -> opening -> loading -> ready
                    |        |
                    v        v
                  error <- revoked/expired
```

- `opening` 只负责建立容器和保存来源焦点；`loading` 申请短期 descriptor 并等待媒体元数据；`ready` 才允许播放、缩放和切换。
- 资源 ID、请求序号或容器关闭任一变化都会使旧请求失效。迟到 descriptor 必须立即撤销，不能只丢弃引用。
- `beforeUnmount`、路由离开、系统返回、切换图集项和媒体 `error` 都进入同一清理函数，清理函数必须幂等。
- `reclaimed`/`missing` 显示原件不可用，不尝试从 snapshot 或旧 URL 猜路径；`expired` 自动重试一次，仍失败再显示错误。
- 全屏层打开时锁定背景滚动、保留来源焦点；关闭后恢复焦点。无障碍名称至少包含关闭、播放/暂停、静音、倍速、旋转和当前资源名称。

## 7. 实现顺序

### Phase 1：在资产管理器中完成组件

先实现 `MediaPreviewHost`、图片查看器、视频播放器、音频播放器和 `useManagedMediaPreview`，并在 `asset-manager` 页面用已有 `AssetDetailSheet`、真实资产和受控预览命令接线。第一版必须是可以实际打开、播放、返回和释放资源的完整组件，不以静态稿或孤立 demo 代替。

### Phase 2：交互实测、可用性判断和迭代

组件做出来后，先在 Android AVD 做手势冲突、全屏 fallback、系统返回、安全区、横竖屏、快速切换和错误恢复的确定性测试，再在 Android 真机完成单手操作与连续使用测试。测试不仅记录“能不能触发”，还要记录“是否容易误触、控制是否可达、返回是否符合预期、播放和缩放是否卡顿”。不合格的交互直接回到组件修改，不先铺开更多消费者。

本阶段至少用以下任务判断是否好用：

1. 单手从资产详情打开图片，连续缩放、平移、恢复并关闭，过程中不误触详情或系统返回。
2. 播放长视频，拖到中后段，旋转设备、进入/退出全屏并返回详情，播放位置和控制状态符合预期。
3. 从音频内联播放器展开、调速、拖动并返回，操作不需要精确点按细小控件。
4. 在连续图片和不同媒体之间快速切换，旧画面、旧音频和过期 descriptor 不继续工作。
5. 模拟 missing、reclaimed、解码失败和 Range 失败，用户能看懂状态并能重试或退出。

### Phase 3：现有消费者接入

1. [x] 用 `MediaPreviewHost`（内部使用 `useManagedMediaPreview`）替换 `MessageContent` 现有的图片 descriptor 获取、撤销和竞态处理，删除重复生命周期代码；聊天的图片、视频和音频附件均以 `assetId +` 轻量快照构造 `MediaItem`。
2. 保持资产详情在 Phase 1 已接通的三种媒体入口；详情操作（固定、隐藏、清理、导出、分享）不迁入媒体组件。
3. [x] 聊天附件已接入图片、视频和音频预览，保持 `ManagedAssetRef` 和 reclaimed/missing 降级语义；纯文本消息和附件状态逻辑不改写。
4. [x] RichTextRenderer 已只接入稳定的 `MediaItem` 和 `MediaPreviewHost` 打开语义：当前消息的 `![说明](asset://<assetId>)` 只能解析为同一消息附件，避免模型文本探测任意本地资产；外部图片不伪装为受管资源，保留原有安全回退。

### Phase 4：平台门禁和架构收口

消费者接入后重复 Android AVD 回归，并在 Android 真机验证聊天长列表、详情 Sheet 和富文本页面中的滚动/手势冲突及应用重启恢复。iOS 只有在编译和设备条件具备后补验，不提前声称方向锁定、后台音频或 scheme/Range 行为跨平台成立。稳定契约和已验证差异写入移动端架构文档，本文件只保留尚未完成的实现和设备门禁。

## 8. 验收标准

### 功能和生命周期

- 图片单击显隐控制、双击/双指缩放、缩放后平移、图集切换和下拉关闭互不抢手势。
- 视频 `playsinline` 默认成立；全屏成功和 fallback 两条路径都能通过系统返回退出；控制层不会遮挡进度和关闭入口。
- 音频紧凑/展开两种形态都能播放、暂停、拖动和调整倍速；离开页面不会遗留播放或 descriptor。
- 资源快速切换、过期、主动撤销、missing/reclaimed、媒体解码失败和组件卸载都不会留下可用旧 URL。

### 设备和可用性

- 手机竖屏、横屏、分屏/平板宽度、动态字体、明暗主题和安全区下无标题、控制条或媒体重叠。
- Android 真机完成图片/视频/音频各一条主流程，并记录首帧、返回、旋转、长视频拖动和重启后的结果；浏览器测试不能替代这条门禁。
- 键盘/鼠标至少支持关闭、播放/暂停、进度拖动和全屏退出，触控设备不依赖悬停才能发现关键操作。
- 单测覆盖 descriptor 竞态、撤销幂等、错误映射和 host 的返回优先级；组件交互测试覆盖图片缩放边界、视频 fallback 和音频离开页面暂停。

完成标准是资产管理器、聊天和富文本三个真实入口都能复用同一套资产生命周期和容器返回语义，同时保留各媒体类型适合手机的控制方式；不是目录里出现了几个与 PC 同名的 `.vue` 文件。

## 9. 执行状态与待办

- [x] 按本方案在资产管理器完成第一版真实原型。
- [x] 为 `useManagedMediaPreview`、`MediaPreviewHost` 和三个媒体子组件补单测及组件测试。
- [x] RichTextRenderer 已接入稳定的 `MediaItem` 与打开事件：受管 Markdown 资产仅匹配当前消息附件，descriptor、错误与资源释放继续由 `MediaPreviewHost` 负责；外部图片不改写为本地资产。
- [ ] Android AVD 已于 2026-07-26 通过资产图片预览、聊天附件发送/重启恢复/图片预览及音频受控预览/沉浸层控制；2026-07-27 又以 x86_64 debug APK 通过 `media` preset（`audio-media`、`video-media`）与 `rich-text-media` preset（消息自有 `asset://` Markdown 图片、受管 descriptor、inline ready、沉浸层打开/关闭和 WebView 双击 2x 缩放）。`audio-media` 额外验证用户触发的 WebView 原生 WAV 播放、`currentTime` 推进、暂停稳定，以及 keep-alive 路由停用时暂停/撤销预览、激活后重新申请；`video-media` 通过 DocumentsUI 导入 H.264 MP4、保留 `video/mp4` MIME、获取受管 URL、WebView `<video>` 解码/播放进度/暂停，且强制 Fullscreen API 拒绝后会进入应用内沉浸层，并在 WebView history 返回时保留播放位置和状态恢复内联播放器，最后于关闭详情后确认 URL 回收。AVD 运行时无可听输出；这些回归仍不替代真实手势、原生全屏/系统返回、设备音频输出、方向、安全区、快速切换、Android 真机和 iOS 报告。
- [ ] 根据设备实测再决定是否增加方向锁定、后台音频、截图或更多原生能力；没有证据时不扩展公共 API。

Phase 1 的实现位于 `mobile/src/components/media/`。自动化已覆盖 descriptor 迟到响应撤销、重复清理、过期重试、错误映射、host 先退沉浸层再关闭入口、图片缩放边界、视频 Fullscreen API fallback 与位置/播放状态交接、音频卸载暂停，以及 Android WebView 上用户触发的 WAV 播放进度与暂停稳定、keep-alive 路由停用时的暂停/descriptor 撤销和激活后重取。2026-07-27 的 Android AVD `video-media` 又覆盖 H.264 MP4 的 DocumentsUI 导入、`video/mp4` 受管预览 URL、真实 `<video>` 解码/播放进度/暂停、强制 Fullscreen API 拒绝后的应用内沉浸层及 WebView history 返回后的内联续播与详情关闭后的 URL 回收。图片下拉关闭、双指手势可用性、原生全屏/系统返回、方向切换、长视频拖动、设备音频输出和 Android 真机/iOS 仍属于设备门禁，不能由 jsdom、浏览器构建或 AVD 单条回归替代。

### 9.1 Android AVD 回归记录（2026-07-26）

- `Medium_Phone_API_36`（`emulator-5554`，API 36，x86_64）安装单 ABI debug APK 后，`asset` preset 已覆盖资产详情打开图片、短期预览 URL 加载、关闭后的 URL 撤销；此前因通用图片查看器缺少稳定图片元素标识而失败，现由调用方可选 `imageTestId` 契约恢复。
- 同一 APK 的 `attachment` preset 通过，覆盖附件导入、发送、请求附件匹配、应用重启恢复、usage 注册及删除会话后的 usage 释放。
- 独立 `media` preset 已通过：生成并推送可扫描的 WAV 与 H.264 Constrained Baseline MP4 fixture，经 DocumentsUI 导入后验证 WAV 的 `audio/wav` 或 `audio/x-wav` MIME、受控预览 URL、`ready` 状态、用户触发后的原生 `<audio>` 播放进度与暂停稳定、keep-alive 路由停用时的暂停和受管 descriptor 撤销、激活后重新申请，以及音频沉浸层的后退/前进、倍速和静音控制；同一回归验证 MP4 的 `video/mp4` MIME、受管预览 URL、原生 WebView `<video>` 可解码、播放进度推进和暂停，强制 Fullscreen API 拒绝时进入应用内沉浸层、通过 WebView history 返回后在内联播放器续播，以及关闭详情后的 URL 回收。两种 fixture 均为 3 秒以避免在进度断言前结束；当前 runner 使用无可听输出的 AVD，不能据此推断设备扬声器或后台音频成立。DocumentsUI API 36 网格会惰性加载文件且多选确认页可能仍报告调用方包名，选择器会滚动定位并在可用时显式确认 Open，确保所选内容 URI 交回应用。
- `attachment` preset 已追加聊天附件预览回归：在附件导入、发送和应用重启恢复后，点击用户图片附件的统一入口，验证 `MediaPreviewHost` 的受控图片 descriptor、`ready` 状态、沉浸层打开与关闭后的 descriptor 回收。
- `rich-text-media` preset 已通过：消息将自身选中的图片附件以 `![...](asset://<assetId>)` 写入 Markdown，RichTextRenderer 只对该消息自有 assetId 解析为 `MediaItem`；Android WebView 已验证 managed preview URL、inline `ready`、沉浸层图片的打开/关闭和 WebView 双击 2x 缩放。该场景不验证模型输出对任意资产的探测，也不替代真机、iOS、多指/下拉手势、方向或实际视频/音频播放。
- 上述结果只构成受控工作流回归，不替代本节 Phase 2 的真实手势、原生全屏/系统返回、长视频行为、设备音频输出、方向、安全区、错误恢复和 Android 真机可用性验收。

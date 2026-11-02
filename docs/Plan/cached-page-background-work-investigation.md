# 缓存页面后台负载与自动分页调查

> 调查日期：2026-10-31
> 范围：桌面端工具、公共组件及相关 composable；下述六类问题已完成代码修复。
> 已完成修复：Git 提交助手，提交 d17ef6e64。

## 背景与判断边界

Git 提交助手曾在隐藏容器中持续自动补页，造成数秒级主线程阻塞。此次围绕相同的两类机制排查：零尺寸容器引发自动加载，以及 KeepAlive 停用后仍运行的展示任务。

桌面 MainLayout 通过 WorkspaceRouteCache 缓存已打开的工具。切换工具仅触发停用，定时器、RAF、外部事件和普通 watch 会继续存在；整个文档仍然可见时，document.hidden 也无法识别工具切换。

以下各节保留修复前的源码核对与三个最小复现。复现使用项目安装的 Vue / VueUse，通知与聊天树逻辑直接从源文件提取；它们用于验证触发机制，尚未测量各候选在真实 Tauri 中的 CPU、内存和长任务。不能把本轮候选直接等同于原始跟踪中已量化的四秒卡顿。

通知中心在 2026-08-04 的 `92547e7d9` 中已引入每页 20 条的分页，同时添加了自动补满逻辑。此次针对该遗留补页链修正。

## 1. 通知分页：通知中心隐藏后仍自动展开后续页

修复前位置（行号对应调查时源码）：

- src/components/notification/NotificationCenter.vue:105–123
- src/components/notification/NotificationCenter.vue:249–255

ensureContentCanScroll() 等待 nextTick 后仅判断内容存在和 hasMore，随后用 scrollHeight <= clientHeight + 1 决定补页。它由 displayedNotifications 与 visible 的 watch 驱动，补页又改变 displayedNotifications，形成连续补页链。抽屉关闭时没有 visible 检查，也没有有效尺寸检查；el-drawer 此处保留默认的关闭行为。

**源码逻辑复现**：visible=false、scrollHeight=clientHeight=0、通知总数 300。50 ms 等待异步链稳定后，currentPage 从 1 变成 15，displayedNotifications 从首屏 20 条扩展到全部 300 条。

影响：历史通知较多时，在关闭后的抽屉中创建和保留更多通知组件。这是有限的 UI 扩展；数据已在 store 中，不涉及远程无限拉取。通知集合当前没有发现条数上限，具体负载依实际数据量而变。

修复方案：首屏固定一页，后续由有效的可见列表滚动触发；移除自动补满逻辑，同时校验 visible、clientHeight 和 scrollTop。

## 2. 聊天树：聊天树图停用后继续逐帧统计与布局更新

修复前位置（行号对应调查时源码）：

- src/tools/llm-chat/components/conversation-tree-graph/flow/FlowTreeGraph.vue:1064–1125
- src/tools/llm-chat/components/conversation-tree-graph/flow/composables/useFlowTreeGraph.ts:635–653
- src/tools/llm-chat/components/conversation-tree-graph/flow/composables/useGraphD3Simulation.ts:315–388
- src/tools/llm-chat/config/defaultSettings.ts:149

HUD 默认开启。updateStats() 只检查 showHud，随后持续 requestAnimationFrame，读取视口并更新统计；停止入口只有卸载和关闭 HUD。D3 模拟也只有卸载时的 destroy()，切换工具没有暂停入口，未收敛时会继续更新节点位置。

**源码逻辑复现**：把 HUD 原代码放入真实 Vue KeepAlive 子组件，停用后 80 ms 内仍执行了 13 次 RAF 回调。复现使用加速的 5 ms 定时器模拟 RAF，此数字用于证明停用后仍调度，不表示真实设备帧率或 CPU 百分比。

影响：打开树图再切走后，HUD 长期维持无效帧循环；较大树图、流式数据变化或尚未收敛的 D3 模拟还会带来隐藏节点更新。D3 有 alphaDecay，单轮通常会自然停止，不能称为永久满载循环。

建议：将 HUD 与 D3 的暂停 / 恢复接入页面激活生命周期；隐藏期间合并纯布局更新，返回时同步一次。聊天生成和会话保存继续由业务层运行。

## 3. 资产列表：两处无限滚动在末尾反复空调用，首屏也有自动补页语义

修复前位置（行号对应调查时源码）：

- src/tools/asset-manager/AssetManager.vue:343–352
- src/tools/media-generator/components/MediaGallery.vue:241–250

两处都使用 useInfiniteScroll，却把 hasMore / isLoading 判断写在回调里，没有通过 canLoadMore 告诉 composable 停止调度。

项目当前安装版本的 useInfiniteScroll 会在到达边缘或内容不足一屏时执行回调；完成后间隔默认 100 ms，再 nextTick 检查一次。回调因为 hasMore=false 而直接返回，也会走同一轮检查。

**安装版本复现**：可见且无滚动空间的容器、回调模拟已无更多数据，650 ms 内仍回调 7 次，属于约 10 Hz 的空检查。

影响与边界：

- 数据耗尽后，反复测量滚动状态并空调用；不会因此继续发出分页请求。
- hasMore=true 且内容不足一屏时，会自动继续加载，即使用户没有滚动；与本次确认的“首屏一页、滚动后追加”交互约定不同。
- 读取失败且 hasMore 保留 true 时存在反复重试风险，需要以失败场景进一步确认。
- VueUse 自带元素可见性判断，隐藏后通常会停止，因此这里与 Git 原先缺少可见性检查的循环有差别。

建议：通过 canLoadMore 传递终止条件；若沿用首屏一页的交互，改用受控滚动分页，避免 composable 的自动补满语义。媒体画廊回调还应返回 / await loadData(true)，让外层调度掌握实际请求完成时间。

## 4. OCR 预览：屏幕字幕 OCR 的 idle 预览在隐藏后继续截图和滤镜处理

修复前位置（行号对应调查时源码）：

- src/tools/realtime-subtitle-ocr/composables/useScreenMonitor.ts:191–203
- src/tools/realtime-subtitle-ocr/composables/useScreenMonitor.ts:416–478
- src/tools/realtime-subtitle-ocr/composables/useScreenMonitor.ts:821–842

配置监控区域后，idle 状态启动截图预览，默认每秒一次；截图后解码图片，启用滤镜时执行 canvas 处理并替换对象 URL。activeInstances 统计 composable 的创建与卸载，KeepAlive 停用不会减少计数，预览也没有页面可见性条件。

**初始证据：源码确认；修复验证见文末。**

影响：尚未开始 OCR 的纯预览也会在切走工具后持续截图、解码和处理图像。截图面积与滤镜配置决定实际成本。stopped 状态已有明确停止预览的实现，应保留。

建议：将 idle 的 UI 预览与用户启动的正式监控分开管理；隐藏时暂停预览，正式监控按产品预期继续。这里是多消费者共享状态，不能简单在任一消费者停用时关闭全局任务。

## 5. GPU 探针：GPU 探针切走后继续 WebGL 绘制

修复前位置（行号对应调查时源码）：

- src/tools/component-tester/components/GpuRenderingTester.vue:392–435、487
- src/tools/component-tester/ComponentTester.vue:59–61

探针由用户手动启动，持续时间默认 30 秒、可调到 300 秒；逐帧执行 WebGL 并更新计数。仅 onBeforeUnmount 停止，切走工具的 KeepAlive 停用不会调用它；同一工具内切换 el-tab-pane 也需要关注，因为面板通常只隐藏。

**初始证据：源码确认；修复验证见文末。**

建议：工具停用或内部 GPU 页签隐藏时停止探针。其负载是测试主动制造的，应与普通长期后台服务区分。

## 6. 展示定时器：其他展示用定时器

| 位置                                                                                                          | 当前行为                                         | 建议                                                   |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| src/tools/danmaku-player/composables/useExternalPlayer.ts:190–250；components/ExternalPlayerPanel.vue:655–666 | 状态预览每秒查询外部播放器，仅卸载时清理         | 暂停隐藏控制面板的状态预览，保留实际外部弹幕播放与同步 |
| src/tools/agent-manager/components/agent-editor/sections/CapabilitiesSection.vue:138–171                      | 虚拟时间宏预览每秒解析；只看编辑器内部 activeTab | 加上工具激活条件，返回时立即刷新一次                   |
| src/tools/system-pulse/components/StatusBar.vue:80–90                                                         | 隐藏后仍每秒刷新显示时钟                         | 暂停展示时钟，系统采集服务独立判断                     |
| src/tools/media-generator/components/GenerationStream.vue:108–120                                             | 每 30 秒更新空白区示例提示词                     | 仅在当前页面展示该空白区时刷新                         |

以上属于源码候选，实际开销未量化，优先级低于前述条目。

## 已区分的正常后台工作

- VueDraggable / 卡片光晕中由鼠标事件触发的一次性 RAF，没有形成持续自调度循环，本次未归入持续负载。
- VCP 心跳、窗口同步、用户启动的生成 / 转写 / OCR 任务、自动保存有明确后台职责。后续优化应停掉隐藏的展示更新，同时保留必要业务进度。
- 通用 VideoPlayer 已有 onActivated / onDeactivated 处理，可作为生命周期拆分的现有参考。

## 实施结果与验证

- 共享 `useScrollPagination`：仅响应激活页面中有效容器的向下滚动，接近底部时追加；等待实际请求完成，防止并发追加。通知中心、资产管理器和媒体画廊均已接入。
- 共享 `usePageActivity`：把缓存停用与组件卸载统一映射为展示任务暂停，正式后台任务使用独立生命周期。
- 聊天树 HUD 关闭或页面停用时取消 RAF；D3 停止模拟和尺寸等待，返回时恢复待处理布局，已冷却模拟保持稳定。
- OCR idle 预览按工作台消费者订阅，隐藏时暂停截图与滤镜，正式监控继续运行。
- GPU 探针在内部页签隐藏或工具停用时停止；外部播放器状态预览暂停并丢弃过期异步结果；虚拟时间宏预览、状态栏时钟和空白提示轮换按展示状态运行。

行为回归：7 个测试文件、15 项用例通过。覆盖通知搜索与滚动分页、分页并发与停用、HUD 停复、D3 布局恢复及冷却保持、外部播放器预览异步结果、OCR 预览订阅与正式监控独立性。

真实 Tauri 隔离实例：300 条通知首屏保持 20 条，向下滚动后 40 条，关闭抽屉后保持 40 条；聊天树 HUD 的 RAF 计数切走后保持不变，返回后继续增长；GPU 探针启动后切换内部页签即停止绘制。

类型检查与 Vite 生产构建通过。候选修复后的行为验证与原始跟踪的性能归因分别记录；本轮未对每个条目单独量化 CPU 或内存收益。

# markstream-vue 实现对照与吸收记录

> 日期：2026-10-29。五项对照已完成，四项代码改进与一项保留现状的取舍分别提交。

## 来源与范围

对照 [markstream-vue](https://github.com/Simon-He95/markstream-vue) 主分支 2.0.21（2026-10-26 发布提交）。参考实现克隆于系统临时目录。保留 AIO Hub 的 AST、VCP、HTML 沙箱、资产解析与阅读交互契约。

| 顺序 | 方向                      | 状态                             |
| ---- | ------------------------- | -------------------------------- |
| 1    | KaTeX 流式更新合并        | 已完成，Worker 按后续实测决定    |
| 2    | 超长完成态消息首次挂载    | 完成对照，保留现有实测几何策略   |
| 3    | 重型节点布局协作          | 已完成公式和图表接入与验证       |
| 4    | grapheme 与围栏头原子呈现 | 已完成边界与隐藏窗口调度         |
| 5    | Mermaid SVG 清理边界      | 已完成共享出口清理与真实图表复核 |

## 1. KaTeX 流式更新合并

来源：[MathBlockNode](https://github.com/Simon-He95/markstream-vue/blob/284a50d5bca7bba5c58a3c9b0712f96ce0fded7b/src/components/MathBlockNode/MathBlockNode.vue)、[Worker 客户端](https://github.com/Simon-He95/markstream-vue/blob/284a50d5bca7bba5c58a3c9b0712f96ce0fded7b/src/workers/katexWorkerClient.ts)。参考其请求合并与过期任务清理思路，保持现有 KaTeX 渲染选项。

现有组件在挂载和正文变更时同步渲染。本轮为 AST 公式传递节点状态：pending 更新在 32ms 窗口内合并，stable 或父流结束时立即刷新；相同正文与展示模式复用当前输出。模式切换同步更新容器标签和渲染选项，KeepAlive 停用与卸载清理待执行任务。

行为验证保护突发输入的最终公式、完成态刷新、展示模式切换及卸载边界，断言面向实际渲染调用与公式 DOM。Worker 按密集公式实际耗时决定，避免仅增加线程与通信成本。

验证结果：相关组件用例通过，完整前端类型检查与 Vite 生产构建通过。隔离 Tauri HMR 实例内，同一公式连续 24 次更新，逐次稳定刷新为 24 次 DOM 提交 / 8.3ms，pending 合并后为 1 次 / 1.6ms；完成后的公式源码一致，MathML 保留。该数据只覆盖短时单公式更新，本轮先保留主线程渲染。

## 2. 首次挂载与几何约束

来源：[批量调度器](https://github.com/Simon-He95/markstream-vue/blob/284a50d5bca7bba5c58a3c9b0712f96ce0fded7b/src/components/NodeRenderer/composables/useBatchRenderingScheduler.ts)、[虚拟列表接入说明](https://github.com/Simon-He95/markstream-vue/blob/284a50d5bca7bba5c58a3c9b0712f96ce0fded7b/docs/guide/performance.md)。其批量调度按提交及 Vue flush 耗时调整下一批节点数量，配合尚未挂载节点的高度估算。

### 同环境采样

隔离 Tauri HMR 实例，关闭 Vue DevTools 事件采集，同一宽 800px、高 550px 的滚动区域；提前完成 V2 解析，仅测实际 `AstNodeRenderer` 与现有块生命周期的挂载。每段包含强调和链接，三次重复：

| 顶层段落 | 同步挂载耗时（ms）    | 首帧到达（ms）        |
| -------- | --------------------- | --------------------- |
| 120      | 45.9 / 40.5 / 38.6    | 46.0 / 49.3 / 47.3    |
| 600      | 267.3 / 218.3 / 213.6 | 370.3 / 258.0 / 254.5 |

记录位于忽略的 `.tmp/markstream-study/cold-before.json`，采样入口为 `cold-native.json`。这是开发态、预先解析的合成压力样本，覆盖挂载峰值；它没有覆盖生产态完整聊天恢复，也未实施分帧变体，表中数据仅作当前实现观察。

### 本轮决定

保留现有首次挂载与实测回收策略。现有聊天外层已按整行阅读范围延迟正文；块级回收使用原生标签、实测尺寸，并为选区、键盘和有内部状态的嵌入内容保留正文。上游分批挂载需要同时引入未展示正文的高度模型和恢复位置协议；仅截断 AST 前缀会改变整行高度、尾部锚点和全文选择范围。

先在下一项补齐可复用的重型节点 pending/settled 边界，保护实际测量与块回收；首次分帧继续作为明确候选。后续若完整生产聊天样本确认挂载峰值影响交互，可在该协议上加入调度，连同位置恢复一起实现。本项采用文档提交，避免将压力样本结论扩展为未经验证的滚动行为变更。

## 3. 异步布局与高度缓存协作

来源：[节点生命周期契约](https://github.com/Simon-He95/markstream-vue/blob/284a50d5bca7bba5c58a3c9b0712f96ce0fded7b/src/types/node-renderer-props.ts)。本轮提炼 renderer 作用域内的任务登记：公式合并窗口与实际 Mermaid 渲染任务登记 pending，完成、失败和卸载释放；新任务替换旧任务时，旧 finally 无法清理新登记。

块级回收检查自身及后代节点的待完成工作，整消息展示与聊天行高缓存保留上次有效尺寸。根元素以内部 `data-render-pending` 属性通知外层；属性移除后重新订阅测量，即使最终高度与加载外壳相同也能获得有效样本。现有 iframe / Canvas / 表单等内部状态子树继续沿用持续挂载策略。图片继续通过原有加载与 ResizeObserver 路径校准，本轮未改变图片请求及代理重试。

行为验证覆盖过期任务完成、卸载清理、pending 子树回收边界、临时高度保护和恢复测量；已有 Mermaid 与渲染器生命周期用例同步复核。隔离原生 Tauri 中，真实公式和 Mermaid 的布局状态依次为 false / true / false，结束后 SVG、MathML 均存在，待执行标记清除。

验证结果：70 项相关用例、完整前端类型检查与 Vite 生产构建通过；原生公式和图表布局状态复核通过。

## 4. 流式显示边界

来源：[smooth-stream-controller](https://github.com/Simon-He95/markstream-vue/blob/284a50d5bca7bba5c58a3c9b0712f96ce0fded7b/packages/markstream-core/src/smooth-stream-controller.ts)。保留现有语义节奏、VCP 跳过平滑和大段回放入口，新增独立的增量文本边界：

- 仅保留最后一个待确认 grapheme，跨 chunk 拼合代理项、组合标记、肤色和 ZWJ 序列；遇到拆开的高代理项时同时保留前一个可能被修饰的 grapheme。结束时原样冲刷尾部。
- 围栏候选逐次扫描新字符，复用现有围栏语法函数；完整围栏头连同语言名与换行原子提交，支持反引号、波浪线、不同长度、最多三格缩进及 LF / CRLF / CR。
- 代码正文预先按 grapheme 分组，消费时保持单元完整。大段回放继续绕过逐字分配，并保留输入顺序。
- 隐藏窗口以 200ms 定时器推进缓冲；恢复可见后回到 rAF，停止与重置清理调度和可见性监听。

回归用例验证任意 UTF-16 上游切分后的每个输出前缀、完整围栏头、三种换行、终止候选、后台推进与 50 万字回放。原生 Tauri 以同一输入对照提交前后控制器：旧版 11 次提交中 7 个前缀落在 grapheme 或围栏头内部，新版 4 次提交全部落在安全边界，最终原文均一致。该数据是正确性样本，提交次数随投喂节奏变化。

验证结果：边界与控制器 10 项用例通过，既有渲染器生命周期同步复核通过；完整前端类型检查与 Vite 生产构建通过。CR 换行处理已随最终相关用例组合再次复核通过。

## 5. Mermaid SVG 输出清理

来源：[共享 SVG 清理器](https://github.com/Simon-He95/markstream-vue/blob/284a50d5bca7bba5c58a3c9b0712f96ce0fded7b/packages/markdown-parser/src/mermaidSvgSanitizer.ts)。沿用其在 SVG 注入前设置统一清理出口的思路，复用项目现有 DOMPurify 依赖，并创建独立实例隔离 hooks。

`renderMermaid` 完成异步排版并确认任务仍有效后清理 SVG，再交给两处现有展示入口。清理保留安全的 foreignObject 富文本、SVG 图形和本地 marker / gradient 引用；DOMPurify 处理脚本、事件与危险链接，额外通过离线 CSSStyleSheet 解析清理外部 CSS 资源和资源加载规则。普通主题规则、media / supports 条件与 keyframes 继续保留；新窗口链接补齐 `noopener noreferrer`。缺少有效 SVG 根时进入现有错误展示路径。

与上游将 foreignObject 转为纯文本的方式相比，本项目保留 HTML 标签的排版能力。原生 Tauri 中以真实 Mermaid 顺序渲染浅色、深色流程图及事件时序图，清理前后 viewBox、宽高、填充和描边均一致：流程图为 270 × 88，时序图为 450 × 271；流程图的粗体标签、换行与 xlink:href 链接保持有效。

行为用例覆盖正常图形、主题、富文本和链接的保留，以及可执行标签、危险 URL、CSS 转义和外部资源的清理；既有主题串行调度与失败恢复用例继续通过。本项范围为共享渲染输出边界，Mermaid 自身配置与其他 HTML 沙箱沿用既有协议。

## 最终验证与后续取舍

- 最终相关用例组合：13 个测试文件、88 项用例通过，覆盖公式、布局协作、流式边界、图表输出、渲染器生命周期及聊天行高。
- 完整前端类型检查、Vite 生产构建通过；真实 Tauri 的公式合并、布局状态、流式边界和图表兼容性已逐项复核。
- 首次挂载保留现有实测几何策略，后续分帧需同时落实未展示内容估高与阅读位置恢复。
- KaTeX 先采用主线程合并调度，Worker 接入根据密集公式的真实耗时再决定。

# markstream-vue 实现对照与吸收记录

> 日期：2026-10-29。按实际缺口逐项实施，验证与提交随各项回写。

## 来源与范围

对照 [markstream-vue](https://github.com/Simon-He95/markstream-vue) 主分支 2.0.21（2026-10-26 发布提交）。参考实现克隆于系统临时目录。保留 AIO Hub 的 AST、VCP、HTML 沙箱、资产解析与阅读交互契约。

| 顺序 | 方向 | 状态 |
| --- | --- | --- |
| 1 | KaTeX 流式更新合并 | 已完成，Worker 按后续实测决定 |
| 2 | 超长完成态消息首次挂载 | 完成对照，保留现有实测几何策略 |
| 3 | 重型节点布局协作 | 已完成公式和图表接入与验证 |
| 4 | grapheme 与围栏头原子呈现 | 待实施 |
| 5 | Mermaid SVG 清理边界 | 待实施与兼容性复核 |

## 1. KaTeX 流式更新合并

来源：[MathBlockNode](https://github.com/Simon-He95/markstream-vue/blob/284a50d5bca7bba5c58a3c9b0712f96ce0fded7b/src/components/MathBlockNode/MathBlockNode.vue)、[Worker 客户端](https://github.com/Simon-He95/markstream-vue/blob/284a50d5bca7bba5c58a3c9b0712f96ce0fded7b/src/workers/katexWorkerClient.ts)。参考其请求合并与过期任务清理思路，保持现有 KaTeX 渲染选项。

现有组件在挂载和正文变更时同步渲染。本轮为 AST 公式传递节点状态：pending 更新在 32ms 窗口内合并，stable 或父流结束时立即刷新；相同正文与展示模式复用当前输出。模式切换同步更新容器标签和渲染选项，KeepAlive 停用与卸载清理待执行任务。

行为验证保护突发输入的最终公式、完成态刷新、展示模式切换及卸载边界，断言面向实际渲染调用与公式 DOM。Worker 按密集公式实际耗时决定，避免仅增加线程与通信成本。

验证结果：相关组件用例通过，完整前端类型检查与 Vite 生产构建通过。隔离 Tauri HMR 实例内，同一公式连续 24 次更新，逐次稳定刷新为 24 次 DOM 提交 / 8.3ms，pending 合并后为 1 次 / 1.6ms；完成后的公式源码一致，MathML 保留。该数据只覆盖短时单公式更新，本轮先保留主线程渲染。

## 2. 首次挂载与几何约束

来源：[批量调度器](https://github.com/Simon-He95/markstream-vue/blob/284a50d5bca7bba5c58a3c9b0712f96ce0fded7b/src/components/NodeRenderer/composables/useBatchRenderingScheduler.ts)、[虚拟列表接入说明](https://github.com/Simon-He95/markstream-vue/blob/284a50d5bca7bba5c58a3c9b0712f96ce0fded7b/docs/guide/performance.md)。其批量调度按提交及 Vue flush 耗时调整下一批节点数量，配合尚未挂载节点的高度估算。

### 同环境采样

隔离 Tauri HMR 实例，关闭 Vue DevTools 事件采集，同一宽 800px、高 550px 的滚动区域；提前完成 V2 解析，仅测实际 `AstNodeRenderer` 与现有块生命周期的挂载。每段包含强调和链接，三次重复：

| 顶层段落 | 同步挂载耗时（ms） | 首帧到达（ms） |
| --- | --- | --- |
| 120 | 45.9 / 40.5 / 38.6 | 46.0 / 49.3 / 47.3 |
| 600 | 267.3 / 218.3 / 213.6 | 370.3 / 258.0 / 254.5 |

记录位于忽略的 `.tmp/markstream-study/cold-before.json`，采样入口为 `cold-native.json`。这是开发态、预先解析的合成压力样本，覆盖挂载峰值；它没有覆盖生产态完整聊天恢复，也未实施分帧变体，表中数据仅作当前实现观察。

### 本轮决定

保留现有首次挂载与实测回收策略。现有聊天外层已按整行阅读范围延迟正文；块级回收使用原生标签、实测尺寸，并为选区、键盘和有内部状态的嵌入内容保留正文。上游分批挂载需要同时引入未展示正文的高度模型和恢复位置协议；仅截断 AST 前缀会改变整行高度、尾部锚点和全文选择范围。

先在下一项补齐可复用的重型节点 pending/settled 边界，保护实际测量与块回收；首次分帧继续作为明确候选。后续若完整生产聊天样本确认挂载峰值影响交互，可在该协议上加入调度，连同位置恢复一起实现。本项采用文档提交，避免将压力样本结论扩展为未经验证的滚动行为变更。

## 3. 异步布局与高度缓存协作

来源：[节点生命周期契约](https://github.com/Simon-He95/markstream-vue/blob/284a50d5bca7bba5c58a3c9b0712f96ce0fded7b/src/types/node-renderer-props.ts)。本轮提炼 renderer 作用域内的任务登记：公式合并窗口与实际 Mermaid 渲染任务登记 pending，完成、失败和卸载释放；新任务替换旧任务时，旧 finally 无法清理新登记。

块级回收检查自身及后代节点的待完成工作，整消息展示与聊天行高缓存保留上次有效尺寸。根元素以内部 `data-render-pending` 属性通知外层；属性移除后重新订阅测量，即使最终高度与加载外壳相同也能获得有效样本。现有 iframe / Canvas / 表单等内部状态子树继续沿用持续挂载策略。图片继续通过原有加载与 ResizeObserver 路径校准，本轮未改变图片请求及代理重试。

行为验证覆盖过期任务完成、卸载清理、pending 子树回收边界、临时高度保护和恢复测量；已有 Mermaid 与渲染器生命周期用例同步复核。隔离原生 Tauri 中，真实公式和 Mermaid 的布局状态依次为 false / true / false，结束后 SVG、MathML 均存在，待执行标记清除。

验证结果：70 项相关用例、完整前端类型检查与 Vite 生产构建通过；原生公式和图表布局状态复核通过。

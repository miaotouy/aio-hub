# markstream-vue 实现对照与吸收记录

> 日期：2026-10-29。按实际缺口逐项实施，验证与提交随各项回写。

## 来源与范围

对照 [markstream-vue](https://github.com/Simon-He95/markstream-vue) 主分支 2.0.21（2026-10-26 发布提交）。参考实现克隆于系统临时目录。保留 AIO Hub 的 AST、VCP、HTML 沙箱、资产解析与阅读交互契约。

| 顺序 | 方向 | 状态 |
| --- | --- | --- |
| 1 | KaTeX 流式更新合并 | 已完成，Worker 按后续实测决定 |
| 2 | 超长完成态消息首次挂载 | 待对照原生挂载峰值 |
| 3 | 重型节点布局协作 | 待核对高度测量与回收时序 |
| 4 | grapheme 与围栏头原子呈现 | 待实施 |
| 5 | Mermaid SVG 清理边界 | 待实施与兼容性复核 |

## 1. KaTeX 流式更新合并

来源：[MathBlockNode](https://github.com/Simon-He95/markstream-vue/blob/284a50d5bca7bba5c58a3c9b0712f96ce0fded7b/src/components/MathBlockNode/MathBlockNode.vue)、[Worker 客户端](https://github.com/Simon-He95/markstream-vue/blob/284a50d5bca7bba5c58a3c9b0712f96ce0fded7b/src/workers/katexWorkerClient.ts)。参考其请求合并与过期任务清理思路，保持现有 KaTeX 渲染选项。

现有组件在挂载和正文变更时同步渲染。本轮为 AST 公式传递节点状态：pending 更新在 32ms 窗口内合并，stable 或父流结束时立即刷新；相同正文与展示模式复用当前输出。模式切换同步更新容器标签和渲染选项，KeepAlive 停用与卸载清理待执行任务。

行为验证保护突发输入的最终公式、完成态刷新、展示模式切换及卸载边界，断言面向实际渲染调用与公式 DOM。Worker 按密集公式实际耗时决定，避免仅增加线程与通信成本。

验证结果：相关组件用例通过，完整前端类型检查与 Vite 生产构建通过。隔离 Tauri HMR 实例内，同一公式连续 24 次更新，逐次稳定刷新为 24 次 DOM 提交 / 8.3ms，pending 合并后为 1 次 / 1.6ms；完成后的公式源码一致，MathML 保留。该数据只覆盖短时单公式更新，本轮先保留主线程渲染。

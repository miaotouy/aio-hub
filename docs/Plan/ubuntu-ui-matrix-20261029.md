# Ubuntu 复杂样本与主题矩阵走查（2026-10-29）

## 结论

已从 Windows 主线目录 `E:/rc20/allinweb/aiohub-dev` 复制现有语料和测试定义，在 Ubuntu 的真实 Tauri / WebKitGTK 实例运行，并检查应用截图及 VMware 控制台。

- 完整外观矩阵 38/38 生效；主页和设置页另采集 16 张截图，设置页下半部补充 8 张。
- 8 类复杂会话分别在浅色/深色、关闭特效/壁纸透明模糊场景回放，共 32 例完成会话选择和程序滚动。
- 27 组富文本预设均产生可见内容；8 组复杂流式样本最终 AST 校验通过。
- HTML 预览的 8 项交互契约有 4 项失败，涉及内容缩短后的高度回缩、等价围栏收尾时的表单状态保留。主线已有对应修复，本分支尚未包含。
- 重会话仍有明显滚动停顿。多分支样本最长单次 rAF 间隔约 1.35 秒，多媒体样本约 2.17 秒。
- 本轮修复了独立数据目录的图片资源授权，并修正性能脚本参考解析器与渲染器默认配置之间的差异。

## 来源与运行环境

主线采样时版本为 `d6e4836a9`；测试分支基于 `2d516cf94`，含当前开发控制脚手架及本轮修复。此次只复制用例，业务组件沿用本分支实现。

| 复用材料         | 主线位置                                                                   | 本地留存                                                      |
| ---------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 脱敏复杂会话     | `.tmp/app-memory/corpus-reviewed-20261027.json`                            | `.tmp/ubuntu-matrix/imported/corpus.json`                     |
| 完整主题定义     | `scripts/perf/memory/matrix.ts`                                            | `.tmp/ubuntu-matrix/imported/matrix.ts`、`appearance.json`    |
| 全部富文本预设   | `src/tools/rich-text-renderer/config/presets.ts`                           | `.tmp/ubuntu-matrix/imported/presets.json`                    |
| 原有页面走查脚本 | `.tmp/rich-text-presets/ui-all.ts`                                         | `.tmp/ubuntu-matrix/imported/ui-all.ts`，另适配生产资源运行态 |
| HTML 预览契约    | `scripts/rich-text/embedded-preview-page.ts`、`embedded-preview-corpus.ts` | `.tmp/ubuntu-matrix/imported/embedded-preview-*`              |

会话语料保留结构和长度分布，正文经过逐词替换。截图中的混合汉字和随机词来自脱敏处理。图片在隔离目录重建为合成色块；这一版语料缺少原图尺寸清单，采用 640 × 480 回退。适合复现结构与资源数量，可读排版由正式富文本预设补充观察。

- Ubuntu 24.04.4、Wayland、WebKitGTK 2.52.3，4 vCPU / 16 GB。
- 真实生产前端资源 Debug 应用，视口 1440 × 900。
- 独立实例 `ubuntu-matrix`；原有 `ubuntu-probe` 和 Windows 主线数据保持原样。
- 用例加载、滚动、截图经嵌入式 Dev Control；滚动输入采用 DOM `scrollTop`。
- 生产 Vue 没有测试脚本依赖的 `app._instance`；预览契约的遍历入口改用挂载返回对象的 `$`，断言保持原样。

## 外观矩阵与页面观察

矩阵为：2 种明暗 × 2 种壁纸状态 × 3 档基础透明度（1 / 0.75 / 0.3）× 3 档模糊（0 / 15 / 40 px），另加明暗各一组关闭特效，共 38 组。

38 组均确认明暗、模糊、壁纸透明度及卡片透明度生效。卡片透明度按应用默认分层偏移计算：基础值加 0.05，再限幅。最初比较脚本直接用基础透明度比较卡片透明度，后按当前契约修正；原始 CSS 采样保留在结果中。

走查情况：

- 侧栏、会话列表、输入区与操作栏保持完整；采样中页面级横向溢出为 0。
- 主页工具卡片、搜索和分类结构在明暗与透明主题下保持可用。
- 设置页顶部颜色选择，以及下半部壁纸、界面质感、窗口设置均有截图。
- 低透明度加壁纸时，图案对正文的干扰明显；0.75 透明度更便于阅读。此处作为外观体验记录。
- 复杂预设中观察到嵌套面板、表格、代码、HTML、Mermaid 和数学公式显示。MathJax 预设补充等待异步节点完成后，得到 29 个公式节点，公式错误节点为 0。

截图索引：

- `results/matrix-light-contact.jpg`、`matrix-dark-contact.jpg`
- `results/pages-contact.jpg`、`settings-lower-contact-1.jpg`
- `results/presets-contact-1.jpg`、`presets-contact-2.jpg`
- `results/final-complex-rendering-test.png`、`final-mathjax-test.png`

上述路径均相对工作区 `.tmp/ubuntu-matrix/`。

## 复杂会话与滚动

沿用 2713 条会话索引、8 类完整样本。每类在浅色/深色 × 特效关闭/壁纸开启且透明度 0.3、模糊 40 px 的 4 种配置下回放。

| 样本        | 结构特点                   | 4 次诊断中最长单帧间隔范围（ms） |
| ----------- | -------------------------- | -------------------------------: |
| typical     | 常规混合会话               |                           69–133 |
| long-thread | 长对话链                   |                           94–119 |
| long-answer | 约 35.6 万字符的重回复样本 |                          614–648 |
| rich-text   | 密集表格与混合富文本       |                          109–142 |
| reasoning   | 长思考过程                 |                          164–238 |
| tools       | 多工具调用                 |                            18–72 |
| branches    | 172 个节点、84 个分支      |                         327–1347 |
| media       | 大量图片与混合正文         |                         269–2168 |

每次滚动按约 900 ms 的页内 rAF 调度推进，异步布局和节点激活会延长实际执行时间。这是一次诊断采样，适合定位卡顿；数据没有旧版同环境对照，主题间的数值也受首次激活、资源加载及测试顺序影响。

特效关闭时，重回复、多分支和多媒体样本仍出现停顿。后续优先看内容激活、布局与滚动锚定，再单独衡量毛玻璃开销。

本轮复杂会话诊断捕获 8 次 `ResizeObserver loop completed with undelivered notifications.`；主题、页面、预设和流式阶段的对应错误采集为空。原生资源拒绝另通过启动日志核对。

## HTML 预览交互问题

| 原主线契约                | 结果 | 观察                                                               |
| ------------------------- | ---- | ------------------------------------------------------------------ |
| Canvas 增长与收缩         | 失败 | iframe 从 288 增至 648 px；内容缩回 288 px 后，iframe 仍为 648 px  |
| 卸载后停止 Canvas 消息    | 通过 | 卸载后新增 tick 为 0                                               |
| 延迟图片增长与收缩        | 失败 | 图片移除后正文回到 200 px，iframe 仍为 488 px                      |
| fixed 浮层保留视口        | 通过 | 180 px                                                             |
| 百分比内容高度            | 通过 | iframe 240 px，半高元素 120 px                                     |
| 仅 fixed 内容保留最小视口 | 通过 | 40 px                                                              |
| 围栏收尾保留表单          | 失败 | 多发生一次 load；输入回到初始值，计数回到 0                        |
| 真正修改文档仍导航        | 失败 | 累计 load 为 2；包含上一项产生的额外加载，需随等价文档修复一起复测 |

对应主线提交：

- `3ddc054e2 fix(rich-text): 修复内嵌预览内容收缩后的高度`
- `e512f20a8 fix(rich-text): 保留围栏闭合时的等价 HTML 预览`

本分支的 `HtmlInteractiveViewer.vue` 与主线存在实现差异。当前结果可确认旧实现的问题，平台归因需要在同步相关修复后再次验证。

补充界面复现截图为 `results/preview-initial.png`、`preview-expanded.png`、`preview-collapsed.png`，尺寸数据在 `results/walkthrough.json`。

## 本轮修复

### 独立目录的图片资源授权

首轮回放出现加载失败色块，原生日志记录 `asset protocol not configured to allow the path`，目标在 `.dev-data/dev-control/data/ubuntu-matrix/.../assets/memory/`。

原启动流程只扩展 FS 插件权限。现同步对解析出的应用数据目录调用 `asset_protocol_scope().allow_directory(..., true)`。重新构建、启动后，同一类隔离目录下的合成 PNG 成功加载，验证尺寸 640 × 480，重新回放期间对应资源拒绝日志为 0。首轮证据保留在 `.tmp/ubuntu-matrix/before-asset-fix/`。

### 性能脚本的参考配置

最初 8 组流式样本中，3 组含思考节点的样本校验超时。逐节点比较发现，裸 `CustomParser` 使用 `think` 作为显示名，实际渲染器默认规则使用 `AI 思考过程`；同一样本的真实静态/流式 AST 完全相同。

性能探针现返回编译产物中的解析默认配置，性能和内存脚本据此创建参考解析器。此前 5 组通过，3 组校准后通过，共 8/8。原始失败记录、静态/流式比较与校准结果均保留，汇总为 `results/stream-effective.json`。

正式 `rich-text:performance:tauri` 入口另对 `preset:complex-rendering-test` 运行 static / stream 各一次，AST 校验通过、运行错误为空。该采样为组件渲染调度测试，HTML 预览交互由上面的专用契约覆盖。

## 验证与复现

- 原生 Debug 构建通过，日志 `.tmp/ubuntu-matrix/asset-native-build.log`。
- `bun run rich-text:check` 通过。
- `bun run test:run -- scripts/rich-text/tauri-performance.test.ts`：4 项通过。
- `git diff --check` 通过。
- Cargo 格式检查提示现有 `dev_control.rs` 与 `git_committer.rs` 的格式差异，本轮未扩展为全仓格式修改。

临时运行器位于 `.tmp/ubuntu-matrix/`；素材、原始结果和 PNG 均保留在宿主工作区及 guest 原生检出中。

```bash
cd /home/mty/aio-hub-Ubuntu
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
bun .tmp/ubuntu-matrix/run.ts corpus
bun .tmp/ubuntu-matrix/run.ts matrix
bun .tmp/ubuntu-matrix/embedded.ts
bun run rich-text:performance:tauri -- --instance ubuntu-matrix --cycles 1 --sizes 10 --filter '^preset:complex-rendering-test$' --modes static,stream --out-dir .tmp/ubuntu-matrix/recheck-complex
```

运行前通过 `bun run dev:control -- status --instance ubuntu-matrix` 确认实例。VM 控制台本轮再次观测到 `PowerSaveMode=3`；测试期间使用临时显示唤醒，锁屏与系统长期配置保持原样。

建议下一步同步上述两个主线预览修复，先复测这 8 项交互契约，再继续定位多分支和多媒体样本的滚动停顿。

## 上游同步后的复测

已同步主线预览修复、长消息和上下文管线变更。8 项预览交互全部通过；复测另修复了附件路径中的 Windows 分隔符问题，前轮单张资源探测未覆盖该附件链路。完整结果与剩余滚动停顿见 [Ubuntu 上游同步与回归复测](./ubuntu-upstream-retest-20261029.md)。

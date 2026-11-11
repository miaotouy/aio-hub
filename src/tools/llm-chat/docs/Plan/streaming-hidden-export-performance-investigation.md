# 长会话流式生成卡顿：隐藏导出预览调查

> 日期：2026-11-12  
> 输入：主人提供的本地 Chrome / WebView2 性能记录 `Trace-20261112T070040.json`。原始记录保留在本机下载目录。  
> 范围：长会话在 AI 生成期间出现的主线程停顿。

## 结论

本次记录中的主要长任务由消息工具栏常驻的导出弹窗触发。每条已挂载消息都会创建一个 `ExportBranchDialog`；即使弹窗关闭，其预览 watcher 仍以 `deep: true` 监听完整会话，并立即生成分支导出预览。

流式处理将正文、思考或 metadata 写回节点时，这些隐藏实例会共同响应：每个实例遍历完整会话，再分别生成到自身消息为止的分支预览。会话越长、已挂载消息越多，重复工作越重。正文渲染区的回收与延迟解析覆盖不到这条弹窗 setup 中的计算链。

该证据足以确定优先修复位置。预设与上下文管道、正文解析、内存累积仍应根据各自调用栈判断；本次主要长任务的调用栈集中在深度遍历和分支导出。

## Trace 证据

记录大小 285,724,824 字节，共 1,282,337 个事件，事件时间跨度约 337.70 秒。渲染进程 PID 为 92108，主线程 TID 为 57640。

CPU profile 的开始事件位于主线程；分块采样由同一进程的采样线程写出。合并时按进程与 profile ID `0x4` 关联，使用 `timeDeltas` 还原采样时间。累计耗时来自 CPU 采样估算，事件持续时间单独统计。

本地已有的生产资源文件名与 trace 中的 URL 一致，可直接核对压缩代码：

- `vendor-element-BNFdcSzS.js:1:21025`：`Nn` 为 Vue 的递归 `traverse`。
- `MessageList-B6JQLQl-.js:14:19686`：所属代码是打包到该 chunk 内的 `ExportBranchDialog` 预览 watcher，选项包含 `immediate: true, deep: true`。
- `useSessionManager-DM_PHdNz.js:7:70`：`exportBranchAsMarkdown`。
- `logger-Bu9A6nLS.js` 中该导出栈调用的是日期 / 时区格式化函数；chunk 名称仅用于定位文件，不能据此归因为日志写入。

| 指标                                        | 原始记录中的结果 |
| ------------------------------------------- | ---------------: |
| 主线程 RunTask 累计                         |      27,027.02ms |
| RunMicrotasks 累计                          |      18,016.89ms |
| 排除录制启动阶段后，超过 500ms 的主线程任务 |            14 次 |
| 上述 14 次任务累计                          |      16,106.56ms |
| 最长任务                                    |       1,822.47ms |
| 热点深度遍历子树的累计采样时间              |      10,174.14ms |
| 分支 Markdown 导出子树的累计采样时间        |       3,436.83ms |
| UpdateLayoutTree 累计                       |         581.71ms |
| Layout 累计                                 |          76.06ms |
| Paint 累计                                  |         518.39ms |
| MinorGC + MajorGC 累计                      |         293.68ms |

父子事件与父子调用栈有包含关系，表格各行不能相加。深度遍历数值来自共享 watcher 调度栈；调用栈本身无法单独标注每一个 watcher 的组件实例。导出回调、生产包代码与下述行为复现共同确定这条链路。

以 `TracingStartedInBrowser` 为相对零点，代表性长任务如下：

| 开始位置 | 任务持续时间 | 深度遍历采样 | Markdown 导出采样 |
| -------- | -----------: | -----------: | ----------------: |
| 6.114s   |     825.91ms |     524.78ms |          190.75ms |
| 8.492s   |   1,615.39ms |   1,034.40ms |          363.68ms |
| 242.201s |   1,822.47ms |   1,218.55ms |          404.73ms |
| 281.071s |   1,240.32ms |     765.24ms |          229.77ms |
| 296.580s |   1,189.88ms |     760.88ms |          248.78ms |

渲染计数的首尾样本为：DOM 节点 30,502 → 32,548，JS heap 已用约 201.6MB → 214.4MB。首尾计数包含本轮新增内容，且受 GC 时机影响；单凭这两点无法判定泄漏。对本次秒级停顿，CPU 调用栈已提供更直接的原因。

## 源码链路

```text
useChatResponseHandler
  └─ 更新消息正文 / reasoning / metadata
      └─ 每条消息的 MessageMenubar
          └─ 常驻 ExportBranchDialog（visible=false）
              ├─ deep watcher 遍历 props.session 的完整消息树
              └─ exportBranchAsMarkdown
                  ├─ 收集当前消息的分支路径
                  ├─ 格式化导出时间、参与者和消息内容
                  └─ 写入隐藏弹窗的 previewContent
```

直接相关文件：

- `components/message/MessageMenubar.vue`：导出弹窗此前只有 `v-model:visible`，随工具栏一起初始化。
- `components/export/ExportBranchDialog.vue`：预览 watcher 包含完整 `props.session` 与 `props.sessionIndex`，且开启深度与立即执行。
- `components/conversation-tree-graph/flow/components/GraphNodeMenubar.vue`：同类入口已有 `v-if="showExportDialog"`。

若已挂载 M 个消息工具栏，每次会话节点更新会产生最多 M 份完整会话遍历，并尝试生成 M 个分支预览。具体次数受 Vue 同 tick 合并与当前挂载范围影响，不能直接换算为每个网络 chunk 的次数。

## 修复

消息工具栏的导出入口补上 `v-if="showExportDialog"`，与会话树入口一致：打开时创建弹窗及预览监听；关闭时销毁实例、停止监听。导出选项按每次打开初始化。

改动集中在弹窗生命周期。生成中的正文更新与富文本解析沿用现有链路。

## 验证

回归用例使用真实 `MessageMenubar`、`ExportBranchDialog` 与对话框交互，仅替换导出结果生成、上下文请求和重型预览呈现。验证的行为是：关闭时导出预览保持空闲；打开后显示所选消息的当前内容并随更新刷新；关闭后停止生成预览；再次打开获取最新内容。

修复前，该用例在首次挂载后即捕获到一次隐藏导出，按预期失败。修复后的验证结果：

- `bun run test:run src/tools/llm-chat/components/message/__tests__/MessageMenubar.test.ts src/tools/llm-chat/composables/features/__tests__/useExportManager.roles.test.ts`：2 个文件、18 个用例通过。
- `bun run build:vite`：通过，耗时约 26.08s；保留现有依赖 eval、chunk 大小与插件耗时警告。
- `bun run build:tsc`：26 处 `TS7006`，均位于本轮未修改的业务文件。临时还原本轮两个受控源文件至 HEAD 后复跑，报错位置与内容一致；随后恢复本轮修改。涉及 `PresetCompositionCard`、`GraphNodeDetailPopup`、媒体生成、Recall 与画板属性组件。

本地诊断摘要与验证日志位于 `.tmp/streaming-hidden-export/`。

原始用户会话尚未采集修复后的同条件 trace，以上毫秒值全部来自修复前记录。代码和行为测试用于确认触发链路被切断，实际改善幅度以更新后的真实会话复测为准。

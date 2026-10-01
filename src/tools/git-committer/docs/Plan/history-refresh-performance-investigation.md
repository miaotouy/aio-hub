# Git 提交助手提交历史刷新性能调查

> 状态：前端「刷新时列表消失」已修复；后端排序优化待定，暂不实施
>
> 最近复核：2026-10-02

## 背景

提交后（`headCommitHash` 变化）历史记录列表会先清空、显示「正在加载历史...」，等待后端返回后才重新填充，这段空白期体感较长。

根因有两层：

1. **前端（已修复）**：`loadHistory()` 命中 HEAD 变化时先执行 `commits.value = []`，把旧列表整体清空再重新拉取。
2. **后端（未动）**：`git_get_incremental_commits` 单次调用本身存在与 `limit` 几乎无关的固定耗时，放大了空白期。

## 一、前端修复（已实施）

`src/tools/git-committer/components/RightSidebar.vue` 改为 stale-while-revalidate：

- 同仓库、同分支的 HEAD 更新（提交后）走静默刷新：`keepExisting` 路径不清空 `commits`，旧列表保持可见，新数据到达后整体替换。
- 全屏加载占位只在列表为空时出现（`isLoadingHistory && commits.length === 0`），刷新中改在标题栏显示一个小 spinner。
- 刷新时保留仍存在的提交的展开状态与文件缓存，仅清理已消失的提交（`resetInteractionState(keepExisting)`）。
- 修复原逻辑的失败误判：`wrapAsync` 返回 `null` 时不再误置 `hasMoreHistory = false` 或清空列表。
- 仓库 / 分支切换仍走完全重置路径，行为不变。

回归测试：`RightSidebar.test.ts` 的「keeps the previous commit list visible while refreshing after HEAD changes」用例，模拟慢速 IPC，断言刷新期间旧列表可见且无整块加载占位。

## 二、后端单次调用耗时成分（实测）

### 测试环境

| 项 | 值 |
| --- | --- |
| 仓库 | 本仓库 `E:\rc20\allinweb\aiohub-dev`（自测） |
| 分支 | `dev` |
| 可达提交数 | 5271 |
| 对象数 | in-pack 91169，34 个 pack，约 208 MB |
| refs | tags 70，分支 101（本地 + 远程） |
| commit-graph | 已存在 |
| 构建 | release |
| 平台 | Windows |

### 测量方法

临时新增 `src-tauri/examples/bench_commits.rs`，用 `git2` 复刻 `get_commits_with_skip`（`include_files = false`，即历史列表实际走的路径）并分段计时，每参数跑 3 轮取稳定值，测量后已删除该文件。

被测量命令：`git_get_incremental_commits` → `commands/git_analyzer.rs` 的 `get_commits_with_skip`。

### 成分数据（`skip = 0`，热缓存稳定值）

| 阶段 | 耗时 | 占比 | 与 limit 关系 |
| --- | --- | --- | --- |
| `Repository::open` | ~4 ms（冷 ~13 ms） | ~3% | 固定，每次调用重复 |
| `find_reference`（定位分支 tip） | ~0.4 ms | <1% | 固定 |
| `revwalk` 构造 + push + `set_sorting` | ~5 ms | ~3% | 固定 |
| **`Sort::TIME` 首次 `next()`（排序准备）** | **~100–120 ms** | **~72%** | **固定，与 limit 无关** |
| `get_all_tags_map`（遍历全部 tag + peel） | ~10 ms | ~7% | 固定，每次调用重复 |
| `get_branch_tips_map`（本地 + 远程分支 peel） | ~8 ms | ~5% | 固定，每次调用重复 |
| 解析 commit（读对象、author、message、parents、字符串化） | 30 个 ~0.2 ms；200 个 ~0.7 ms | ~0% | 随 limit 线性但极小 |
| **单次总计** | **~145 ms**（`limit=30`）；~157 ms（`limit=200`） | | |

### 关键结论

1. 单次耗时几乎全是**固定成本**，与取多少条基本无关：`limit=30`（~145 ms）与 `limit=200`（~157 ms）差异只有 ~12 ms，其中真正的「解析 200 个」增量仅约 0.5 ms。
2. **约 72% 花在 `Sort::TIME` 的排序准备上**。libgit2 要按提交时间倒序，必须先遍历 HEAD 可达的整张提交图（本仓库 5271 个）灌入时间优先队列，才能确定最新一条，因此首次 `next()` 就是 ~100 ms。commit-graph 已存在但对 libgit2 的 TIME 排序几乎没有加速作用。
3. 其余约 27 ms 是 `open` + `revwalk init` + `tags_map` + `branch_tips` 的重复固定开销，后两者每次都全量遍历 refs。

## 三、排序方式对照

同一轮实测，`limit = 30`：

| 排序方式 | 首次 `next()` | 首次后继续取 30 个 | 备注 |
| --- | --- | --- | --- |
| `Sort::TIME`（现状） | ~100–120 ms | ~0.2 ms | 严格按提交时间倒序 |
| `Sort::TOPOLOGICAL` | ~10 ms | ~0.14 ms | 保证后代先于祖先，通常接近时间序 |
| 默认 `Sort::NONE` | ~0.4 ms | ~4 ms | 最快，但不保证严格顺序 |

`limit = 200` 时 `Sort::NONE` 全取约 27 ms，`Sort::TOPOLOGICAL` 约 30 ms 量级。

## 四、待定的后端优化项（暂不实施）

按收益排序，均未动手：

1. **替换排序方式**（收益最大，但唯一有行为风险）：`Sort::TIME` → `Sort::TOPOLOGICAL`，单次可从 ~145 ms 降到 ~15–40 ms（约 -75%），仍保证拓扑序；或改 `Sort::NONE` 最快，但不保证严格顺序。二者都可能让合并 / 变基历史的显示顺序与当前严格时间序有差异，**需先确认 UI 能接受**。
2. **缓存 refs 映射**：`tags_map` / `branch_tips` 各 ~8–10 ms，按仓库加短 TTL（或按 refs mtime 失效）可省约 18 ms。
3. **缓存 `Repository` 实例**：省 4–13 ms 的 `open`。

当前判断：前端修复已消除体感问题，上述后端优化收益明确但与排序语义绑定，暂缓执行，等有实际性能反馈时再定。

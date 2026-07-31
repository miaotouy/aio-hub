# Media Generator 计划文档索引

> 状态：主体代码已实施，测试与真实运行验收待收口
>
> 最近盘点：2026-07-23
>
> 桌面端总计划见 [桌面端计划总览](../../../../../docs/Plan/README.md)。

## 当前收口入口

- [MiniMax Music 适配计划](./minimax-music-adapter-plan.md)：歌词生成、音乐生成、一步翻唱、参数 UI、音频入库与适配器定向测试已实施；补 provider/模型能力测试和真实 API、入库、中止验收。
- [MiniMax Music 第二阶段：两步翻唱](./MiniMax二步翻唱支持.md)：预处理 API、工作流状态、歌词编辑、过期校验和 feature 模式已实施；补过期/结构解析 workflow 单测及 URL、附件、重试的真实验收。

## 上游 API 资料

以下文件是施工时保存的 MiniMax API 参考，不是独立待办：

- [歌词生成](./minimax/歌词生成.md)
- [音乐生成](./minimax/音乐生成.md)
- [翻唱前处理](./minimax/翻唱前处理.md)

MiniMax Music 使用区域 Host：国际版为 `https://api.minimax.io`，中国大陆版为 `https://api.minimaxi.com`。两者的 API Key 不可跨区域复用；当前 AIO Hub preset/provider/adapter 默认使用中国大陆 Host（`.com`），需要切换区域时必须同时更换 Host 和 API Key。依据：[国际版 Music OpenAPI](https://platform.minimax.io/docs/api-reference/music/api/openapi.json)、[中国大陆版 Music OpenAPI](https://platform.minimaxi.com/docs/api-reference/music/api/openapi.json)。

后续新增媒体 Provider 或工作流时另建计划，并明确是否修改 Adapter、模型对象 `mediaGenParams`、任务持久化和资产入库。运行时继续只读取模型自身的 `mediaGenParams`，不回退合并全局元数据规则。

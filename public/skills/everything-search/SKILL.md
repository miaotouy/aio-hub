---
name: everything-search
description: "基于 Everything 的极速文件名搜索。利用 NTFS 索引实现毫秒级文件定位，支持正则、路径限制、大小/日期过滤和排序。适用于快速定位文件、查找特定类型文件、搜索项目结构等场景。"
metadata:
  version: "1.0.0"
  author: AIO Hub
  platform: windows
  requires: "Everything (voidtools.com) + es.exe CLI"
---

# Everything Search — 极速文件名搜索

基于 [Everything](https://www.voidtools.com/) 的文件名搜索能力。Everything 通过 NTFS 索引实现毫秒级全盘文件定位。

## 前置条件

- Windows 系统
- 已安装 Everything 并保持运行
- `es.exe`（Everything 命令行工具）可用。通常位于 Everything 安装目录下，或可从 [voidtools.com/downloads](https://www.voidtools.com/downloads/) 单独下载

## 环境变量

| 变量名             | 说明                                                      | 默认值      |
| ------------------ | --------------------------------------------------------- | ----------- |
| `ES_HTTP_PORT`     | Everything HTTP Server 端口（配置此项优先使用 HTTP 模式） | —           |
| `ES_HTTP_HOST`     | Everything HTTP Server 绑定地址                           | `127.0.0.1` |
| `ES_HTTP_USER`     | Everything HTTP Server 用户名（如设置了认证）             | —           |
| `ES_HTTP_PASSWORD` | Everything HTTP Server 密码（如设置了认证）               | —           |
| `ES_PATH`          | `es.exe` 的完整路径（配置此项优先使用 CLI 模式）          | 自动探测    |

### 引擎优先级

脚本根据配置的环境变量自动决定使用哪种引擎：

- **配置了 `ES_HTTP_PORT`** → 优先 HTTP Server（推荐，无需额外下载）
- **配置了 `ES_PATH`** → 优先 CLI (es.exe)
- **都配置了** → HTTP 优先（更轻量）
- **都没配置** → 自动探测 es.exe 常见路径，再尝试 HTTP (端口 80)

### 配置方式 A：HTTP Server（推荐）

1. 打开 Everything → 工具 → 选项 → HTTP 服务器
2. 勾选"启用 HTTP 服务器"，记住端口号
3. 在技能管理中设置 `ES_HTTP_PORT` 为对应端口（如 `8025`）
4. 如果修改了绑定接口（非 127.0.0.1），设置 `ES_HTTP_HOST`
5. 如果设置了用户名/密码，设置 `ES_HTTP_USER` 和 `ES_HTTP_PASSWORD`

### 配置方式 B：es.exe CLI

1. 从 [voidtools 下载页](https://www.voidtools.com/downloads/#cli) 下载 ES-x.x.x.x.zip
2. 解压 `es.exe` 到 Everything 安装目录
3. 在技能管理中设置 `ES_PATH`（如 `C:\Program Files\Everything\es.exe`）

## 使用方式

通过 `skill:system.skill_run_script` 调用搜索脚本：

```bash
npx everything-search search.ts <JSON参数>
```

### 参数格式（JSON 字符串）

```json
{
  "query": "搜索表达式",
  "maxResults": 50,
  "sort": "name",
  "sortAscending": true,
  "matchCase": false,
  "matchWholeWord": false,
  "matchRegex": false,
  "pathFilter": "C:\\Projects"
}
```

### 参数说明

| 参数             | 类型    | 必填 | 默认值  | 说明                                                          |
| ---------------- | ------- | ---- | ------- | ------------------------------------------------------------- |
| `query`          | string  | ✅   | —       | 搜索表达式，支持 Everything 原生语法                          |
| `maxResults`     | number  | —    | 50      | 最大返回结果数（0 = 无限制）                                  |
| `sort`           | string  | —    | `name`  | 排序方式：`name`/`path`/`size`/`date-modified`/`date-created` |
| `sortAscending`  | boolean | —    | `true`  | 是否升序排列                                                  |
| `matchCase`      | boolean | —    | `false` | 是否区分大小写                                                |
| `matchWholeWord` | boolean | —    | `false` | 是否全词匹配                                                  |
| `matchRegex`     | boolean | —    | `false` | 是否使用正则表达式                                            |
| `pathFilter`     | string  | —    | —       | 限制搜索范围到指定目录                                        |

### Everything 查询语法速查

`query` 字段支持 Everything 的原生搜索语法，非常强大：

| 语法         | 说明         | 示例                                                  |
| ------------ | ------------ | ----------------------------------------------------- | ------- | ------- |
| `ext:扩展名` | 按扩展名过滤 | `ext:ts;vue;tsx`                                      |
| `path:目录`  | 限制路径     | `path:E:\project *.ts`                                |
| `size:范围`  | 按大小过滤   | `size:>1mb`, `size:10kb..5mb`                         |
| `dm:日期`    | 按修改日期   | `dm:today`, `dm:last2weeks`                           |
| `dc:日期`    | 按创建日期   | `dc:2024`                                             |
| `folder:`    | 只搜索文件夹 | `folder: node_modules`                                |
| `file:`      | 只搜索文件   | `file: *.config.*`                                    |
| `!`          | 排除         | `*.ts !node_modules !dist`                            |
| `            | `            | 或                                                    | `\*.vue | \*.tsx` |
| `""`         | 精确匹配     | `"package.json"`                                      |
| `parent:`    | 直接父目录名 | `parent:src *.ts`                                     |
| `startwith:` | 文件名开头   | `startwith:index`                                     |
| `endwith:`   | 文件名结尾   | `endwith:.config.ts`                                  |
| `content:`   | 文件内容搜索 | `content:"TODO" ext:ts`（需 Everything 开启内容索引） |

### 组合示例

```json
{ "query": "ext:vue path:E:\\my-project" }
```

搜索 E:\my-project 下所有 .vue 文件

```json
{ "query": "*.ts !node_modules !dist", "pathFilter": "E:\\workspace", "maxResults": 100 }
```

搜索 workspace 下所有 TS 文件，排除 node_modules 和 dist

```json
{ "query": "size:>10mb ext:log", "sort": "size", "sortAscending": false }
```

查找大于 10MB 的日志文件，按大小降序

```json
{ "query": "dm:today ext:ts;vue;tsx", "sort": "date-modified", "sortAscending": false }
```

查找今天修改过的前端源码文件

## 与其他工具的配合

- **文件名/路径搜索** → 使用本技能（极速，基于索引）
- **文件内容搜索** → 使用 `dir-search` 工具（逐文件扫描，支持上下文）
- **目录结构浏览** → 使用 `directory-tree` 工具

## 输出格式

脚本返回 JSON 格式结果：

```json
{
  "success": true,
  "count": 15,
  "query": "ext:vue path:E:\\project",
  "results": ["E:\\project\\src\\App.vue", "E:\\project\\src\\components\\Header.vue"],
  "truncated": false,
  "durationMs": 12
}
```

错误时返回：

```json
{
  "success": false,
  "error": "es.exe 未找到，请确认 Everything 已安装并配置 ES_PATH 环境变量"
}
```

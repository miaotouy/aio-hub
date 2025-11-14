# RichCodeEditor 使用示例

`RichCodeEditor` 是一个支持双编辑器引擎的富文本代码编辑器组件，支持 CodeMirror 和 Monaco Editor 两种编辑器。

## 功能特性

- 🔄 **双引擎支持**: 通过参数切换 CodeMirror 或 Monaco Editor
- 🎨 **主题适配**: 自动适配全局 CSS 变量主题
- 📝 **多语言支持**: JavaScript, JSON, Markdown 等
- ⚙️ **灵活配置**: 支持只读模式、行号显示等配置
- 🔌 **统一 API**: 两种编辑器提供统一的操作方法
- 🆚 **差异对比**: 内置 Monaco Diff Editor，轻松对比文本差异

## 基础用法

### 使用 CodeMirror (默认)

```vue
<template>
  <RichCodeEditor
    v-model="code"
    language="javascript"
    :line-numbers="true"
    :read-only="false"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import RichCodeEditor from '@/components/common/RichCodeEditor.vue';

const code = ref('console.log("Hello World");');
</script>
```

### 使用 Monaco Editor

```vue
<template>
  <RichCodeEditor
    v-model="code"
    language="javascript"
    editor-type="monaco"
    :line-numbers="true"
    :read-only="false"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import RichCodeEditor from '@/components/common/RichCodeEditor.vue';

const code = ref('console.log("Hello from Monaco!");');
</script>
```

## Diff 模式 (差异对比)

通过设置 `diff` 属性，编辑器将切换到 Monaco Diff Editor 模式，用于展示两个文本版本的差异。

```vue
<template>
  <RichCodeEditor
    :diff="true"
    :original="originalCode"
    :modified="modifiedCode"
    language="javascript"
    style="height: 400px;"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import RichCodeEditor from '@/components/common/RichCodeEditor.vue';

const originalCode = ref('const a = 1;');
const modifiedCode = ref('const a = 2;\nconsole.log(a);');
</script>
```

## Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `modelValue` | `string` | - | 编辑器内容 (v-model) |
| `language` | `'json' \| 'markdown' \| 'javascript' \| 'text' \| string` | - | 语言类型 |
| `readOnly` | `boolean` | `false` | 是否只读 |
| `lineNumbers` | `boolean` | `true` | 是否显示行号 |
| `editorType` | `'codemirror' \| 'monaco'` | `'codemirror'` | 编辑器类型 |
| `diff` | `boolean` | `false` | 是否开启 Diff 模式 |
| `original` | `string` | `''` | Diff 模式下的原始文本 |
| `modified` | `string` | `''` | Diff 模式下的修改后文本 |
| `options` | `object` | `{}` | Monaco Editor 的高级配置项 |

## 支持的语言

### CodeMirror
- `javascript` / `js`
- `json`
- `markdown` / `md`
- `text` (纯文本)

### Monaco Editor
- 除了上述语言外，还支持 Monaco 内置的所有语言
- 例如: `typescript`, `html`, `css`, `python`, `go` 等

## 暴露的方法

通过 `ref` 访问组件实例可以调用以下方法：

```vue
<template>
  <RichCodeEditor ref="editorRef" v-model="code" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import RichCodeEditor from '@/components/common/RichCodeEditor.vue';

const editorRef = ref();
const code = ref('');

// 获取内容
const content = editorRef.value?.getContent();

// 设置内容
editorRef.value?.setContent('new content');

// 聚焦编辑器
editorRef.value?.focusEditor();
</script>
```

### 方法列表

- `getContent(): string` - 获取编辑器当前内容
- `setContent(newContent: string): void` - 设置编辑器内容
- `focusEditor(): void` - 聚焦编辑器

### 访问底层编辑器实例

```typescript
// 访问 CodeMirror 实例 (当 editorType === 'codemirror')
const cmEditor = editorRef.value?.editorView;

// 访问 Monaco Editor 实例 (当 editorType === 'monaco')
const monacoEditor = editorRef.value?.monacoEditorInstance;
```

## 完整示例

### 示例 1: JSON 编辑器

```vue
<template>
  <div class="json-editor-demo">
    <h3>JSON 编辑器</h3>
    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
      <el-radio-group v-model="editorType">
        <el-radio-button value="codemirror">CodeMirror</el-radio-button>
        <el-radio-button value="monaco">Monaco</el-radio-button>
      </el-radio-group>
      <el-switch v-model="readOnly" active-text="只读" />
      <el-switch v-model="showLineNumbers" active-text="行号" />
    </div>
    
    <RichCodeEditor
      ref="editorRef"
      v-model="jsonContent"
      language="json"
      :editor-type="editorType"
      :read-only="readOnly"
      :line-numbers="showLineNumbers"
      style="height: 400px;"
    />
    
    <div style="margin-top: 10px;">
      <el-button @click="formatJson">格式化</el-button>
      <el-button @click="validateJson">验证</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import RichCodeEditor from '@/components/common/RichCodeEditor.vue';
import { ElMessage } from 'element-plus';

const editorRef = ref();
const editorType = ref<'codemirror' | 'monaco'>('codemirror');
const readOnly = ref(false);
const showLineNumbers = ref(true);

const jsonContent = ref(`{
  "name": "example",
  "version": "1.0.0"
}`);

const formatJson = () => {
  try {
    const content = editorRef.value?.getContent() || '';
    const parsed = JSON.parse(content);
    const formatted = JSON.stringify(parsed, null, 2);
    editorRef.value?.setContent(formatted);
    ElMessage.success('格式化成功');
  } catch (error) {
    ElMessage.error('JSON 格式错误');
  }
};

const validateJson = () => {
  try {
    const content = editorRef.value?.getContent() || '';
    JSON.parse(content);
    ElMessage.success('JSON 格式正确');
  } catch (error) {
    ElMessage.error('JSON 格式错误: ' + error.message);
  }
};
</script>
```

### 示例 2: Markdown 预览器

```vue
<template>
  <div class="markdown-demo">
    <h3>Markdown 编辑器</h3>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <div>
        <h4>编辑区 ({{ editorType }})</h4>
        <RichCodeEditor
          v-model="markdown"
          language="markdown"
          :editor-type="editorType"
          style="height: 500px;"
        />
      </div>
      <div>
        <h4>预览区</h4>
        <div v-html="renderedMarkdown" class="markdown-preview" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import RichCodeEditor from '@/components/common/RichCodeEditor.vue';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt();
const editorType = ref<'codemirror' | 'monaco'>('monaco');

const markdown = ref(`# Hello Markdown

This is a **markdown** editor with live preview.

- Item 1
- Item 2
- Item 3

\`\`\`javascript
console.log('Hello World');
\`\`\`
`);

const renderedMarkdown = computed(() => md.render(markdown.value));
</script>

<style scoped>
.markdown-preview {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--card-bg);
  min-height: 500px;
}
</style>
```

## 编辑器对比

### CodeMirror
- ✅ 轻量级，加载快
- ✅ 更简洁的 UI
- ✅ 适合简单场景
- ❌ 功能相对较少

### Monaco Editor
- ✅ VS Code 同款编辑器
- ✅ 功能强大 (智能提示、代码片段等)
- ✅ 支持更多语言
- ❌ 体积较大

## 注意事项

1. **性能考虑**: 对于大文件 (>1MB)，Monaco Editor 性能更好
2. **主题适配**: 两种编辑器都会自动适配全局 CSS 变量主题
3. **切换编辑器**: 运行时切换 `editorType` 会重新创建编辑器实例
4. **双向绑定**: 使用 `v-model` 时内容会自动同步

## 样式定制

编辑器使用以下 CSS 变量，可通过全局主题系统调整：

- `--text-color`: 文本颜色
- `--input-bg`: 编辑器背景色
- `--border-color`: 边框颜色
- `--primary-color`: 主题色
- `--scrollbar-thumb-color`: 滚动条颜色
- 等等...
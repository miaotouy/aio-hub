<script setup lang="ts">
import { ref } from 'vue';
import { ElRadioGroup, ElRadioButton } from 'element-plus';
import DocumentViewer from '@/components/common/DocumentViewer.vue';

const markdownContent = ref(`
# 你好，文档查看器！

这是一个用于渲染 Markdown 内容的测试。

- 功能特性 1
- 功能特性 2
- 功能特性 3

> 这是一个引用块的示例。

\`\`\`json
{
  "name": "AIO Hub",
  "version": "1.0.0",
  "description": "面向开发者的一体化工具箱。"
}
\`\`\`
`);

const jsonContent = ref(JSON.stringify({
  "theme": "dark",
  "port": 3000,
  "features": {
    "enabled": ["llm-proxy", "asset-manager"],
    "disabled": []
  }
}, null, 2));

const jsonEditorType = ref<'codemirror' | 'monaco'>('codemirror');

const textContent = ref("这是一个用于测试查看器的纯文本文件。");

const binaryContent = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
</script>

<template>
  <div class="document-viewer-tester">
    <h2>文档查看器组件测试器</h2>

    <div class="tester-grid">
      <div class="test-case">
        <h3>Markdown 预览（来自字符串）</h3>
        <DocumentViewer 
          :content="markdownContent" 
          file-name="example.md" 
          class="viewer-instance" 
        />
      </div>

      <div class="test-case">
        <h3>JSON 源码视图（来自字符串）</h3>
        <el-radio-group v-model="jsonEditorType" size="small" class="editor-switch">
          <el-radio-button label="codemirror">CodeMirror</el-radio-button>
          <el-radio-button label="monaco">Monaco</el-radio-button>
        </el-radio-group>
        <DocumentViewer
          :content="jsonContent"
          file-name="config.json"
          :editor-type="jsonEditorType"
          class="viewer-instance"
        />
      </div>
      
      <div class="test-case">
        <h3>纯文本视图</h3>
        <DocumentViewer 
          :content="textContent" 
          file-name="plain.txt" 
          class="viewer-instance" 
        />
      </div>

      <div class="test-case">
        <h3>二进制文件占位符</h3>
        <DocumentViewer 
          :content="binaryContent" 
          file-name="image.png"
          class="viewer-instance" 
        />
      </div>

      <div class="test-case">
        <h3>空内容</h3>
        <DocumentViewer 
          file-name="empty.txt"
          class="viewer-instance" 
        />
      </div>

      <div class="test-case">
        <h3>加载失败: 文件不存在</h3>
        <DocumentViewer
          file-path="simulated/non-existent/path.txt"
          class="viewer-instance"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.document-viewer-tester {
  padding: 16px;
}

h2, h3 {
  margin-bottom: 12px;
}

.tester-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 24px;
}

.test-case {
  display: flex;
  flex-direction: column;
}

.editor-switch {
  margin-bottom: 8px;
}

.viewer-instance {
  width: 100%;
  height: 400px;
  flex-grow: 1;
}
</style>
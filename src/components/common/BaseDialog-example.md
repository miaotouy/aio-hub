# BaseDialog 使用示例

一个干净、灵活的对话框组件，解决了 Element Plus Dialog 的各种样式问题。

## 基本特性

- ✅ 真正居中（无默认上边距）
- ✅ 精确的高度控制
- ✅ 干净的样式结构
- ✅ 完美的滚动处理
- ✅ 支持 bare 模式
- ✅ 平滑的动画效果

## 基本用法

```vue
<template>
  <BaseDialog
    v-model:visible="dialogVisible"
    title="对话框标题"
    width="600px"
    height="auto"
  >
    <template #content>
      <p>这是对话框内容</p>
    </template>
    
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" @click="handleConfirm">确定</el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import BaseDialog from '@/components/common/BaseDialog.vue';

const dialogVisible = ref(false);

const handleConfirm = () => {
  console.log('确认');
  dialogVisible.value = false;
};
</script>
```

## 固定高度（解决溢出问题）

```vue
<template>
  <BaseDialog
    v-model:visible="dialogVisible"
    title="固定高度对话框"
    width="800px"
    height="80vh"
  >
    <template #content>
      <div class="long-content">
        <!-- 内容会自动滚动，不会溢出 -->
        <p v-for="i in 50" :key="i">第 {{ i }} 行内容</p>
      </div>
    </template>
  </BaseDialog>
</template>
```

## 响应式高度

```vue
<template>
  <BaseDialog
    v-model:visible="dialogVisible"
    title="响应式对话框"
    width="90%"
    height="calc(100vh - 100px)"
  >
    <!-- 内容会根据视口自动调整 -->
  </BaseDialog>
</template>
```

## Bare 模式（无样式）

```vue
<template>
  <BaseDialog
    v-model:visible="dialogVisible"
    :bare="true"
    width="500px"
    :show-close-button="false"
    :close-on-backdrop-click="false"
  >
    <template #content>
      <div class="custom-dialog">
        <!-- 完全自定义的样式 -->
      </div>
    </template>
  </BaseDialog>
</template>
```

## 自定义头部

```vue
<template>
  <BaseDialog v-model:visible="dialogVisible">
    <template #header>
      <div class="custom-header">
        <el-icon><Setting /></el-icon>
        <span>自定义头部</span>
      </div>
    </template>
    
    <template #content>
      内容区域
    </template>
  </BaseDialog>
</template>
```

## 不使用插槽语法（更简洁）

```vue
<template>
  <BaseDialog
    v-model:visible="dialogVisible"
    title="简洁写法"
  >
    <!-- 直接写内容，不用 #content -->
    <p>这样也可以</p>
    
    <template #footer>
      <el-button @click="dialogVisible = false">关闭</el-button>
    </template>
  </BaseDialog>
</template>
```

## Props 说明

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| visible | boolean | false | 是否显示对话框 |
| title | string | - | 对话框标题 |
| width | string | '600px' | 宽度（支持 px、%、vw 等） |
| height | string | 'auto' | 高度（支持 px、vh、% 等） |
| showCloseButton | boolean | true | 是否显示关闭按钮 |
| closeOnBackdropClick | boolean | true | 点击遮罩层是否关闭 |
| bare | boolean | false | 是否使用无样式模式 |
| dialogClass | string | '' | 对话框容器的自定义类名 |
| contentClass | string | '' | 内容区域的自定义类名 |
| zIndex | number | 2000 | z-index 层级 |

## 事件

| 事件名 | 参数 | 说明 |
|--------|------|------|
| update:visible | (value: boolean) | 对话框显示状态变化 |
| close | - | 对话框关闭时触发 |

## 插槽

| 插槽名 | 说明 |
|--------|------|
| header | 自定义头部内容 |
| content | 对话框内容（也可以直接使用默认插槽） |
| footer | 底部按钮区域 |

## 对比 Element Plus Dialog

### Element Plus Dialog 的问题

```vue
<!-- ❌ 问题：有默认 15vh 上边距，不是真正居中 -->
<el-dialog v-model="visible" width="80%">
  <div class="content">内容</div>
</el-dialog>

<style scoped>
/* ❌ 需要通过深度选择器覆盖各种内置样式 */
:deep(.el-dialog) {
  margin-top: 5vh !important; /* 强制覆盖 */
  max-height: 80vh;
}

:deep(.el-dialog__body) {
  max-height: calc(90vh - 120px); /* 复杂的计算 */
  overflow-y: auto;
}
</style>
```

### BaseDialog 的优势

```vue
<!-- ✅ 简洁：真正居中，精确控制 -->
<BaseDialog 
  v-model:visible="visible" 
  width="80%" 
  height="80vh"
>
  <div class="content">内容</div>
</BaseDialog>

<!-- 🎉 不需要任何额外的样式覆盖！ -->
```

## 实战示例：编辑智能体对话框

```vue
<template>
  <BaseDialog
    v-model:visible="visible"
    :title="mode === 'edit' ? '编辑智能体' : '创建智能体'"
    width="80%"
    height="85vh"
    :close-on-backdrop-click="false"
  >
    <el-form :model="form" label-width="100px">
      <el-form-item label="名称">
        <el-input v-model="form.name" />
      </el-form-item>
      
      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" :rows="3" />
      </el-form-item>
      
      <!-- 更多表单项... -->
    </el-form>
    
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleSave">
        {{ mode === 'edit' ? '保存' : '创建' }}
      </el-button>
    </template>
  </BaseDialog>
</template>
```

## 高度计算说明

### Element Plus 的问题
```
对话框实际高度 = 设置的高度 + 15vh margin-top + body padding + header padding + footer padding
```
结果：即使设置了 `80vh`，实际可能超出视口导致溢出

### BaseDialog 的解决方案
```
对话框实际高度 = 设置的高度（精确）
内容区自动滚动 = height - header - footer
```
结果：精确可控，永不溢出

## 常见问题

### Q: 如何让对话框内容自适应高度？
A: 使用 `height="auto"`（默认值）

### Q: 如何让对话框占据屏幕的大部分？
A: 使用 `width="90%" height="90vh"`

### Q: 如何禁用 ESC 键关闭？
A: 设置 `:show-close-button="false"`

### Q: 如何自定义遮罩层透明度？
A: 可以通过 CSS 变量覆盖：
```css
.base-dialog-backdrop {
  background-color: rgba(0, 0, 0, 0.7) !important;
}
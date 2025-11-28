# Avatar 使用示例

一个通用的头像组件，支持图片、Emoji 和文字回退等多种显示模式。

## 基本特性

- ✅ 自动识别图片路径、Emoji 和普通文字
- ✅ 图片加载失败自动回退到文字
- ✅ 支持多种形状（圆形、方形）
- ✅ 支持自定义尺寸
- ✅ 支持 appdata:// 路径自动转换
- ✅ 完善的错误处理
- ✅ 支持 Windows/UNC 本地绝对路径

## 基本用法

### 显示图片头像

```vue
<template>
  <!-- 本地图片 -->
  <Avatar src="/assets/user.png" alt="用户" />
  
  <!-- 网络图片 -->
  <Avatar src="https://example.com/avatar.jpg" alt="用户" />
  
  <!-- appdata:// 路径 -->
  <Avatar src="appdata://icons/agent.png" alt="智能体" />
  
  <!-- 本地绝对路径 -->
  <Avatar src="C:\Users\User\Pictures\avatar.png" alt="本地" />
</template>

<script setup lang="ts">
import Avatar from '@/components/common/Avatar.vue';
</script>
```

### 显示 Emoji

```vue
<template>
  <Avatar src="🤖" alt="机器人" />
  <Avatar src="👤" alt="用户" />
  <Avatar src="⚙️" alt="系统" />
</template>
```

### 显示文字回退

```vue
<template>
  <!-- 当图片加载失败时，会显示 alt 的首字母 -->
  <Avatar src="/nonexistent.png" alt="张三" />
  <!-- 显示: Z -->
  
  <!-- 当没有 alt 时，显示 src 的首字符 -->
  <Avatar src="Admin" />
  <!-- 显示: A -->
</template>
```

## 自定义尺寸

```vue
<template>
  <!-- 小尺寸 -->
  <Avatar :size="24" src="👤" />
  
  <!-- 默认尺寸 -->
  <Avatar :size="40" src="👤" />
  
  <!-- 大尺寸 -->
  <Avatar :size="64" src="👤" />
  
  <!-- 超大尺寸 -->
  <Avatar :size="128" src="/avatar.png" alt="用户" />
</template>
```

## 自定义形状

```vue
<template>
  <!-- 方形（默认） -->
  <Avatar shape="square" src="🤖" />
  
  <!-- 圆形 -->
  <Avatar shape="circle" src="👤" />
  
  <!-- 方形带自定义圆角 -->
  <Avatar 
    shape="square" 
    :radius="12" 
    src="/avatar.png" 
    alt="用户"
  />
</template>
```

## 自定义样式

```vue
<template>
  <!-- 自定义背景色 -->
  <Avatar 
    src="A" 
    backgroundColor="#4CAF50" 
  />
  
  <!-- 无边框 -->
  <Avatar 
    src="👤" 
    :border="false" 
  />
  
  <!-- 组合样式 -->
  <Avatar 
    :size="80"
    shape="circle"
    src="/avatar.png"
    alt="用户"
    backgroundColor="#f5f5f5"
    :border="true"
  />
</template>
```

## Props 说明

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| src | string | (必填) | 头像源：图片 URL、appdata:// 路径、Emoji 或文字 |
| size | number | 40 | 头像尺寸（px） |
| shape | 'circle' \| 'square' | 'square' | 头像形状 |
| radius | number | 6 | 圆角大小（仅当 shape 为 square 时生效，px） |
| alt | string | '' | 备用文字（图片加载失败时显示首字符） |
| backgroundColor | string | '' | 背景色（默认使用主题色 --container-bg） |
| border | boolean | true | 是否显示边框 |

## 实战示例

### 在聊天消息中使用

```vue
<template>
  <div class="message-header">
    <Avatar
      :src="agent.icon"
      :alt="agent.name"
      :size="40"
      shape="square"
      :radius="6"
    />
    <div class="message-info">
      <span class="name">{{ agent.name }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import Avatar from '@/components/common/Avatar.vue';

interface Agent {
  icon: string;
  name: string;
}

defineProps<{
  agent: Agent;
}>();
</script>

<style scoped>
.message-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.message-info {
  display: flex;
  flex-direction: column;
}

.name {
  font-weight: 600;
}
</style>
```

### 用户列表

```vue
<template>
  <div class="user-list">
    <div 
      v-for="user in users" 
      :key="user.id"
      class="user-item"
    >
      <Avatar
        :src="user.avatar || user.name"
        :alt="user.name"
        :size="32"
        shape="circle"
      />
      <span>{{ user.name }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import Avatar from '@/components/common/Avatar.vue';

interface User {
  id: string;
  name: string;
  avatar?: string;
}

const users = ref<User[]>([
  { id: '1', name: '张三', avatar: '/avatars/zhangsan.jpg' },
  { id: '2', name: '李四' }, // 无头像，显示 "李" 
  { id: '3', name: 'Admin', avatar: '👨‍💼' }
]);
</script>
```

### 多种尺寸展示

```vue
<template>
  <div class="avatar-showcase">
    <Avatar :size="24" src="👤" />
    <Avatar :size="32" src="👤" />
    <Avatar :size="40" src="👤" />
    <Avatar :size="48" src="👤" />
    <Avatar :size="64" src="👤" />
  </div>
</template>

<style scoped>
.avatar-showcase {
  display: flex;
  align-items: center;
  gap: 16px;
}
</style>
```

### 智能体头像组

```vue
<template>
  <div class="agent-grid">
    <div 
      v-for="agent in agents" 
      :key="agent.id"
      class="agent-card"
    >
      <Avatar
        :src="agent.icon"
        :alt="agent.name"
        :size="64"
        shape="square"
        :radius="12"
      />
      <h3>{{ agent.name }}</h3>
      <p>{{ agent.description }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import Avatar from '@/components/common/Avatar.vue';

const agents = [
  {
    id: '1',
    name: '代码助手',
    icon: '👨‍💻',
    description: '帮助你编写代码'
  },
  {
    id: '2',
    name: '翻译助手',
    icon: '🌐',
    description: '多语言翻译'
  },
  {
    id: '3',
    name: '创意作家',
    icon: '✍️',
    description: '内容创作专家'
  }
];
</script>

<style scoped>
.agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 24px;
}

.agent-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 24px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.agent-card h3 {
  margin-top: 12px;
  font-size: 16px;
  font-weight: 600;
}

.agent-card p {
  margin-top: 4px;
  font-size: 14px;
  color: var(--text-color-secondary);
}
</style>
```

## 设计原理

### 自动识别逻辑

```
1. 判断 src 是否为图片路径
   - 以 / 开头
   - 以 http:// 或 https:// 开头
   - 以 appdata:// 开头
   - 以 data: 开头
   - Windows 绝对路径 (C:\...)
   - UNC 路径 (\\...)
   → 是：渲染 <img>

2. 判断 src 是否为 Emoji
   - 长度 <= 4
   - 包含 Emoji Unicode 范围
   → 是：渲染 Emoji

3. 其他情况
   → 渲染文字回退（取首字符）
```

### 错误处理

```
图片加载失败
  ↓
imageLoadFailed = true
  ↓
显示 fallbackText
```

### 路径处理

```txt
appdata://icons/agent.png  或  C:\path\to\image.png
  ↓
调用 @/utils/avatarImageCache
  ↓
blob:http://localhost:1420/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```
- **说明**: 为了安全和高效地加载本地文件（`appdata://` 或绝对路径），组件会通过 `avatarImageCache` 服务将文件路径转换为临时的 Blob URL。这可以避免直接暴露文件系统路径，并利用浏览器缓存机制。

## 常见问题

### Q: 如何让头像显示为圆形？
A: 设置 `shape="circle"`

```vue
<Avatar shape="circle" src="👤" />
```

### Q: 图片加载失败时显示什么？
A: 会显示 `alt` 属性的首字符（大写），如果没有 `alt` 则显示 `src` 的首字符

```vue
<Avatar src="/broken.jpg" alt="张三" />
<!-- 显示: Z -->
```

### Q: 如何隐藏边框？
A: 设置 `:border="false"`

```vue
<Avatar :border="false" src="👤" />
```

### Q: 能否自定义 Emoji 的大小？
A: Emoji 字体大小会自动根据 `size` 调整（约为容器的 50%）

```vue
<Avatar :size="80" src="🤖" />
<!-- Emoji 约 40px -->
```

### Q: 支持哪些图片格式？
A: 支持所有浏览器支持的图片格式（jpg、png、gif、svg、webp 等）

### Q: 如何在暗色主题下使用？
A: 组件会自动使用主题的 CSS 变量，无需额外配置

## 与其他组件的区别

### vs. Element Plus Avatar

```vue
<!-- Element Plus -->
<el-avatar :size="40" src="/avatar.jpg" />

<!-- 本组件的优势 -->
<Avatar 
  :size="40" 
  src="/avatar.jpg" 
  alt="用户"
  shape="square"
  :radius="6"
/>
<!-- ✅ 更灵活的形状控制 -->
<!-- ✅ 自动处理 appdata:// 路径 -->
<!-- ✅ 智能识别 Emoji -->
<!-- ✅ 更好的错误处理 -->
```

## 最佳实践

1. **总是提供 alt 属性**，确保图片加载失败时有合适的回退显示
2. **使用合适的尺寸**，避免过大或过小影响显示效果
3. **注意性能**，大量头像时考虑使用图片懒加载
4. **主题适配**，使用 `backgroundColor` 时确保与主题颜色协调
5. **智能体头像回退策略**：
    - **推荐使用 `name` (本名/ID) 作为 `name-for-fallback` 或 `alt`**。
    - **原因**：`displayName` (显示名称) 常包含特殊符号、Emoji 前缀或装饰性字符。
        - 例如装饰风格的 **"꧁༺Alice༻꧂"** (带翅膀的名字) 或带状态的 **"✨Alice"**。
        - 如果直接提取首字符，头像会显示为 **"꧁"** 或 **"✨"**，完全无法识别身份。
    - **正确做法**：优先使用规范的 `name` (如 "Alice")，这样能稳定提取出 **"A"** 作为头像文字。
import { defineAsyncComponent, type Component, type Ref, computed } from 'vue';
import { useDetachedChatArea } from '../tools/llm-chat/composables/useDetachedChatArea';
import { useDetachedChatInput } from '../tools/llm-chat/composables/useDetachedChatInput';
import { useLlmChatStateConsumer } from '../tools/llm-chat/composables/useLlmChatStateConsumer';

/**
 * 分离逻辑钩子 (Logic Hook) 的接口定义
 *
 * @template T - 组件的 props 类型
 * @returns {{
 *   props: Ref<T>; // 响应式的 props 对象，将通过 v-bind 传递给组件
 *   listeners: Record<string, Function>; // 事件监听器对象，将通过 v-on 传递给组件
 * }}
 */
export type DetachedLogicHook<T = any> = () => {
  props: Ref<T>;
  listeners: Record<string, Function>;
};

/**
 * useDetachedChatArea 的适配器
 * 将旧的返回结构转换为新的 { props, listeners } 格式
 */
function useDetachedChatAreaAdapter(): { props: Ref<any>; listeners: Record<string, Function> } {
  const chatArea = useDetachedChatArea();
  
  return {
    props: computed(() => ({
      isDetached: true,
      messages: chatArea.messages.value,
      isSending: chatArea.isSending.value,
      disabled: chatArea.disabled.value,
      currentAgentId: chatArea.currentAgentId.value,
      currentModelId: chatArea.currentModelId.value,
    })),
    listeners: {
      send: chatArea.sendMessage,
      abort: chatArea.abortSending,
      'delete-message': chatArea.deleteMessage,
      'regenerate': chatArea.regenerateLastMessage,
      'switch-sibling': chatArea.switchSibling,
      'toggle-enabled': chatArea.toggleEnabled,
      'edit-message': chatArea.editMessage,
      'abort-node': chatArea.abortNode,
      'create-branch': chatArea.createBranch,
      'analyze-context': chatArea.analyzeContext,
    },
  };
}

/**
 * 可分离组件的注册信息接口
 */
export interface DetachableComponentRegistration {
  /**
   * 动态加载组件的函数
   */
  component: () => Promise<Component>;
  /**
   * 在分离窗口中使用的逻辑钩子
   */
  logicHook: DetachedLogicHook;
  /**
   * 可选的环境初始化钩子
   * 在组件被加载到分离容器时执行，用于设置特定的环境（如启动状态消费者）
   */
  initializeEnvironment?: () => void;
}

/**
 * 可分离组件注册表
 *
 * 这是一个中心化的配置，将组件的唯一 ID 映射到其视图和分离逻辑。
 * DetachedComponentContainer 将使用此注册表来动态加载和配置组件。
 *
 * @type {Record<string, DetachableComponentRegistration>}
 */
export const detachableComponentRegistry: Record<string, DetachableComponentRegistration> = {
  // LLM Chat: 对话区域
  'chat-area': {
    component: () => import('../tools/llm-chat/components/ChatArea.vue'),
    logicHook: useDetachedChatAreaAdapter,
    initializeEnvironment: () => useLlmChatStateConsumer({ syncAllSessions: false }),
  },
  // LLM Chat: 消息输入框
  'chat-input': {
    component: () => import('../tools/llm-chat/components/message-input/MessageInput.vue'),
    logicHook: useDetachedChatInput,
    initializeEnvironment: () => useLlmChatStateConsumer({ syncAllSessions: false }),
  },
  // 未来可以在此添加更多可分离的组件
  // 'some-other-component': {
  //   component: () => import('../tools/some-tool/components/SomeComponent.vue'),
  //   logicHook: useDetachedSomeComponent,
  // },
};

/**
 * 根据组件 ID 获取注册信息
 * @param id - 组件的唯一 ID
 * @returns {DetachableComponentRegistration | undefined}
 */
export function getDetachableComponentConfig(id: string): DetachableComponentRegistration | undefined {
  return detachableComponentRegistry[id];
}

/**
 * 根据组件 ID 动态加载组件
 * @param id - 组件的唯一 ID
 * @returns {Component | null}
 */
export function loadDetachableComponent(id: string): Component | null {
  const config = getDetachableComponentConfig(id);
  return config ? defineAsyncComponent(config.component) : null;
}
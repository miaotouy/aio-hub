<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { Snackbar } from "@varlet/ui";

const router = useRouter();
const value = ref("");
const switchValue = ref(false);
const radioValue = ref("1");
const checkboxValue = ref(["1"]);

const goBack = () => {
  router.back();
};

const showSnackbar = () => {
  Snackbar.success("这是一条成功消息");
};
</script>

<template>
  <div class="ui-tester-view">
    <var-app-bar title="UI 组件测试" title-position="center">
      <template #left>
        <var-button round text @click="goBack">
          <var-icon name="chevron-left" />
        </var-button>
      </template>
    </var-app-bar>

    <div class="content safe-area-bottom">
      <var-card title="按钮测试" class="mt-4">
        <template #description>
          <div class="button-group">
            <var-space direction="column" :size="[12, 12]">
              <var-button type="primary" block>Primary Button</var-button>
              <var-button type="success" block>Success Button</var-button>
              <var-button type="warning" block>Warning Button</var-button>
              <var-button type="danger" block>Danger Button</var-button>
              <var-button @click="showSnackbar" block>测试 Snackbar</var-button>
            </var-space>
          </div>
        </template>
      </var-card>

      <var-card title="表单组件测试" class="mt-4">
        <template #description>
          <div class="form-group">
            <var-input v-model="value" placeholder="请输入内容" />
            
            <div class="flex-row mt-4">
              <span>开关</span>
              <var-switch v-model="switchValue" />
            </div>

            <div class="mt-4">
              <var-radio-group v-model="radioValue">
                <var-radio checked-value="1">单选 1</var-radio>
                <var-radio checked-value="2">单选 2</var-radio>
              </var-radio-group>
            </div>

            <div class="mt-4">
              <var-checkbox-group v-model="checkboxValue">
                <var-checkbox checked-value="1">多选 1</var-checkbox>
                <var-checkbox checked-value="2">多选 2</var-checkbox>
              </var-checkbox-group>
            </div>
          </div>
        </template>
      </var-card>

      <var-card title="列表与单元格" class="mt-4">
        <template #description>
          <var-cell title="普通单元格" description="描述文字" />
          <var-cell title="带图标单元格" icon="account-circle" />
          <var-cell title="可点击单元格" ripple />
        </template>
      </var-card>
    </div>
  </div>
</template>

<style scoped>
.ui-tester-view {
  min-height: 100vh;
  background-color: var(--bg-color);
}

.content {
  padding: 16px;
}

.mt-4 {
  margin-top: 16px;
}

.button-group, .form-group {
  padding: 12px 0;
}

.flex-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
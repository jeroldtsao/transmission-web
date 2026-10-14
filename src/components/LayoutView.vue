<script setup lang="ts">
import { useSettingStore } from '@/store'
import { useThemeVars } from 'naive-ui'
import FileDropOverlay from '@/components/common/FileDropOverlay.vue'
const settingStore = useSettingStore()
const theme = useThemeVars()
watch(
  theme,
  () => {
    settingStore.setThemeVars(theme.value)
    // window.THEME_VARS = theme.value
  },
  {
    immediate: true,
    deep: true
  }
)
</script>

<template>
  <router-view />
  <FileDropOverlay />
</template>

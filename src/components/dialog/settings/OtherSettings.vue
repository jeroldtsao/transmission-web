<template>
  <div>
    <div class="text-lg font-medium mb-2">{{ $t('otherSettings.title') }}</div>

    <n-form :label-placement="labelType" :label-width="labelType === 'top' ? undefined : 220" :model="form">
      <n-form-item :label="$t('otherSettings.singleLine')">
        <n-switch v-model:value="form['single-line']" />
      </n-form-item>
      <n-form-item :label="$t('otherSettings.dirMenuMode')">
        <n-radio-group v-model:value="form['dir-menu-mode']">
          <n-radio-button value="list">{{ $t('otherSettings.dirMenuModeList') }}</n-radio-button>
          <n-radio-button value="tree">{{ $t('otherSettings.dirMenuModeTree') }}</n-radio-button>
        </n-radio-group>
        <n-text depth="3" style="font-size: 12px; margin-left: 8px">
          {{ $t('otherSettings.dirMenuModeHint') }}
        </n-text>
      </n-form-item>
      <n-form-item :label="$t('otherSettings.enableDownloadDirSuggestions')">
        <div style="width: 100%">
          <n-switch v-model:value="form['enable-download-dir-suggestions']" />
          <n-text depth="3" style="font-size: 12px; margin-top: 4px; display: block">
            {{ $t('otherSettings.enableDownloadDirSuggestionsHint') }}
          </n-text>
        </div>
      </n-form-item>
      <n-form-item :label="$t('otherSettings.customDownloadDirs')">
        <div style="width: 100%">
          <n-dynamic-input
            v-model:value="form['custom-download-dirs']"
            :placeholder="$t('otherSettings.customDownloadDirsPlaceholder')"
            :min="0"
            show-sort-button
            preset="input"
            @create="createCustomDownloadDir"
          />
          <n-text depth="3" style="font-size: 12px; margin-top: 4px; display: block">
            {{ $t('otherSettings.customDownloadDirsHint') }}
          </n-text>
        </div>
      </n-form-item>
      <n-form-item>
        <template #label>
          <n-checkbox v-model:checked="form['script-torrent-done-enabled']">{{
            $t('otherSettings.enableScript')
          }}</n-checkbox>
        </template>
        <n-input
          v-model:value="form['script-torrent-done-filename']"
          :placeholder="$t('otherSettings.scriptPlaceholder')"
          class="w-80"
        />
      </n-form-item>
      <n-form-item :label="$t('otherSettings.ignoredPrefixes')">
        <div style="width: 100%">
          <n-dynamic-tags v-model:value="ignoredTrackerPrefixes" @update:value="handleIgnoredPrefixesChange" />
          <n-text depth="3" style="font-size: 12px; margin-top: 4px; display: block">
            {{ $t('otherSettings.ignoredPrefixesHint') }}
          </n-text>
        </div>
      </n-form-item>
      <n-form-item :label="$t('otherSettings.defaultTrackers')">
        <n-input
          type="textarea"
          :autosize="{ minRows: 5, maxRows: 10 }"
          v-model:value="form['default-trackers']"
          :placeholder="$t('otherSettings.defaultTrackersPlaceholder')"
          class="w-80"
        />
      </n-form-item>
      <n-form-item :label="$t('otherSettings.configSync')">
        <div class="space-y-2">
          <div class="flex gap-2">
            <n-button secondary type="primary" size="small" @click="handleExportConfig">
              <template #icon>
                <n-icon :component="CloudDownloadOutline" />
              </template>
              {{ $t('otherSettings.exportConfig') }}
            </n-button>
            <n-upload
              :show-file-list="false"
              accept=".json,application/json"
              :default-upload="false"
              @change="handleImportConfig"
            >
              <n-button secondary size="small">
                <template #icon>
                  <n-icon :component="CloudUploadOutline" />
                </template>
                {{ $t('otherSettings.importConfig') }}
              </n-button>
            </n-upload>
          </div>
          <n-text depth="3" style="font-size: 12px; display: block">
            {{ $t('otherSettings.configSyncHint') }}
          </n-text>
        </div>
      </n-form-item>
    </n-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIsSmallScreen } from '@/composables/useIsSmallScreen'
import { useSettingStore } from '@/store'
import { useMessage, type UploadFileInfo } from 'naive-ui'
import { CloudDownloadOutline, CloudUploadOutline } from '@vicons/ionicons5'

const isMobile = useIsSmallScreen()
const labelType = computed(() => (isMobile ? 'top' : 'left'))
const { t: $t } = useI18n()
const settingStore = useSettingStore()
const message = useMessage()
const form = defineModel<any>('form', { required: true })

function handleExportConfig() {
  try {
    const exportData = {
      version: '1.0',
      timestamp: Date.now(),
      settings: { ...settingStore.setting }
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transmission-web-config-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    message.success($t('otherSettings.exportSuccess'))
  } catch (err) {
    console.error('Export failed', err)
  }
}

async function handleImportConfig(data: { fileList: UploadFileInfo[] }) {
  const fileInfo = data.fileList[0]
  const rawFile = fileInfo?.file
  if (!rawFile) {
    return
  }
  try {
    const text = await rawFile.text()
    const parsed = JSON.parse(text)
    const targetSettings = parsed?.settings || parsed
    if (typeof targetSettings !== 'object' || targetSettings === null) {
      throw new Error('invalid config')
    }
    // 校验并合并安全字段
    if (Array.isArray(targetSettings.customDownloadDirs)) {
      settingStore.setting.customDownloadDirs = targetSettings.customDownloadDirs.map(String).filter(Boolean)
    }
    if (typeof targetSettings.enableDownloadDirSuggestions === 'boolean') {
      settingStore.setting.enableDownloadDirSuggestions = targetSettings.enableDownloadDirSuggestions
    }
    if (targetSettings.dirMenuMode === 'list' || targetSettings.dirMenuMode === 'tree') {
      settingStore.setting.dirMenuMode = targetSettings.dirMenuMode
    }
    if (Array.isArray(targetSettings.ignoredTrackerPrefixes)) {
      settingStore.setting.ignoredTrackerPrefixes = targetSettings.ignoredTrackerPrefixes.map(String).filter(Boolean)
    }
    if (Array.isArray(targetSettings.defaultTrackers)) {
      settingStore.setting.defaultTrackers = targetSettings.defaultTrackers.map(String).filter(Boolean)
      form.value['default-trackers'] = settingStore.setting.defaultTrackers.join('\n')
    }
    if (targetSettings.theme === 'light' || targetSettings.theme === 'dark') {
      settingStore.setting.theme = targetSettings.theme
    }
    if (targetSettings.language === 'zh-CN' || targetSettings.language === 'en-US') {
      settingStore.setLanguage(targetSettings.language)
    }
    if (Array.isArray(targetSettings.trackerLimitRules)) {
      settingStore.setting.trackerLimitRules = targetSettings.trackerLimitRules
    }
    message.success($t('otherSettings.importSuccess'))
  } catch {
    message.error($t('otherSettings.importFailed'))
  }
}
// 管理忽略的 Tracker 前缀
const ignoredTrackerPrefixes = ref<string[]>([])

// 初始化时从 store 加载数据
watchEffect(() => {
  ignoredTrackerPrefixes.value = [...settingStore.setting.ignoredTrackerPrefixes]
})

// 更新 store 中的数据
const handleIgnoredPrefixesChange = (value: string[]) => {
  settingStore.changeIgnoredTrackerPrefixes(value)
}

// n-dynamic-input 默认 create 返回 undefined，这里给一个空字符串占位以便用户填写
const createCustomDownloadDir = () => ''
</script>

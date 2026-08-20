<template>
  <n-modal
    v-model:show="show"
    preset="card"
    :title="title"
    :bordered="false"
    :class="$style.dialog"
    @after-enter="focusInput"
  >
    <n-form label-placement="left" :label-width="90">
      <n-form-item :label="$t('speedLimitDialog.limit')">
        <div class="flex items-center gap-2 w-full">
          <n-input-number
            ref="inputRef"
            v-model:value="limitValue"
            :min="1"
            :precision="0"
            :placeholder="requiresValue ? undefined : $t('speedLimitDialog.unlimited')"
            class="flex-1"
            @keyup.enter="onSave"
          />
          <span class="whitespace-nowrap">KiB/s</span>
        </div>
      </n-form-item>
      <div class="text-xs opacity-60 pl-[90px]">{{ hint }}</div>
    </n-form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <n-button :disabled="loading" @click="show = false">{{ $t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="loading" :disabled="saveDisabled" @click="onSave">{{
          $t('common.confirm')
        }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { rpc } from '@/api/rpc'
import { useSessionStore } from '@/store'
import {
  buildGlobalSpeedLimitArgs,
  readGlobalSpeedLimitValue,
  resolveGlobalSpeedLimitConfig
} from '@/utils/globalSpeedLimit'
import { useMessage, type InputNumberInst } from 'naive-ui'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  direction: 'download' | 'upload'
}>()
const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{
  saved: []
}>()

const { t: $t } = useI18n()
const message = useMessage()
const sessionStore = useSessionStore()
const inputRef = useTemplateRef<InputNumberInst>('inputRef')
const limitValue = shallowRef<number | null>(null)
const loading = shallowRef(false)

const title = computed(() =>
  props.direction === 'download'
    ? $t('speedLimitDialog.downloadTitle')
    : $t('speedLimitDialog.uploadTitle')
)
const speedLimitConfig = computed(() =>
  resolveGlobalSpeedLimitConfig(sessionStore.session, props.direction)
)
const requiresValue = computed(() => speedLimitConfig.value.requiresValue)
const hint = computed(() =>
  $t(requiresValue.value ? 'speedLimitDialog.altSpeedHint' : 'speedLimitDialog.unlimitedHint')
)
const hasValidValue = computed(() => Number.isFinite(Number(limitValue.value)) && Number(limitValue.value) > 0)
const saveDisabled = computed(() => loading.value || (requiresValue.value && !hasValidValue.value))

function initValue() {
  limitValue.value = readGlobalSpeedLimitValue(sessionStore.session, speedLimitConfig.value)
}

function focusInput() {
  inputRef.value?.focus()
}

async function onSave() {
  if (loading.value) {
    return
  }

  const args = buildGlobalSpeedLimitArgs(speedLimitConfig.value, limitValue.value)
  if (!args) {
    message.warning($t('speedLimitDialog.altSpeedValueRequired'))
    return
  }

  loading.value = true
  try {
    await rpc.sessionSet(args)
    await sessionStore.fetchSession()
    message.success($t('speedLimitDialog.saveSuccess'))
    emit('saved')
    show.value = false
  } catch {
    message.error($t('speedLimitDialog.saveFailed'))
  } finally {
    loading.value = false
  }
}

watch([show, () => props.direction], ([visible]) => {
  if (visible) {
    initValue()
  }
})
</script>

<style module lang="less">
.dialog {
  width: 420px !important;
  max-width: calc(100vw - 32px) !important;
}
</style>

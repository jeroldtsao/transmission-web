<template>
  <div>
    <div class="text-lg font-medium mb-2">{{ $t('trackerLimitSettings.title') }}</div>
    <n-alert type="info" :show-icon="false" class="mb-4">
      {{ serverMode ? $t('trackerLimitSettings.serverHint') : $t('trackerLimitSettings.hint') }}
    </n-alert>
    <n-alert v-if="serverMode && siteLimitStore.lastError" type="error" :show-icon="false" class="mb-4">
      {{ $t('trackerLimitSettings.loadFailed', { message: siteLimitStore.lastError }) }}
    </n-alert>

    <!-- Transmission 4.0+：服务端带宽组模式 -->
    <template v-if="serverMode">
      <div v-if="serverRules.length === 0" class="empty-rule">
        {{ $t('trackerLimitSettings.empty') }}
      </div>
      <div v-for="rule in serverRules" :key="rule.uid" class="rule-row">
        <n-switch v-model:value="rule.enabled" :aria-label="$t('trackerLimitSettings.enabled')" />
        <n-select
          v-model:value="rule.key"
          class="pattern-input"
          :options="getServerTrackerOptions(rule.uid)"
          :placeholder="$t('trackerLimitSettings.patternPlaceholder')"
          filterable
          tag
          clearable
        />
        <n-input-number
          v-model:value="rule.uploadLimit"
          :min="1"
          :precision="0"
          :placeholder="$t('trackerLimitSettings.uploadPlaceholder')"
          clearable
          class="limit-input"
        >
          <template #suffix>KB/s ↑</template>
        </n-input-number>
        <n-input-number
          v-model:value="rule.downloadLimit"
          :min="1"
          :precision="0"
          :placeholder="$t('trackerLimitSettings.downloadPlaceholder')"
          clearable
          class="limit-input"
        >
          <template #suffix>KB/s ↓</template>
        </n-input-number>
        <n-button quaternary circle :aria-label="$t('trackerLimitSettings.remove')" @click="removeServerRule(rule)">
          <template #icon>
            <n-icon><TrashOutline /></n-icon>
          </template>
        </n-button>
        <n-text depth="3" class="rule-stats">
          {{ getServerRuleStats(rule) }}
        </n-text>
      </div>

      <n-button dashed class="add-button" @click="addServerRule">
        <template #icon>
          <n-icon><AddCircleOutline /></n-icon>
        </template>
        {{ $t('trackerLimitSettings.add') }}
      </n-button>

      <div class="maintenance">
        <n-popconfirm v-if="siteLimitStore.hasLegacyRules" @positive-click="onMigrateLegacyRules">
          <template #trigger>
            <n-button size="small" secondary type="primary" :disabled="settingStore.setting.trackerLimitRulesMigrated">
              {{ $t('trackerLimitSettings.importLegacy') }}
            </n-button>
          </template>
          {{ $t('trackerLimitSettings.importLegacyConfirm') }}
        </n-popconfirm>
        <n-popconfirm @positive-click="onRestoreGlobalLimits">
          <template #trigger>
            <n-button size="small" secondary>{{ $t('trackerLimitSettings.repairGlobal') }}</n-button>
          </template>
          {{ $t('trackerLimitSettings.repairGlobalConfirm') }}
        </n-popconfirm>
        <n-popconfirm @positive-click="onClearManagedLimits">
          <template #trigger>
            <n-button size="small" secondary type="warning">
              {{ $t('trackerLimitSettings.clearTorrentLimits') }}
            </n-button>
          </template>
          {{ $t('trackerLimitSettings.clearTorrentLimitsConfirm') }}
        </n-popconfirm>
      </div>
      <n-text depth="3" class="save-state">
        {{ saving ? $t('trackerLimitSettings.saving') : $t('trackerLimitSettings.autoSaved') }}
      </n-text>
    </template>

    <!-- 旧版 daemon（RPC < 17）：回退到种子级限速 -->
    <template v-else>
      <div v-if="legacyRules.length === 0" class="empty-rule">
        {{ $t('trackerLimitSettings.empty') }}
      </div>
      <div v-for="(rule, index) in legacyRules" :key="rule.id" class="rule-row">
        <n-switch v-model:value="rule.enabled" :aria-label="$t('trackerLimitSettings.enabled')" />
        <n-input
          v-if="trackerOptions.length === 0"
          v-model:value="rule.pattern"
          class="pattern-input"
          :placeholder="$t('trackerLimitSettings.patternPlaceholder')"
          clearable
        />
        <n-select
          v-else
          v-model:value="rule.pattern"
          class="pattern-input"
          :options="getLegacyTrackerOptions(index)"
          :placeholder="$t('trackerLimitSettings.patternPlaceholder')"
          filterable
          tag
          clearable
        />
        <n-input-number
          v-model:value="rule.uploadLimit"
          :min="1"
          :precision="0"
          :placeholder="$t('trackerLimitSettings.uploadPlaceholder')"
          clearable
          class="limit-input"
        >
          <template #suffix>KB/s ↑</template>
        </n-input-number>
        <n-input-number
          v-model:value="rule.downloadLimit"
          :min="1"
          :precision="0"
          :placeholder="$t('trackerLimitSettings.downloadPlaceholder')"
          clearable
          class="limit-input"
        >
          <template #suffix>KB/s ↓</template>
        </n-input-number>
        <n-button
          quaternary
          circle
          :disabled="index === 0"
          :aria-label="$t('trackerLimitSettings.moveUp')"
          @click="moveLegacyRule(index, -1)"
        >
          <template #icon>
            <n-icon><ArrowUpOutline /></n-icon>
          </template>
        </n-button>
        <n-button
          quaternary
          circle
          :disabled="index === legacyRules.length - 1"
          :aria-label="$t('trackerLimitSettings.moveDown')"
          @click="moveLegacyRule(index, 1)"
        >
          <template #icon>
            <n-icon><ArrowDownOutline /></n-icon>
          </template>
        </n-button>
        <n-button quaternary circle :aria-label="$t('trackerLimitSettings.remove')" @click="removeLegacyRule(index)">
          <template #icon>
            <n-icon><TrashOutline /></n-icon>
          </template>
        </n-button>
        <n-text depth="3" class="rule-stats">
          {{ getLegacyRuleStats(rule) }}
        </n-text>
      </div>

      <n-button dashed class="add-button" @click="addLegacyRule">
        <template #icon>
          <n-icon><AddCircleOutline /></n-icon>
        </template>
        {{ $t('trackerLimitSettings.add') }}
      </n-button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { useSettingStore, useSiteLimitStore, useTorrentStore, type TrackerLimitRule } from '@/store'
import { formatSpeed } from '@/utils'
import { getTorrentTrackerSites, getTrackerSiteKey, matchesTrackerHost } from '@/store/torrentUtils'
import { toSiteGroupName, type SiteLimitRule } from '@/utils/siteLimitRules'
import { AddCircleOutline, ArrowDownOutline, ArrowUpOutline, TrashOutline } from '@vicons/ionicons5'

interface EditableSiteRule extends SiteLimitRule {
  uid: string
}

const { t: $t } = useI18n()
const message = useMessage()
const settingStore = useSettingStore()
const torrentStore = useTorrentStore()
const siteLimitStore = useSiteLimitStore()

const serverMode = computed(() => siteLimitStore.serverMode)
const saving = ref(false)
const serverRules = ref<EditableSiteRule[]>([])
const lastSaved = new Map<string, string>()
let saveTimer: ReturnType<typeof setTimeout> | null = null

const trackerOptions = computed(() =>
  torrentStore.trackerOptions
    .filter((item) => item.key !== 'all' && item.key !== 'noTracker')
    .map((item) => ({ label: item.label, value: item.key }))
)

const ruleSignature = (rule: SiteLimitRule) =>
  JSON.stringify([rule.enabled === true, rule.uploadLimit ?? null, rule.downloadLimit ?? null])

const syncServerRules = () => {
  serverRules.value = siteLimitStore.rules.map((rule) => ({
    uid: `${rule.key}-${Math.random().toString(36).slice(2, 8)}`,
    ...rule
  }))
  lastSaved.clear()
  serverRules.value.forEach((rule) => lastSaved.set(rule.key, ruleSignature(rule)))
}

function getServerTrackerOptions(currentUid: string) {
  const selectedByOtherRules = new Set(
    serverRules.value
      .filter((rule) => rule.uid !== currentUid && typeof rule.key === 'string' && rule.key.trim())
      .map((rule) => getTrackerSiteKey(rule.key, settingStore.setting.ignoredTrackerPrefixes))
  )
  return trackerOptions.value.map((option) => {
    const selected = selectedByOtherRules.has(option.value)
    return {
      ...option,
      disabled: selected,
      label: selected ? `${option.label} · ${$t('trackerLimitSettings.configured')}` : option.label
    }
  })
}

const speedStats = computed(() => siteLimitStore.speedByGroup)

function getServerRuleStats(rule: EditableSiteRule) {
  const key = rule.key ? getTrackerSiteKey(rule.key, settingStore.setting.ignoredTrackerPrefixes) : ''
  const stats = key ? speedStats.value.get(toSiteGroupName(key)) : undefined
  return $t('trackerLimitSettings.liveStats', {
    count: stats?.count || 0,
    upload: formatSpeed(stats?.upload || 0),
    download: formatSpeed(stats?.download || 0)
  })
}

function addServerRule() {
  serverRules.value.push({
    uid: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key: '',
    enabled: true,
    uploadLimit: null,
    downloadLimit: null
  })
}

async function removeServerRule(rule: EditableSiteRule) {
  const key = rule.key ? getTrackerSiteKey(rule.key, settingStore.setting.ignoredTrackerPrefixes) : ''
  serverRules.value = serverRules.value.filter((item) => item.uid !== rule.uid)
  if (!key) {
    return
  }
  lastSaved.delete(key)
  try {
    await siteLimitStore.removeRule(key)
    message.success($t('trackerLimitSettings.saveSuccess'))
  } catch {
    message.error($t('trackerLimitSettings.saveFailed'))
  }
}

async function flushServerRules() {
  if (saving.value) {
    scheduleSave()
    return
  }
  const pending = serverRules.value.filter((rule) => {
    const key = typeof rule.key === 'string' ? rule.key.trim() : ''
    return key && lastSaved.get(getTrackerSiteKey(key, settingStore.setting.ignoredTrackerPrefixes)) !== ruleSignature(rule)
  })
  if (pending.length === 0) {
    return
  }
  saving.value = true
  try {
    let changed = false
    for (const rule of pending) {
      const saved = await siteLimitStore.saveRule(rule)
      rule.key = saved.key
      lastSaved.set(saved.key, ruleSignature(rule))
      changed = true
    }
    if (changed) {
      await siteLimitStore.applyAssignments()
    }
  } catch {
    message.error($t('trackerLimitSettings.saveFailed'))
  } finally {
    saving.value = false
  }
}

function scheduleSave() {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
  saveTimer = setTimeout(() => {
    saveTimer = null
    void flushServerRules()
  }, 800)
}

watch(
  () => serverRules.value.map((rule) => [rule.uid, rule.key, rule.enabled, rule.uploadLimit, rule.downloadLimit]),
  () => {
    if (serverMode.value) {
      scheduleSave()
    }
  },
  { deep: true }
)

async function onMigrateLegacyRules() {
  try {
    const result = await siteLimitStore.migrateLegacyRules()
    syncServerRules()
    message.success(
      $t('trackerLimitSettings.importLegacySuccess', {
        rules: result.rules,
        torrents: result.assigned + result.cleared,
        limits: result.clearedUpload + result.clearedDownload
      })
    )
  } catch {
    message.error($t('trackerLimitSettings.saveFailed'))
  }
}

async function onRestoreGlobalLimits() {
  try {
    const count = await siteLimitStore.restoreGlobalLimits()
    message.success($t('trackerLimitSettings.repairGlobalSuccess', { count }))
  } catch {
    message.error($t('trackerLimitSettings.saveFailed'))
  }
}

async function onClearManagedLimits() {
  try {
    const count = await siteLimitStore.clearManagedTorrentLimits()
    message.success($t('trackerLimitSettings.clearTorrentLimitsSuccess', { count }))
  } catch {
    message.error($t('trackerLimitSettings.saveFailed'))
  }
}

// ---------------------------------- 旧版规则（RPC < 17） ----------------------------------

const legacyRules = computed(() => settingStore.setting.trackerLimitRules as TrackerLimitRule[])

function getLegacyTrackerOptions(currentIndex: number) {
  const selectedByOtherRules = new Set(
    legacyRules.value
      .filter((rule, index) => index !== currentIndex && typeof rule?.pattern === 'string' && rule.pattern.trim())
      .map((rule) => getTrackerSiteKey(rule.pattern, settingStore.setting.ignoredTrackerPrefixes))
  )
  return trackerOptions.value.map((option) => ({
    ...option,
    disabled: selectedByOtherRules.has(option.value),
    label: selectedByOtherRules.has(option.value)
      ? `${option.label} · ${$t('trackerLimitSettings.configured')}`
      : option.label
  }))
}

function getLegacyRuleStats(rule: TrackerLimitRule) {
  const ignoredPrefixes = settingStore.setting.ignoredTrackerPrefixes
  let count = 0
  let upload = 0
  let download = 0
  if (rule?.enabled && typeof rule.pattern === 'string' && rule.pattern.trim()) {
    const pattern = getTrackerSiteKey(rule.pattern, ignoredPrefixes)
    torrentStore.torrents.forEach((torrent) => {
      const sites = getTorrentTrackerSites(torrent, ignoredPrefixes)
      if (matchesTrackerHost(sites, pattern)) {
        count += 1
        upload += torrent.rateUpload || 0
        download += torrent.rateDownload || 0
      }
    })
  }
  return $t('trackerLimitSettings.liveStats', {
    count,
    upload: formatSpeed(upload),
    download: formatSpeed(download)
  })
}

function addLegacyRule() {
  legacyRules.value.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    pattern: '',
    uploadLimit: null,
    downloadLimit: null
  })
}

function removeLegacyRule(index: number) {
  legacyRules.value.splice(index, 1)
}

function moveLegacyRule(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= legacyRules.value.length) {
    return
  }
  const [rule] = legacyRules.value.splice(index, 1)
  legacyRules.value.splice(target, 0, rule)
}

onMounted(async () => {
  const loaded = await siteLimitStore.ensureLoaded(true)
  if (loaded) {
    syncServerRules()
  }
})

onBeforeUnmount(() => {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    void flushServerRules()
  }
})
</script>

<style scoped lang="less">
.empty-rule {
  color: var(--text-color-3);
  margin-bottom: 12px;
}

.rule-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.pattern-input {
  flex: 1 1 220px;
  min-width: 150px;
}

.limit-input {
  width: 150px;
}

.add-button {
  margin-top: 4px;
}

.rule-stats {
  flex: 1 0 100%;
  padding-left: 28px;
  font-size: 12px;
}

.maintenance {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.save-state {
  display: block;
  margin-top: 8px;
  font-size: 12px;
}

@media (max-width: 640px) {
  .rule-row {
    align-items: flex-start;
  }

  .pattern-input {
    flex: 1 1 calc(100% - 44px);
  }

  .limit-input {
    flex: 1 1 140px;
  }
}
</style>

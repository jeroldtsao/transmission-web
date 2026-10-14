import { rpc } from '@/api/rpc'
import { useSettingStore } from './setting'
import { useTorrentStore } from './torrent'
import { getTorrentTrackerSites } from './torrentUtils'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  buildSiteLimitGroupArgs,
  fromSiteGroupName,
  normalizeSiteKey,
  parseSiteLimitGroup,
  planLegacyMigration,
  planSiteGroupAssignments,
  toSiteGroupName,
  type SiteAssignmentTorrent,
  type SiteLimitRule
} from '@/utils/siteLimitRules'

const TORRENT_SET_CHUNK_SIZE = 1000

const chunkIds = (ids: number[], size = TORRENT_SET_CHUNK_SIZE) => {
  const chunks: number[][] = []
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size))
  }
  return chunks
}

/**
 * 站点限速（服务端带宽组模式）。
 *
 * 规则存放在 daemon 的带宽组里（组名 `site:<站点键>`），限速由 Transmission 自己执行；
 * 种子归属由服务端同步任务持续维护，这里只负责规则读写、迁移和一次性修复动作。
 */
export const useSiteLimitStore = defineStore('siteLimit', () => {
  const settingStore = useSettingStore()
  const torrentStore = useTorrentStore()

  const rules = ref<SiteLimitRule[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const lastError = ref('')

  const serverMode = computed(() => settingStore.siteLimitServerEnabled === true)
  const enabledRules = computed(() => rules.value.filter((rule) => rule.enabled && (rule.uploadLimit || rule.downloadLimit)))

  const ignoredPrefixes = () => settingStore.setting.ignoredTrackerPrefixes || []

  const collectAssignments = (): SiteAssignmentTorrent[] =>
    torrentStore.torrents.map((torrent) => ({
      id: torrent.id,
      group: torrent.group,
      sites: getTorrentTrackerSites(torrent, ignoredPrefixes())
    }))

  async function loadRules() {
    if (!serverMode.value) {
      loaded.value = true
      return false
    }
    loading.value = true
    try {
      const res = await rpc.groupGet()
      const groups = res?.arguments?.group || []
      rules.value = groups
        .map((group) => parseSiteLimitGroup(group))
        .filter((rule): rule is SiteLimitRule => rule !== null)
        .sort((a, b) => a.key.localeCompare(b.key))
      lastError.value = ''
      loaded.value = true
      return true
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      return false
    } finally {
      loading.value = false
    }
  }

  async function ensureLoaded(force = false) {
    if (!serverMode.value) {
      return false
    }
    if (loaded.value && !force) {
      return true
    }
    return await loadRules()
  }

  // 会话信息返回后才能确定执行方式（RPC >= 17 用带宽组）
  watch(
    () => settingStore.siteLimitServerEnabled,
    (value) => {
      if (value === true && !loaded.value && !loading.value) {
        void loadRules()
      }
    },
    { immediate: true }
  )

  function upsertLocalRule(rule: SiteLimitRule) {
    const index = rules.value.findIndex((item) => item.key === rule.key)
    if (index >= 0) {
      rules.value[index] = rule
    } else {
      rules.value.push(rule)
      rules.value.sort((a, b) => a.key.localeCompare(b.key))
    }
  }

  function removeLocalRule(key: string) {
    rules.value = rules.value.filter((item) => item.key !== key)
  }

  /** 写入一条规则（带宽组），并返回归一化后的规则。 */
  async function saveRule(input: SiteLimitRule) {
    const rule: SiteLimitRule = { ...input, key: normalizeSiteKey(input.key, ignoredPrefixes()) }
    if (!rule.key) {
      throw new Error('empty site key')
    }
    await rpc.groupSet(buildSiteLimitGroupArgs(rule))
    upsertLocalRule(rule)
    return rule
  }

  /** 删除规则：清空带宽组限速（daemon 不支持删除组），并解除种子归属。 */
  async function removeRule(key: string) {
    await rpc.groupSet(buildSiteLimitGroupArgs({ key, enabled: false, uploadLimit: null, downloadLimit: null }))
    removeLocalRule(key)
    await applyAssignments()
  }

  let assignmentQueue: Promise<{ assigned: number; cleared: number }> = Promise.resolve({ assigned: 0, cleared: 0 })

  /** 根据规则计算并把种子归属同步到带宽组（串行执行，避免并发写）。 */
  async function runAssignments(nextRules: SiteLimitRule[]) {
    const plan = planSiteGroupAssignments(collectAssignments(), nextRules)
    const assignments = [...plan.assign.entries()]
    let assigned = 0
    for (const [group, ids] of assignments) {
      for (const chunk of chunkIds(ids)) {
        // 同时恢复全局限速：否则种子会连带宽组限速一起绕过
        await rpc.torrentSet({ ids: chunk, group, honorsSessionLimits: true })
        assigned += chunk.length
      }
    }
    if (plan.cleared.length > 0) {
      for (const chunk of chunkIds(plan.cleared)) {
        await rpc.torrentSet({ ids: chunk, group: '' })
      }
    }
    // 本地先乐观更新，避免等待下一轮轮询
    const groupByTorrent = new Map<number, string>()
    assignments.forEach(([group, ids]) => ids.forEach((id) => groupByTorrent.set(id, group)))
    const clearedSet = new Set(plan.cleared)
    torrentStore.torrents.forEach((torrent) => {
      if (groupByTorrent.has(torrent.id)) {
        torrent.group = groupByTorrent.get(torrent.id)
        torrent.honorsSessionLimits = true
      } else if (clearedSet.has(torrent.id)) {
        torrent.group = ''
      }
    })
    return { assigned, cleared: plan.cleared.length }
  }

  function applyAssignments(nextRules: SiteLimitRule[] = rules.value) {
    const run = assignmentQueue.then(
      () => runAssignments(nextRules),
      () => runAssignments(nextRules)
    )
    assignmentQueue = run.catch(() => ({ assigned: 0, cleared: 0 }))
    return run
  }

  // 零安装模式：页面打开时自动维护种子归属，限速本身由 daemon 的带宽组执行，
  // 因此归属写好后即使关闭页面，限速也持续生效。
  let assignmentSyncTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    () => torrentStore.fetchTick,
    () => {
      if (!serverMode.value || enabledRules.value.length === 0 || assignmentSyncTimer) {
        return
      }
      assignmentSyncTimer = setTimeout(() => {
        assignmentSyncTimer = null
        void applyAssignments().catch(() => undefined)
      }, 1500)
    }
  )

  /** 旧的 localStorage 规则是否存在。 */
  const legacyRules = computed(() => (settingStore.setting.trackerLimitRules || []).filter((rule) => rule?.pattern?.trim()))
  const hasLegacyRules = computed(() => legacyRules.value.length > 0)

  /**
   * 把旧版 localStorage 规则迁移成服务端带宽组：
   * 1. 按站点键去重后写入带宽组；
   * 2. 清理旧规则写入且数值仍然一致的种子级限速；
   * 3. 同步种子归属。
   */
  async function migrateLegacyRules() {
    const plan = planLegacyMigration(
      torrentStore.torrents.map((torrent) => ({
        id: torrent.id,
        group: torrent.group,
        sites: getTorrentTrackerSites(torrent, ignoredPrefixes()),
        uploadLimited: torrent.uploadLimited,
        uploadLimit: torrent.uploadLimit,
        downloadLimited: torrent.downloadLimited,
        downloadLimit: torrent.downloadLimit
      })),
      legacyRules.value,
      ignoredPrefixes()
    )
    for (const rule of plan.rules) {
      await rpc.groupSet(buildSiteLimitGroupArgs(rule))
    }
    if (plan.clearUploadIds.length > 0) {
      for (const chunk of chunkIds(plan.clearUploadIds)) {
        await rpc.torrentSet({ ids: chunk, uploadLimited: false, honorsSessionLimits: true })
      }
    }
    if (plan.clearDownloadIds.length > 0) {
      for (const chunk of chunkIds(plan.clearDownloadIds)) {
        await rpc.torrentSet({ ids: chunk, downloadLimited: false, honorsSessionLimits: true })
      }
    }
    await loadRules()
    const applied = await applyAssignments()
    settingStore.setTrackerLimitRulesMigrated(true)
    return {
      rules: plan.rules.length,
      clearedUpload: plan.clearUploadIds.length,
      clearedDownload: plan.clearDownloadIds.length,
      ...applied
    }
  }

  /**
   * 一次性修复：让所有种子重新遵守会话（全局/备用）限速。
   * 种子级限速依然生效，但会被全局限速兜底（取二者最小值）。
   */
  async function restoreGlobalLimits() {
    const torrentById = new Map(torrentStore.torrents.map((torrent) => [torrent.id, torrent]))
    const ids = torrentStore.torrents
      .filter((torrent) => torrent.honorsSessionLimits === false)
      .map((torrent) => torrent.id)
    for (const chunk of chunkIds(ids)) {
      await rpc.torrentSet({ ids: chunk, honorsSessionLimits: true })
    }
    ids.forEach((id) => {
      const torrent = torrentById.get(id)
      if (torrent) {
        torrent.honorsSessionLimits = true
      }
    })
    return ids.length
  }

  /** 清理已归入 site: 组的种子的种子级限速，避免旧的单种限速继续压制站点带宽组。 */
  async function clearManagedTorrentLimits() {
    const torrentById = new Map(torrentStore.torrents.map((torrent) => [torrent.id, torrent]))
    const ids = torrentStore.torrents
      .filter((torrent) => fromSiteGroupName(torrent.group) && (torrent.uploadLimited || torrent.downloadLimited))
      .map((torrent) => torrent.id)
    for (const chunk of chunkIds(ids)) {
      await rpc.torrentSet({
        ids: chunk,
        uploadLimited: false,
        downloadLimited: false,
        honorsSessionLimits: true
      })
    }
    ids.forEach((id) => {
      const torrent = torrentById.get(id)
      if (torrent) {
        torrent.uploadLimited = false
        torrent.downloadLimited = false
        torrent.honorsSessionLimits = true
      }
    })
    return ids.length
  }

  /** 统计某个站点组当前的实时速度（用于设置页/状态栏展示）。 */
  const speedByGroup = computed(() => {
    const stats = new Map<string, { count: number; upload: number; download: number }>()
    torrentStore.torrents.forEach((torrent) => {
      const key = fromSiteGroupName(torrent.group)
      if (!key) {
        return
      }
      const group = toSiteGroupName(key)
      const current = stats.get(group) || { count: 0, upload: 0, download: 0 }
      current.count += 1
      current.upload += torrent.rateUpload || 0
      current.download += torrent.rateDownload || 0
      stats.set(group, current)
    })
    return stats
  })

  return {
    rules,
    enabledRules,
    loaded,
    loading,
    lastError,
    serverMode,
    legacyRules,
    hasLegacyRules,
    speedByGroup,
    ensureLoaded,
    loadRules,
    saveRule,
    removeRule,
    applyAssignments,
    migrateLegacyRules,
    restoreGlobalLimits,
    clearManagedTorrentLimits
  }
})

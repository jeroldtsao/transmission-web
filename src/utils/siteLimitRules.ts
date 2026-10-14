/**
 * 站点限速（服务端带宽组模式）的纯函数实现。
 *
 * Transmission 4 支持带宽组（bandwidth group）：种子可以加入一个组，
 * 组上的上传/下载限速由 daemon 直接执行，组内种子共享同一个速度预算。
 * 这里约定组名前缀为 `site:`，组名后缀为归一化后的站点键（如 site:chdbits.org），
 * 规则本身存放在 daemon 里，前端只负责编辑组配置与计算种子归属。
 */

export const SITE_GROUP_PREFIX = 'site:'

export interface SiteLimitRule {
  /** 归一化后的站点键，如 chdbits.org */
  key: string
  /** 规则是否生效（关闭后保留数值但不再限速，也不再归属于该组） */
  enabled: boolean
  /** 上传限速 KB/s，null 表示不限 */
  uploadLimit: number | null
  /** 下载限速 KB/s，null 表示不限 */
  downloadLimit: number | null
}

/**
 * daemon 返回的带宽组结构。
 * Transmission 4.1 走 JSON-RPC 1.0 兼容层时会返回旧的连字符命名（speed-limit-up），
 * 走 JSON-RPC 2.0 时返回 snake_case（speed_limit_up），这里两种都兼容。
 */
export interface SiteLimitGroup {
  name?: string
  honors_session_limits?: boolean
  honorsSessionLimits?: boolean
  'speed-limit-up'?: number
  'speed-limit-up-enabled'?: boolean
  'speed-limit-down'?: number
  'speed-limit-down-enabled'?: boolean
  speed_limit_up?: number
  speed_limit_up_enabled?: boolean
  speed_limit_down?: number
  speed_limit_down_enabled?: boolean
}

export interface SiteLimitGroupSetArgs {
  name: string
  honors_session_limits: boolean
  speed_limit_up: number
  speed_limit_up_enabled: boolean
  speed_limit_down: number
  speed_limit_down_enabled: boolean
}

export interface SiteAssignmentTorrent {
  id: number
  group?: string
  sites: Set<string>
  /** 种子级限速信息（迁移旧规则时用于判断是否需要清理） */
  uploadLimited?: boolean
  uploadLimit?: number
  downloadLimited?: boolean
  downloadLimit?: number
}

/** 旧版（localStorage）站点限速规则，用于迁移到服务端带宽组 */
export interface LegacyTrackerLimitRule {
  id?: string
  enabled?: boolean
  pattern?: string
  uploadLimit?: number | null
  downloadLimit?: number | null
}

/** 将 tracker 地址归一化为站点键：去掉协议、端口、路径，并忽略常见子域前缀。 */
export const normalizeSiteKey = (value: string, ignoredPrefixes: string[] = []) => {
  let host = typeof value === 'string' ? value.trim().toLowerCase() : ''
  try {
    host = new URL(host.includes('://') ? host : `https://${host}`).hostname.toLowerCase()
  } catch {
    host = host.replace(/^[a-z]+:\/\//, '').split('/')[0].replace(/:\d+$/, '')
  }
  const labels = host.split('.').filter(Boolean)
  if (labels.length > 2) {
    const prefix = labels[0]
    const prefixes = new Set(['www', ...ignoredPrefixes.map((item) => item.trim().toLowerCase()).filter(Boolean)])
    const isIgnoredPrefix = Array.from(prefixes).some((item) => {
      return prefix === item || (prefix.startsWith(item) && /^\d+$/.test(prefix.slice(item.length)))
    })
    if (isIgnoredPrefix) {
      labels.shift()
    }
  }
  return labels.join('.')
}

/** 站点键与种子归属站点是否匹配（允许子域）。 */
export const matchesSiteKey = (sites: Iterable<string>, key: string) => {
  for (const host of sites) {
    if (host === key || host.endsWith(`.${key}`)) {
      return true
    }
  }
  return false
}

export const toSiteGroupName = (key: string) => `${SITE_GROUP_PREFIX}${key}`

export const fromSiteGroupName = (name: string | undefined | null) => {
  if (typeof name !== 'string' || !name.startsWith(SITE_GROUP_PREFIX)) {
    return ''
  }
  return name.slice(SITE_GROUP_PREFIX.length).trim()
}

const normalizeLimit = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null
}

const readGroupNumber = (group: SiteLimitGroup, ...names: string[]) => {
  const record = group as Record<string, unknown>
  for (const name of names) {
    const value = record?.[name]
    if (typeof value === 'number') {
      return value
    }
  }
  return undefined
}

const readGroupBoolean = (group: SiteLimitGroup, ...names: string[]) => {
  const record = group as Record<string, unknown>
  for (const name of names) {
    const value = record?.[name]
    if (typeof value === 'boolean') {
      return value
    }
  }
  return undefined
}

const SITE_GROUP_UP_KEYS = ['speed_limit_up', 'speed-limit-up']
const SITE_GROUP_UP_ENABLED_KEYS = ['speed_limit_up_enabled', 'speed-limit-up-enabled']
const SITE_GROUP_DOWN_KEYS = ['speed_limit_down', 'speed-limit-down']
const SITE_GROUP_DOWN_ENABLED_KEYS = ['speed_limit_down_enabled', 'speed-limit-down-enabled']

/** 带宽组 → 前端规则 */
export const parseSiteLimitGroup = (group: SiteLimitGroup): SiteLimitRule | null => {
  const key = fromSiteGroupName(group?.name)
  if (!key) {
    return null
  }
  const uploadLimit = normalizeLimit(readGroupNumber(group, ...SITE_GROUP_UP_KEYS))
  const downloadLimit = normalizeLimit(readGroupNumber(group, ...SITE_GROUP_DOWN_KEYS))
  const enabled =
    (uploadLimit !== null && readGroupBoolean(group, ...SITE_GROUP_UP_ENABLED_KEYS) === true) ||
    (downloadLimit !== null && readGroupBoolean(group, ...SITE_GROUP_DOWN_ENABLED_KEYS) === true)
  // 清空后的组等价于“已删除”（daemon 不提供删除带宽组的接口），不在规则列表里展示
  if (!enabled && uploadLimit === null && downloadLimit === null) {
    return null
  }
  return { key, enabled, uploadLimit, downloadLimit }
}

/** 前端规则 → group-set 参数；关闭的规则保留数值但禁用限速。 */
export const buildSiteLimitGroupArgs = (rule: SiteLimitRule): SiteLimitGroupSetArgs => {
  const uploadLimit = normalizeLimit(rule.uploadLimit)
  const downloadLimit = normalizeLimit(rule.downloadLimit)
  const enabled = rule.enabled === true
  return {
    name: toSiteGroupName(rule.key),
    honors_session_limits: true,
    speed_limit_up: uploadLimit ?? 0,
    speed_limit_up_enabled: enabled && uploadLimit !== null,
    speed_limit_down: downloadLimit ?? 0,
    speed_limit_down_enabled: enabled && downloadLimit !== null
  }
}

export const isSiteLimitRuleActive = (rule: SiteLimitRule) =>
  rule.enabled === true && (normalizeLimit(rule.uploadLimit) !== null || normalizeLimit(rule.downloadLimit) !== null)

/** 按站点键匹配规则：命中规则时取最长（最具体）的键，避免短键覆盖长键。 */
export const findSiteLimitRule = (sites: Iterable<string>, rules: SiteLimitRule[]): SiteLimitRule | null => {
  const siteList = Array.from(sites)
  let matched: SiteLimitRule | null = null
  for (const rule of rules) {
    if (!rule?.key || !isSiteLimitRuleActive(rule)) {
      continue
    }
    if (!matchesSiteKey(siteList, rule.key)) {
      continue
    }
    if (!matched || rule.key.length > matched.key.length) {
      matched = rule
    }
  }
  return matched
}

export interface SiteAssignmentPlan {
  /** 目标组名 → 需要设置该组的种子 id */
  assign: Map<string, number[]>
  /** 需要从 site: 组里移除归属的种子 id */
  cleared: number[]
}

/**
 * 计算种子归属变更。
 * - 命中规则但 group 不一致 → 分配到 site:<key>
 * - 没有命中规则但当前在 site: 组 → 清空 group
 * - 其它分组（如用户自建的 HighPriority）不处理
 */
export const planSiteGroupAssignments = (
  torrents: SiteAssignmentTorrent[],
  rules: SiteLimitRule[]
): SiteAssignmentPlan => {
  const assign = new Map<string, number[]>()
  const cleared: number[] = []
  for (const torrent of torrents) {
    const rule = findSiteLimitRule(torrent.sites, rules)
    const desired = rule ? toSiteGroupName(rule.key) : ''
    const current = typeof torrent.group === 'string' ? torrent.group : ''
    if (desired === current) {
      continue
    }
    if (desired) {
      // 用户自建的分组（非 site: 开头）尊重用户手动配置，不强行覆盖
      if (current && !current.startsWith(SITE_GROUP_PREFIX)) {
        continue
      }
      const ids = assign.get(desired) || []
      ids.push(torrent.id)
      assign.set(desired, ids)
    } else if (current.startsWith(SITE_GROUP_PREFIX)) {
      cleared.push(torrent.id)
    }
  }
  return { assign, cleared }
}

export interface LegacyMigrationPlan {
  /** 迁移后的站点限速规则（按站点键去重，保留先出现的规则） */
  rules: SiteLimitRule[]
  /** 需要清理上传单种限速的种子 id（旧规则写入的值仍然一致） */
  clearUploadIds: number[]
  /** 需要清理下载单种限速的种子 id */
  clearDownloadIds: number[]
}

/**
 * 把旧版 localStorage 规则迁移成服务端带宽组规则，并找出需要清理的种子级限速。
 * 只清理“单种限速值仍等于旧规则值”的种子，避免误伤用户手动设置的其他限速。
 */
export const planLegacyMigration = (
  torrents: SiteAssignmentTorrent[],
  legacyRules: LegacyTrackerLimitRule[],
  ignoredPrefixes: string[] = []
): LegacyMigrationPlan => {
  const rules: SiteLimitRule[] = []
  const legacyMatchers: { rule: LegacyTrackerLimitRule; key: string; uploadLimit: number | null; downloadLimit: number | null; enabled: boolean }[] = []
  for (const legacy of legacyRules || []) {
    const pattern = typeof legacy?.pattern === 'string' ? legacy.pattern.trim() : ''
    if (!pattern) {
      continue
    }
    const key = normalizeSiteKey(pattern, ignoredPrefixes)
    if (!key) {
      continue
    }
    const uploadLimit = normalizeLimit(legacy.uploadLimit)
    const downloadLimit = normalizeLimit(legacy.downloadLimit)
    if (uploadLimit === null && downloadLimit === null) {
      continue
    }
    legacyMatchers.push({ rule: legacy, key, uploadLimit, downloadLimit, enabled: legacy.enabled !== false })
    if (!rules.some((item) => item.key === key)) {
      rules.push({ key, enabled: legacy.enabled !== false, uploadLimit, downloadLimit })
    }
  }

  const clearUploadIds = new Set<number>()
  const clearDownloadIds = new Set<number>()
  for (const torrent of torrents) {
    const matched = legacyMatchers.find((item) => item.enabled && matchesSiteKey(torrent.sites, item.key))
    if (!matched) {
      continue
    }
    if (
      matched.uploadLimit !== null &&
      torrent.uploadLimited === true &&
      normalizeLimit(torrent.uploadLimit) === matched.uploadLimit
    ) {
      clearUploadIds.add(torrent.id)
    }
    if (
      matched.downloadLimit !== null &&
      torrent.downloadLimited === true &&
      normalizeLimit(torrent.downloadLimit) === matched.downloadLimit
    ) {
      clearDownloadIds.add(torrent.id)
    }
  }

  return { rules, clearUploadIds: [...clearUploadIds], clearDownloadIds: [...clearDownloadIds] }
}

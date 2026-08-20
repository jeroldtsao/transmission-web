export type SpeedLimitDirection = 'download' | 'upload'

type SpeedLimitKey = 'speed-limit-down' | 'speed-limit-up' | 'alt-speed-down' | 'alt-speed-up'
type SpeedLimitEnabledKey = 'speed-limit-down-enabled' | 'speed-limit-up-enabled'

type SpeedLimitSession = Partial<{
  'alt-speed-enabled': boolean
  'alt-speed-down': number
  'alt-speed-up': number
  'speed-limit-down': number
  'speed-limit-down-enabled': boolean
  'speed-limit-up': number
  'speed-limit-up-enabled': boolean
}>

export type GlobalSpeedLimitArgs = Partial<{
  'alt-speed-down': number
  'alt-speed-up': number
  'speed-limit-down': number
  'speed-limit-down-enabled': boolean
  'speed-limit-up': number
  'speed-limit-up-enabled': boolean
}>

export interface GlobalSpeedLimitConfig {
  limitKey: SpeedLimitKey
  enabledKey: SpeedLimitEnabledKey | null
  requiresValue: boolean
}

export function resolveGlobalSpeedLimitConfig(
  session: SpeedLimitSession | null | undefined,
  direction: SpeedLimitDirection
): GlobalSpeedLimitConfig {
  if (session?.['alt-speed-enabled']) {
    return {
      limitKey: direction === 'download' ? 'alt-speed-down' : 'alt-speed-up',
      enabledKey: null,
      requiresValue: true
    }
  }

  return {
    limitKey: direction === 'download' ? 'speed-limit-down' : 'speed-limit-up',
    enabledKey: direction === 'download' ? 'speed-limit-down-enabled' : 'speed-limit-up-enabled',
    requiresValue: false
  }
}

export function readGlobalSpeedLimitValue(
  session: SpeedLimitSession | null | undefined,
  config: GlobalSpeedLimitConfig
): number | null {
  const enabled = config.enabledKey === null || Boolean(session?.[config.enabledKey])
  const value = Number(session?.[config.limitKey])
  return enabled && Number.isFinite(value) && value > 0 ? value : null
}

export function buildGlobalSpeedLimitArgs(
  config: GlobalSpeedLimitConfig,
  value: number | null
): GlobalSpeedLimitArgs | null {
  const numericValue = Number(value)
  const enabled = Number.isFinite(numericValue) && numericValue > 0
  if (config.requiresValue && !enabled) {
    return null
  }

  const args: GlobalSpeedLimitArgs = {}
  if (config.enabledKey !== null) {
    args[config.enabledKey] = enabled
  }
  if (enabled) {
    args[config.limitKey] = Math.round(numericValue)
  }
  return args
}

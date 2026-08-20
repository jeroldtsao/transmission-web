import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildGlobalSpeedLimitArgs,
  readGlobalSpeedLimitValue,
  resolveGlobalSpeedLimitConfig
} from './globalSpeedLimit.js'

test('uses the active alternative download limit when alternative speed is enabled', () => {
  const session = {
    'alt-speed-enabled': true,
    'alt-speed-down': 50,
    'speed-limit-down': 100,
    'speed-limit-down-enabled': true
  }

  const config = resolveGlobalSpeedLimitConfig(session, 'download')

  assert.deepEqual(config, {
    limitKey: 'alt-speed-down',
    enabledKey: null,
    requiresValue: true
  })
  assert.equal(readGlobalSpeedLimitValue(session, config), 50)
})

test('uses the normal upload limit and respects its enabled flag', () => {
  const session = {
    'alt-speed-enabled': false,
    'speed-limit-up': 80,
    'speed-limit-up-enabled': false
  }

  const config = resolveGlobalSpeedLimitConfig(session, 'upload')

  assert.deepEqual(config, {
    limitKey: 'speed-limit-up',
    enabledKey: 'speed-limit-up-enabled',
    requiresValue: false
  })
  assert.equal(readGlobalSpeedLimitValue(session, config), null)
})

test('builds normal and alternative session-set payloads with different empty-value behavior', () => {
  const normalConfig = resolveGlobalSpeedLimitConfig({ 'alt-speed-enabled': false }, 'download')
  const alternativeConfig = resolveGlobalSpeedLimitConfig({ 'alt-speed-enabled': true }, 'upload')

  assert.deepEqual(buildGlobalSpeedLimitArgs(normalConfig, null), {
    'speed-limit-down-enabled': false
  })
  assert.deepEqual(buildGlobalSpeedLimitArgs(normalConfig, 42.6), {
    'speed-limit-down-enabled': true,
    'speed-limit-down': 43
  })
  assert.equal(buildGlobalSpeedLimitArgs(alternativeConfig, null), null)
  assert.deepEqual(buildGlobalSpeedLimitArgs(alternativeConfig, 64), {
    'alt-speed-up': 64
  })
})
